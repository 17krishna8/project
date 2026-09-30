import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { generateRecord } from "../generator/generate.js";
import { createRandom, hashString } from "../generator/random.js";
import { SpecError } from "../spec/errors.js";
import { parseSpecFile, parseSpecText, validateSpecDocument, type SpecVersion } from "../spec/loader.js";
import { inferRoutes } from "../spec/routes.js";
import { DEFAULT_STORE_OPTIONS, Store, type StoreOptions } from "../state/store.js";
import type {
  BootInfo,
  ChaosConfig,
  ErrorDetail,
  MockForgeOptions,
  Resource,
  Route,
  SessionRecord,
  SpecInfo
} from "../types.js";
import { resolveSessionIdentity } from "./sessions.js";
import { renderDashboardPage } from "./dashboard-page.js";
import { SpecValidator } from "./validate.js";
import { sanitizeSessionId } from "../state/store.js";

export interface MockForgeApp {
  app: FastifyInstance;
  spec: SpecInfo;
  store: Store;
  validator: SpecValidator;
  chaos: ChaosConfig;
  bootMs: number;
  startedAt: number;
  url: string;
  dashboardUrl: string;
  /** Mutable boot time, filled in by listen() and read by /__health. */
  runtime: { bootMs: number };
  /** Swaps the route table in place (hot reload); sessions and chaos survive. */
  reload: (next: {
    routes: Route[];
    resources: Resource[];
    title: string;
    version: string;
    document?: Record<string, unknown>;
  }) => void;
  /** Re-reads the spec file from disk and reloads; throws SpecError if invalid. */
  reloadFromDisk: () => Promise<{ title: string; version: string; routes: number }>;
  /** Stops the sweeper and the HTTP server. */
  close: () => Promise<void>;
}

export interface CreateOptions extends MockForgeOptions {
  dashboardDir?: string | null;
}

type HttpMethods = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";

function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details: ErrorDetail[] = []
) {
  return reply.status(status).type("application/json").send({ error: { code, message, details } });
}

/** Only JSON bodies are accepted (contract decision 8). Fastify has a built-in
 *  text/plain parser, so this has to be checked explicitly. */
/** Query parameters that shape the response rather than filter it. */
const RESERVED_QUERY = new Set(["limit", "offset", "page", "sort", "order"]);

/** Spellings of "yes, please fail this request" accepted by `X-Mock-Error`. */
const TRUTHY = new Set(["1", "true", "yes", "on"]);

function parseQuery(url: string): Record<string, string> {
  const index = url.indexOf("?");
  if (index < 0) return {};
  const params = new URLSearchParams(url.slice(index + 1));
  const out: Record<string, string> = {};
  for (const [key, value] of params) out[key] = value;
  return out;
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

function isJsonContentType(header: string | undefined): boolean {
  if (!header) return false;
  const mediaType = header.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || /^application\/[a-z0-9.+-]*\+json$/.test(mediaType);
}

/** Chaos is capped here (B1.3): 0..3000 ms of latency. */
const MAX_LATENCY_MS = 3000;

const EMPTY_FIELDS: ReadonlySet<string> = new Set();

/** One line of the request log streamed over /__admin/logs (B2). */
export interface LogEvent {
  time: string;
  session: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  fault: string | null;
  validation: string | null;
}

/** How many events the log keeps for a client that connects late. */
const LOG_HISTORY = 200;

/** Per-request notes the response hook turns into a log line. */
interface RequestNotes {
  session: string;
  startedAt: number;
  fault: string | null;
  validation: string | null;
}

const notes = new WeakMap<FastifyRequest, RequestNotes>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8"
};

/** Where the built dashboard lives when the CLI does not say otherwise:
 *  <repo>/apps/dashboard/dist, resolved next to the installed core package. */
function defaultDashboardDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../apps/dashboard/dist");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;"
  );
}

/** Matches a concrete request path against a route template like /users/{id}. */
export function matchTemplate(template: string, path: string): Record<string, string> | null {
  const templateSegments = template.split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);
  if (templateSegments.length !== pathSegments.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < templateSegments.length; index += 1) {
    const templateSegment = templateSegments[index]!;
    const pathSegment = pathSegments[index]!;
    if (templateSegment.startsWith("{") && templateSegment.endsWith("}")) {
      const name = templateSegment.slice(1, -1);
      if (pathSegment.length === 0) return null;
      params[name] = safeDecode(pathSegment);
    } else if (templateSegment !== pathSegment) {
      return null;
    }
  }
  return params;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

