import type {
  HttpMethod,
  JsonSchema,
  PathParam,
  QueryParam,
  Resource,
  Route,
  RouteKind
} from "../types.js";
import type { SpecVersion } from "./loader.js";
import { dereference } from "./refs.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

const JSON_CONTENT = /^application\/(json|\*\*json.*)$|^application\/[a-z.+-]*\+json$/;

interface RawParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: JsonSchema;
  description?: string;
}

interface RawOperation {
  operationId?: string;
  summary?: string;
  parameters?: RawParameter[];
  requestBody?: { content?: Record<string, { schema?: JsonSchema }>; required?: boolean };
  responses?: Record<string, { schema?: JsonSchema; content?: Record<string, { schema?: JsonSchema }> }>;
}

interface RawPathItem {
  parameters?: RawParameter[];
  get?: RawOperation;
  post?: RawOperation;
  put?: RawOperation;
  patch?: RawOperation;
  delete?: RawOperation;
  head?: RawOperation;
  options?: RawOperation;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Swagger 2.0 parameters carry JSON Schema keywords directly on the parameter. */
function parameterSchema(parameter: RawParameter, specVersion: SpecVersion): JsonSchema | null {
  if (specVersion === "openapi3") return parameter.schema ?? null;
  const { name: _name, in: _in, required: _required, description: _description, schema: _schema, ...rest } = parameter;
  return Object.keys(rest).length > 0 ? (rest as JsonSchema) : null;
}

function firstJsonSchema(content: Record<string, { schema?: JsonSchema }> | undefined): JsonSchema | null {
  if (!content) return null;
  for (const [contentType, mediaType] of Object.entries(content)) {
    if (JSON_CONTENT.test(contentType) && mediaType?.schema) return mediaType.schema;
  }
  return null;
}

function requestSchemaOf(operation: RawOperation, specVersion: SpecVersion): JsonSchema | null {
  if (specVersion === "openapi3") return firstJsonSchema(operation.requestBody?.content);
  const body = (operation.parameters ?? []).find((p) => p.in === "body");
  return body?.schema ?? null;
}

function responseSchemaOf(operation: RawOperation, specVersion: SpecVersion): JsonSchema | null {
  const responses = operation.responses ?? {};
  for (const code of Object.keys(responses).sort()) {
    if (!code.startsWith("2")) continue;
    const response = responses[code];
    if (!response) continue;
    if (specVersion === "openapi3") {
      const schema = firstJsonSchema(response.content);
      if (schema) return schema;
    } else if (response.schema) {
      return response.schema;
    }
  }
  return null;
}

function successStatusOf(operation: RawOperation, kind: RouteKind): number {
  const codes = Object.keys(operation.responses ?? {})
    .map((code) => Number(code))
    .filter((code) => code >= 200 && code < 300)
    .sort((a, b) => a - b);
  if (codes.length > 0) return codes[0]!;
  if (kind === "create") return 201;
  if (kind === "remove") return 204;
  return 200;
}

function parametersOf(pathItem: RawPathItem, operation: RawOperation, where: "path" | "query"): RawParameter[] {
  const all = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  return all.filter((parameter) => parameter.in === where);
}

const ID_FIELD_CANDIDATES = ["id", "_id", "uuid", "ID", "Id"];

function detectIdField(
  schema: JsonSchema | null,
  root: Record<string, unknown>,
  pathParamName: string | undefined,
  resourceName: string
): string {
  const properties = dereference(schema, root)?.properties ?? {};
  for (const candidate of ID_FIELD_CANDIDATES) {
    if (properties[candidate]) return candidate;
  }
  const singular = resourceName.replace(/s$/, "");
  for (const candidate of [`${singular}Id`, `${resourceName}Id`, `${singular}_id`, `${singular}UUID`]) {
    if (properties[candidate]) return candidate;
  }
  if (pathParamName && properties[pathParamName]) return pathParamName;
  // No id-ish property at all: the identity comes from the path parameter.
  return pathParamName ?? "id";
}

function isItemPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  const last = segments.at(-1) ?? "";
  return last.startsWith("{") && last.endsWith("}");
}

function collectionOf(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (isItemPath(path) && segments.length >= 2) return `/${segments.slice(0, -1).join("/")}`;
  return path;
}

type LowerMethod = (typeof HTTP_METHODS)[number];

