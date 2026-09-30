/** Minimal HTTP helper for the black-box suites. */

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  raw: string;
  /** Raw Set-Cookie values (session cookies come back here). */
  setCookies: string[];
}

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
}

export async function request<T = unknown>(
  baseUrl: string,
  method: string,
  urlPath: string,
  opts: RequestOptions = {}
): Promise<HttpResponse<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: string | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = headers["content-type"] ?? "application/json";
  }
  const res = await fetch(`${baseUrl}${urlPath}`, { method, headers, body, redirect: "manual" });
  const raw = await res.text();
  let parsed: unknown = raw;
  if ((res.headers.get("content-type") ?? "").includes("json") && raw.length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* keep raw text */
    }
  }
  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
  return { status: res.status, headers: res.headers, body: parsed as T, raw, setCookies };
}

export function sessionHeader(id: string): Record<string, string> {
  return { "x-session-id": id };
}

/** Reads a server-sent-events stream until `count` events arrive or `ms` elapse. */
export async function readSse(
  url: string,
  opts: { count?: number; ms?: number; headers?: Record<string, string> } = {}
): Promise<string[]> {
  const count = opts.count ?? 3;
  const ms = opts.ms ?? 4000;
  const controller = new AbortController();
  const events: string[] = [];
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers: opts.headers, signal: controller.signal });
    if (!res.body) throw new Error(`SSE stream had no body (status ${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (events.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const dataLines = part
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length > 0) events.push(dataLines.join("\n"));
      }
    }
    controller.abort();
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) throw err;
  } finally {
    clearTimeout(timer);
  }
  return events;
}