/** Exact paths win over parametric ones (standard REST routing). */
export function matchRoute(routes: Route[], method: string, path: string): RouteMatch | null {
  const upper = method.toUpperCase();
  for (const route of routes) {
    if (route.method === upper && route.path === path) return { route, params: {} };
  }
  for (const route of routes) {
    if (route.method !== upper || !route.path.includes("{")) continue;
    const params = matchTemplate(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

/** Methods allowed for a path (used for the 405 Allow header). */
export function allowedMethods(routes: Route[], path: string): string[] {
  const allowed = new Set<string>();
  for (const route of routes) {
    if (route.path === path) allowed.add(route.method);
  }
  for (const route of routes) {
    if (!route.path.includes("{")) continue;
    if (matchTemplate(route.path, path)) allowed.add(route.method);
  }
  return [...allowed].sort();
}

/** Builds the mock server for a spec. Throws SpecError for invalid specs.
 *  An empty specPath boots with no routes: the dashboard then shows the upload
 *  view until a spec is supplied over POST /__admin/spec. */
export async function createMockForge(options: CreateOptions): Promise<MockForgeApp> {
  const startedAt = Date.now();
  const hasSpec = options.specPath !== "";
  const { document, specVersion } = hasSpec
    ? parseSpecFile(options.specPath)
    : { document: {} as Record<string, unknown>, specVersion: "openapi3" as SpecVersion };
  if (hasSpec) await validateSpecDocument(document);
  const inferred = hasSpec ? inferRoutes(document, specVersion) : { routes: [], resources: [] };

  const info = (document.info ?? {}) as Record<string, unknown>;
  const spec: SpecInfo = {
    title: typeof info.title === "string" ? info.title : hasSpec ? "Untitled API" : "No spec loaded",
    version: typeof info.version === "string" ? info.version : hasSpec ? "0.0.0" : "-",
    specVersion,
    routes: inferred.routes,
    resources: inferred.resources,
    document,
    sourcePath: options.specPath,
    loaded: hasSpec
  };

  const storeOptions: StoreOptions = {
    sessionTtlMin: options.sessionTtlMin ?? DEFAULT_STORE_OPTIONS.sessionTtlMin,
    maxSessions: options.maxSessions ?? DEFAULT_STORE_OPTIONS.maxSessions,
    maxRecords: options.maxRecords ?? DEFAULT_STORE_OPTIONS.maxRecords
  };
  const store = new Store(storeOptions);
  let validator = new SpecValidator(document);
  const chaos: ChaosConfig = {
    latencyMs: clamp(options.latencyMs ?? 0, 0, MAX_LATENCY_MS),
    errorRate: options.errorRate ?? 0,
    split404: options.split404 ?? 50,
    split500: options.split500 ?? 50
  };
  const seed = options.seed ?? 1;
  const mode = options.mode ?? "dev";

  const runtime = { bootMs: 0 };
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  store.startSweeper();

  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const err = error as { statusCode?: number; code?: string; message?: string };
    if (err.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return sendError(reply, 413, "MOCKFORGE_BODY_TOO_LARGE", "Request body exceeds the 1 MB limit");
    }
    if (err.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      return sendError(reply, 415, "MOCKFORGE_UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
    }
    if (err.code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      // Fastify's secure JSON parser rejects both malformed JSON and the
      // prototype-pollution keys (__proto__, constructor, prototype) with this
      // one code, so the message has to cover both.
      return sendError(
        reply,
        400,
        "MOCKFORGE_INVALID_JSON_BODY",
        "Request body must be valid JSON, without the prototype-pollution keys __proto__, constructor or prototype"
      );
    }
    if (err.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      return sendError(reply, 400, "MOCKFORGE_EMPTY_BODY", "Request body must not be empty");
    }
    if (err.statusCode && err.statusCode >= 400) {
      return sendError(reply, err.statusCode, err.code ?? "MOCKFORGE_BAD_REQUEST", err.message ?? "Bad request");
    }
    request.log.error({ err }, "unhandled error");
    return sendError(reply, 500, "MOCKFORGE_INTERNAL", "Unexpected server error");
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) =>
    sendError(reply, 404, "MOCKFORGE_NOT_FOUND", `No route for ${request.method} ${request.url}`)
  );

  // --- reserved paths (never generated from a spec) -------------------------
  app.get("/__health", async () => ({
    status: "ok",
    routes: spec.routes.length,
    sessions: store.sessions.size,
    uptimeMs: Date.now() - startedAt,
    bootMs: runtime.bootMs,
    // False until a spec arrives (a server started with no spec file). The
    // dashboard shows the upload view until this flips to true.
    specLoaded: spec.loaded
  }));

  app.get("/__admin/routes", async () =>
    spec.routes.map((route) => ({
      method: route.method,
      path: route.path,
      kind: route.kind,
      resource: route.resource
    }))
  );

  app.get("/__admin/sessions", async (_request: FastifyRequest, reply: FastifyReply) =>
    reply.send(
      [...store.sessions.values()].map((session) => {
        const stats = store.stats(session);
        return {
          id: session.id,
          createdAt: new Date(session.createdAt).toISOString(),
          lastAccessAt: new Date(session.lastAccessAt).toISOString(),
          resources: stats.resources,
          records: stats.records
        };
      })
    )
  );

  app.get("/__admin/sessions/:id/data", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id?: string };
    const id = sanitizeSessionId(params.id ?? "");
    const session = store.sessions.get(id);
    if (!session) return sendError(reply, 404, "MOCKFORGE_SESSION_NOT_FOUND", `No session ${id}`);
    // Keyed by resource name, at the top level: { users: [...] }.
    const data: Record<string, SessionRecord[]> = {};
    for (const [resource, map] of session.resources) data[resource] = [...map.values()];
    return reply.send(data);
  });

  app.delete("/__admin/sessions", async (_request: FastifyRequest, reply: FastifyReply) => {
    store.resetAll();
    return reply.status(204).send();
  });

  app.delete("/__admin/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id?: string };
    const id = sanitizeSessionId(params.id ?? "");
    if (!store.sessions.has(id)) {
      return sendError(reply, 404, "MOCKFORGE_SESSION_NOT_FOUND", `No session ${id}`);
    }
    store.resetSession(id);
    return reply.status(204).send();
  });

  app.get("/__admin/chaos", async (_request: FastifyRequest, reply: FastifyReply) => reply.send({ ...chaos }));

  // Hot reload: re-read the spec from disk. An invalid file must leave the
  // current route table serving (a10.5).
  /** Parses, validates and applies a spec. Accepts the content itself (an
   *  upload) or, with no body, re-reads the file the server was started with.
   *  Throws SpecError, leaving the current routes intact, on anything invalid. */
  const applySpec = async (input: {
    content?: string;
    filename?: string;
    fromDisk: boolean;
  }): Promise<{ title: string; version: string; routes: number; resources: number }> => {
    const { document: nextDocument, specVersion: nextVersion } = input.fromDisk
      ? parseSpecFile(options.specPath)
      : parseSpecText(input.content ?? "", input.filename);
    await validateSpecDocument(nextDocument);
    const nextInferred = inferRoutes(nextDocument, nextVersion);
    const nextInfo = (nextDocument.info ?? {}) as Record<string, unknown>;
    reload({
      routes: nextInferred.routes,
      resources: nextInferred.resources,
      title: typeof nextInfo.title === "string" ? nextInfo.title : spec.title,
      version: typeof nextInfo.version === "string" ? nextInfo.version : spec.version,
      document: nextDocument
    });
    return {
      title: spec.title,
      version: spec.version,
      routes: spec.routes.length,
      resources: spec.resources.length
    };
  };

  const reloadFromDisk = async (): Promise<{ title: string; version: string; routes: number }> =>
    applySpec({ fromDisk: true });

  /** Extracts the spec text from an upload. Two shapes are accepted:
   *  {spec: "<yaml or json text>"} as JSON, or multipart/form-data with a
   *  `spec` file part. */
  const extractUpload = (request: FastifyRequest): { content: string; filename?: string } | null => {
    const contentType = request.headers["content-type"] ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      const part = (request.body as { spec?: unknown } | undefined)?.spec;
      if (part && typeof part === "object" && "toBuffer" in part) {
        // @fastify/multipart hands back a file stream; buffer it synchronously
        // is not possible, so this branch is only reached when the plugin is
        // present. Without it we fall through to the JSON shape below.
        return null;
      }
      if (typeof part === "string") return { content: part };
      return null;
    }
    const body = request.body as { spec?: unknown; content?: unknown; filename?: unknown } | undefined;
    if (typeof body?.spec === "string") {
      return {
        content: body.spec,
        filename: typeof body.filename === "string" ? body.filename : undefined
      };
    }
    if (typeof body?.content === "string") return { content: body.content };
    return null;
  };

  app.post("/__admin/spec", async (request: FastifyRequest, reply: FastifyReply) => {
    const upload = extractUpload(request);
    // Nothing that looks like spec content: the documented behaviour is to
    // re-read the file the server was started with. An empty body, or a body
    // with no spec/content key, both count.
    const looksLikeUpload = upload !== null && upload.content.trim() !== "";
    if (!looksLikeUpload) {
      try {
        const summary = await reloadFromDisk();
        return reply.send({ ...summary, reloaded: true, source: "disk" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return sendError(reply, 400, "MOCKFORGE_SPEC_INVALID", `Reload rejected: ${message}`, [
          { path: spec.sourcePath, reason: message }
        ]);
      }
    }

    if (!upload) {
      return sendError(
        reply,
        400,
        "MOCKFORGE_SPEC_INVALID",
        "Send the spec as {spec: \"<yaml or json text>\"}, or post nothing to reload the file on disk",
        []
      );
    }

    try {
      const summary = await applySpec({ ...upload, fromDisk: false });
      return reply.send({ ...summary, reloaded: true, source: "upload", filename: upload.filename ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendError(reply, 400, "MOCKFORGE_SPEC_INVALID", `Spec rejected: ${message}`, [
        { path: upload.filename ?? "$", reason: message }
      ]);
    }
  });

  app.put("/__admin/chaos", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Partial<ChaosConfig>;
    if (typeof body.latencyMs === "number") chaos.latencyMs = clamp(body.latencyMs, 0, 3000);
    if (typeof body.errorRate === "number") chaos.errorRate = clamp(body.errorRate, 0, 1);
    if (typeof body.split404 === "number") chaos.split404 = clamp(body.split404, 0, 100);
    if (typeof body.split500 === "number") chaos.split500 = clamp(body.split500, 0, 100);
    return reply.send({ ...chaos });
  });

  // --- dashboard -----------------------------------------------------------
  // The built React dashboard is served from the same origin as the API, so the
  // browser only ever talks to one host (contract decision 10).
  const dashboardDir = options.dashboardDir ?? defaultDashboardDir();
  const dashboardIndex = path.join(dashboardDir, "index.html");

  // Used when no built bundle is present: a self-contained page with the same
  // features, so /__ui is never a dead end (contract decision 10).
  const fallbackPage = (): string =>
    renderDashboardPage({
      title: spec.title,
      version: spec.version,
      routes: spec.routes.length,
      mode: context.mode
    });

  app.get("/__ui", async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!existsSync(dashboardIndex)) {
      return reply.type("text/html; charset=utf-8").send(fallbackPage());
    }
    let html = readFileSync(dashboardIndex, "utf8");
    // Tell the bundle which spec it is looking at, and which mode is live.
    // The title and version come straight out of the user's spec file, so they
    // are escaped before being embedded in markup and in a script block.
    const injection =
      `<meta name="mockforge-mode" content="${escapeHtml(context.mode)}" />` +
      `<meta name="mockforge-title" content="${escapeHtml(spec.title)}" />` +
      `<script>window.__MOCKFORGE_SPEC__ = ${JSON.stringify({
        title: spec.title,
        version: spec.version,
        routes: spec.routes.length
      }).replace(/</g, "\\u003c")};</script>`;
    html = html.includes("</head>") ? html.replace("</head>", `${injection}</head>`) : injection + html;
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/__ui/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const requested = request.url.split("?")[0] ?? "/";
    const relative = requested.replace(/^\/__ui\/?/, "");
    // Only ever serve files that exist inside the dashboard directory.
    const target = path.resolve(dashboardDir, relative);
    if (!target.startsWith(dashboardDir) || !existsSync(target) || !statSync(target).isFile()) {
      return sendError(reply, 404, "MOCKFORGE_NOT_FOUND", `No dashboard asset ${relative}`);
    }
    return reply
      .type(MIME_TYPES[path.extname(target)] ?? "application/octet-stream")
      .send(readFileSync(target));
  });

  // --- request log (SSE) ----------------------------------------------------
  const log: LogEvent[] = [];
  const logSubscribers = new Set<import("node:http").ServerResponse>();

  const broadcast = (event: LogEvent): void => {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const subscriber of logSubscribers) subscriber.write(line);
  };

  app.get("/__admin/logs", async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    raw.write(": connected\n\n");
    for (const event of log.slice(-20)) raw.write(`data: ${JSON.stringify(event)}\n\n`);
    logSubscribers.add(raw);
    const unsubscribe = () => logSubscribers.delete(raw);
    raw.on("close", unsubscribe);
    raw.on("error", unsubscribe);
    return reply;
  });

  // --- generated routes -----------------------------------------------------
  // One catch-all dispatches against the current route table, so a hot reload
  // can swap the table without losing sessions, chaos settings or the socket.
  // One deterministic stream for fault decisions, so a run with a given seed
  // always produces the same shape of traffic.
  const chaosRandom = createRandom(hashString(`${seed}:chaos`));
  const context = { seed, chaos, mode, chaosRandom };
  // Every served request becomes one log line. Reserved paths are excluded so
  // the stream stays about the mock's own traffic.
  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const note = notes.get(request);
    if (!note) return;
    const path = request.url.split("?")[0] ?? "/";
    if (path.startsWith("/__")) return;
    const event: LogEvent = {
      time: new Date().toISOString(),
      session: note.session,
      method: request.method,
      path,
      status: reply.statusCode,
      latencyMs: Date.now() - note.startedAt,
      fault: note.fault,
      validation: note.validation
    };
    log.push(event);
    if (log.length > LOG_HISTORY) log.shift();
    broadcast(event);
  });

  /**
   * Sends a generated response, checking it against the spec in dev mode.
   *
   * Values the client supplied are echoed verbatim (contract 6), so a complaint
   * about one of those fields is not the mock's fault and is filtered out.
   */
  const finish = (
    reply: FastifyReply,
    route: Route,
    status: number,
    payload: unknown,
    clientFields: ReadonlySet<string> = EMPTY_FIELDS,
    note: RequestNotes | undefined = undefined
  ): FastifyReply => {
    if (context.mode === "dev") {
      const responseValidator = validator.for(route).response;
      if (responseValidator && !responseValidator(payload)) {
        const problems = validator
          .details(responseValidator)
          .filter((detail) => !clientFields.has((detail.path.split("/")[1] ?? "").trim()));
        if (problems.length > 0) {
          if (note) note.validation = "mismatch";
          return sendError(
            reply,
            500,
            "MOCKFORGE_SCHEMA_MISMATCH",
            `Generated response for ${route.method} ${route.path} does not match the spec`,
            problems
          );
        }
      }
    }
    return reply.status(status).send(payload);
  };

  app.all("/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestPath = request.url.split("?")[0] ?? "/";
    const match = matchRoute(spec.routes, request.method, requestPath);

    if (!match) {
      const allowed = allowedMethods(spec.routes, requestPath);
      if (allowed.length > 0) {
        reply.header("allow", allowed.join(", "));
        return sendError(
          reply,
          405,
          "MOCKFORGE_METHOD_NOT_ALLOWED",
          `Method ${request.method} is not allowed for ${requestPath}`,
          [{ path: requestPath, reason: `allowed methods: ${allowed.join(", ")}` }]
        );
      }
      return sendError(reply, 404, "MOCKFORGE_NOT_FOUND", `No route for ${request.method} ${requestPath}`);
    }

    const { route, params } = match;
    // Documented contract decision 5: dev mode is visible to clients.
    reply.header("x-mockforge-mode", context.mode);

    // --- chaos (B1.3) ---------------------------------------------------
    // Reserved paths never get here: /__health, /__ui and /__admin/* are
    // registered as ordinary routes above this catch-all.
    const latencyHeader = Number(request.headers["x-mock-latency"]);
    const latency = Number.isFinite(latencyHeader) && latencyHeader >= 0
      ? clamp(latencyHeader, 0, MAX_LATENCY_MS)
      : context.chaos.latencyMs;
    if (latency > 0) await sleep(latency);

    const note0 = notes.get(request);
    // X-Mock-Status asks for an exact status. X-Mock-Error asks for *a* fault:
    // "1"/"true" picks one using the configured 404:500 split, and a status code
    // is still accepted for symmetry with X-Mock-Status.
    let forcedStatus: number | null = null;
    let forcedBy: string | null = null;
    const statusHeader = request.headers["x-mock-status"];
    const errorHeader = request.headers["x-mock-error"];
    const statusCandidate = Number(statusHeader);
    if (
      statusHeader !== undefined &&
      Number.isInteger(statusCandidate) &&
      statusCandidate >= 100 &&
      statusCandidate <= 599
    ) {
      forcedStatus = statusCandidate;
      forcedBy = "X-Mock-Status";
    } else if (errorHeader !== undefined) {
      const errorCandidate = Number(errorHeader);
      if (Number.isInteger(errorCandidate) && errorCandidate >= 100 && errorCandidate <= 599) {
        forcedStatus = errorCandidate;
        forcedBy = "X-Mock-Error";
      } else if (TRUTHY.has(String(errorHeader).trim().toLowerCase())) {
        forcedStatus = context.chaosRandom() * 100 < context.chaos.split404 ? 404 : 500;
        forcedBy = "X-Mock-Error";
      }
    }
    if (forcedStatus !== null && forcedBy !== null) {
      if (note0) note0.fault = `MOCKFORGE_INJECTED_${forcedStatus}`;
      return sendError(
        reply,
        forcedStatus,
        `MOCKFORGE_INJECTED_${forcedStatus}`,
        `Fault injected by ${forcedBy}`,
        [{ path: requestPath, reason: `requested status ${forcedStatus}` }]
      );
    }

    if (context.chaos.errorRate > 0 && context.chaosRandom() < context.chaos.errorRate) {
      const notFound = context.chaosRandom() * 100 < context.chaos.split404;
      if (note0) note0.fault = notFound ? "MOCKFORGE_INJECTED_404" : "MOCKFORGE_INJECTED_500";
      return sendError(
        reply,
        notFound ? 404 : 500,
        notFound ? "MOCKFORGE_INJECTED_404" : "MOCKFORGE_INJECTED_500",
        "Injected fault",
        [{ path: requestPath, reason: `error-rate ${context.chaos.errorRate}` }]
      );
    }

    /** Property names the client sent in the body (echoed verbatim). */
    const clientFields: ReadonlySet<string> = new Set(
      request.body && typeof request.body === "object" && !Array.isArray(request.body)
        ? Object.keys(request.body as object)
        : []
    );
    notes.set(request, { session: "", startedAt: Date.now(), fault: null, validation: null });

    const identity = resolveSessionIdentity(request);
    if (identity.issueCookie) {
      reply.header("set-cookie", `mf_session=${encodeURIComponent(identity.id)}; Path=/; HttpOnly; SameSite=Lax`);
    }
    const session = store.session(identity.id);
    const note = notes.get(request);
    if (note) note.session = session.id;
    if (clientFields.size > 0) store.noteClientFields(session, clientFields);
    const resourceName = route.resource ?? route.path;
    const resource = spec.resources.find((candidate) => candidate.name === route.resource) ?? null;
    const schema = resource?.schema ?? null;
    const idField = resource?.idField ?? "id";
    const records = store.ensureSeeded(session, resourceName, schema, idField, spec.document, seed);
    const id = params[idField] ?? params[route.pathParams[0]?.name ?? ""] ?? "";

    if ((route.kind === "create" || route.kind === "update") && request.body !== undefined) {
      if (!isJsonContentType(request.headers["content-type"])) {
        return sendError(
          reply,
          415,
          "MOCKFORGE_UNSUPPORTED_MEDIA_TYPE",
          "Content-Type must be application/json"
        );
      }
    }

    const generate = () =>
      generateRecord(schema, idField, {
        path: route.path,
        fieldName: null,
        rand: Math.random,
        depth: 0,
        sessionId: session.id,
        resource: resourceName,
        root: spec.document
      });

    switch (route.kind) {
      case "list": {
        const query = parseQuery(request.url);
        let all = [...records.values()];

        // Equality filters: any query key that is not a shaping parameter.
        for (const [field, value] of Object.entries(query)) {
          if (RESERVED_QUERY.has(field)) continue;
          all = all.filter((record) => String(record[field] ?? "") === value);
        }
        reply.header("x-total-count", String(all.length));

        if (typeof query.sort === "string" && query.sort.length > 0) {
          const field = query.sort;
          const direction = query.order === "desc" ? -1 : 1;
          all.sort((a, b) => direction * compareValues(a[field], b[field]));
        }

        // No default page size: a bare GET returns the whole collection.
        // limit/offset/page shape the page only when they are supplied.
        const limit = Math.max(Number(query.limit) || 0, 0);
        const page = Number(query.page);
        const offset = Number.isInteger(page) && page > 0
          ? (page - 1) * (limit || 20)
          : Math.max(Number(query.offset) || 0, 0);
        return finish(reply, route, route.successStatus, all.slice(offset, limit ? offset + limit : undefined), session.clientFields, note);
      }
      case "create": {
        const body = (request.body ?? {}) as SessionRecord;
        const requestValidator = validator.for(route).request;
        if (requestValidator && !requestValidator(body)) {
          if (note) note.validation = "rejected";
          return sendError(
            reply,
            400,
            "MOCKFORGE_VALIDATION_ERROR",
            `Request body does not match the schema for ${route.method} ${route.path}`,
            validator.details(requestValidator)
          );
        }
        const generated = generate();
        const stored: SessionRecord = { ...generated, ...body };
        if (stored[idField] === undefined || stored[idField] === null || stored[idField] === "") {
          stored[idField] = generated[idField];
        }
        if (store.createdCount(session) >= store.options.maxRecords) {
          return sendError(
            reply,
            409,
            "MOCKFORGE_LIMIT_RECORDS",
            `Session ${session.id} already holds the maximum of ${store.options.maxRecords} created records`
          );
        }
        records.set(String(stored[idField]), stored);
        session.created.add(String(stored[idField]));
        return finish(reply, route, route.successStatus, stored, session.clientFields, note);
      }
      case "single": {
        // Not a collection: one generated object per the response schema.
        return finish(reply, route, route.successStatus, generate(), session.clientFields, note);
      }
      case "read": {
        const found = records.get(id);
        if (!found) return sendError(reply, 404, "MOCKFORGE_NOT_FOUND", `No ${resourceName} with id ${id}`);
        return finish(reply, route, route.successStatus, found, session.clientFields, note);
      }
      case "update": {
        const existing = records.get(id);
        if (!existing) return sendError(reply, 404, "MOCKFORGE_NOT_FOUND", `No ${resourceName} with id ${id}`);
        const body = (request.body ?? {}) as SessionRecord;
        const updateValidator = validator.for(route).request;
        if (updateValidator && !updateValidator(body)) {
          return sendError(
            reply,
            400,
            "MOCKFORGE_VALIDATION_ERROR",
            `Request body does not match the schema for ${route.method} ${route.path}`,
            validator.details(updateValidator)
          );
        }
        const merged: SessionRecord =
          route.method === "PATCH"
            ? { ...existing, ...body }
            : { ...generate(), ...body, [idField]: existing[idField] };
        records.set(id, merged);
        return finish(reply, route, route.successStatus, merged, session.clientFields, note);
      }
      case "remove": {
        const existed = records.delete(id);
        if (existed) store.forget(session, id);
        if (!existed) return sendError(reply, 404, "MOCKFORGE_NOT_FOUND", `No ${resourceName} with id ${id}`);
        return reply.status(route.successStatus).send();
      }
      default:
        return sendError(reply, 501, "MOCKFORGE_NOT_IMPLEMENTED", `Route kind ${route.kind} is not supported`);
    }
  });

  const port = options.port ?? 3000;
  const host = options.host ?? "127.0.0.1";
  const url = `http://${host}:${port}`;

  const reload: MockForgeApp["reload"] = (next) => {
    spec.routes = next.routes;
    spec.resources = next.resources;
    spec.title = next.title;
    spec.version = next.version;
    spec.loaded = true;
    if (next.document) {
      spec.document = next.document;
      validator = new SpecValidator(next.document);
    }
  };

  return {
    app,
    spec,
    store,
    validator,
    chaos,
    bootMs: Date.now() - startedAt,
    startedAt,
    url,
    dashboardUrl: `${url}/__ui`,
    runtime,
    reload,
    reloadFromDisk,
    async close() {
      store.close();
      await app.close();
    }
  };
}

/** Starts listening; resolves with the boot info the CLI prints. */
export async function listen(app: MockForgeApp, host: string, port: number): Promise<BootInfo> {
  await app.app.listen({ port, host });
  app.runtime.bootMs = Date.now() - app.startedAt;
  return {
    title: app.spec.title,
    version: app.spec.version,
    routeCount: app.spec.routes.length,
    resourceCount: app.spec.resources.length,
    bootMs: app.bootMs,
    url: app.url,
    dashboardUrl: app.dashboardUrl
  };
}

export { SpecError };
export type { SpecVersion };
export type { HttpMethods };