function kindFor(method: LowerMethod, path: string, responseSchema: JsonSchema | null): RouteKind {
  const item = isItemPath(path);
  switch (method) {
    case "get":
      // A collection GET answers with an array; a standalone GET that declares
      // an object response answers with one object (a10.4's /pong).
      if (!item && responseSchema && responseSchema.type !== "array") return "single";
      return item ? "read" : "list";
    case "post":
      return "create";
    case "put":
    case "patch":
      return "update";
    case "delete":
      return "remove";
    default:
      return item ? "read" : "list";
  }
}

export interface InferredSpec {
  routes: Route[];
  resources: Resource[];
}

/** Turns a validated spec document into MockForge routes and resources.
 *  Works for both OpenAPI 3.x and Swagger 2.0 documents. */
export function inferRoutes(document: Record<string, unknown>, specVersion: SpecVersion): InferredSpec {
  const paths = isObject(document.paths) ? document.paths : {};
  const routes: Route[] = [];

  // Which paths pair up as collection + item (that is what makes a resource).
  const itemPaths = new Map<string, string>(); // collectionPath -> itemPath
  for (const path of Object.keys(paths)) {
    if (isItemPath(path)) itemPaths.set(collectionOf(path), path);
  }

  // A resource's schema is the item schema (GET /things/{id} response) when the
  // spec has an item path, otherwise the create body schema.
  const itemSchemas = new Map<string, JsonSchema | null>();
  const createSchemas = new Map<string, JsonSchema | null>();
  const resourceRoutes = new Map<string, Route[]>();

  for (const [path, rawPathItem] of Object.entries(paths)) {
    if (!isObject(rawPathItem)) continue;
    const pathItem = rawPathItem as unknown as RawPathItem;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") continue;

      const responseSchema = responseSchemaOf(operation, specVersion);
      const kind = kindFor(method, path, responseSchema);
      const collectionPath = collectionOf(path);
      const pairedItemPath = itemPaths.get(collectionPath);
      const isResourceRoute = pairedItemPath !== undefined && (path === collectionPath || path === pairedItemPath);
      const resourceName = isResourceRoute ? (collectionPath.split("/").filter(Boolean).at(-1) ?? null) : null;

      const pathParams: PathParam[] = parametersOf(pathItem, operation, "path").map((parameter) => ({
        name: parameter.name,
        required: parameter.required ?? true,
        schema: parameterSchema(parameter, specVersion)
      }));
      const queryParams: QueryParam[] = parametersOf(pathItem, operation, "query").map((parameter) => ({
        name: parameter.name,
        required: parameter.required ?? false,
        schema: parameterSchema(parameter, specVersion)
      }));

      const route: Route = {
        method: method.toUpperCase() as HttpMethod,
        path,
        kind,
        resource: resourceName,
        operationId: operation.operationId ?? null,
        summary: operation.summary ?? null,
        successStatus: successStatusOf(operation, kind),
        requestSchema: requestSchemaOf(operation, specVersion),
        responseSchema,
        pathParams,
        queryParams
      };
      routes.push(route);

      if (resourceName) {
        resourceRoutes.set(resourceName, [...(resourceRoutes.get(resourceName) ?? []), route]);
        if (path === pairedItemPath && !itemSchemas.has(resourceName)) {
          const itemSchema = responseSchemaOf(operation, specVersion) ?? requestSchemaOf(operation, specVersion);
          if (itemSchema) itemSchemas.set(resourceName, itemSchema);
        }
        if (path !== pairedItemPath && route.kind === "create" && !createSchemas.has(resourceName)) {
          const createSchema = requestSchemaOf(operation, specVersion) ?? responseSchemaOf(operation, specVersion);
          if (createSchema) createSchemas.set(resourceName, createSchema);
        }
      }
    }
  }

  const resources: Resource[] = [];
  for (const [name, nameRoutes] of resourceRoutes) {
    const schema = itemSchemas.get(name) ?? createSchemas.get(name) ?? null;
    const pathParamName = nameRoutes.flatMap((route) => route.pathParams).map((p) => p.name).at(0);
    resources.push({
      name,
      collectionPath: `/${name}`,
      itemPath: itemPaths.get(`/${name}`) ?? null,
      idField: detectIdField(schema, document, pathParamName, name),
      schema,
      routes: nameRoutes
    });
  }

  return { routes, resources };
}
