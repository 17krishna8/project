/**
 * MockForge shared vocabulary.
 *
 * These interfaces are the internal contract named in the playbook
 * (Route, Resource, SessionStore, ChaosConfig, GenerateContext). Everything
 * else in the codebase speaks in these terms.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** What a generated route does, inferred from the spec's path shape. */
export type RouteKind = "list" | "create" | "read" | "update" | "remove" | "single" | "custom";

/** JSON Schema (draft-07 subset used by OpenAPI 3.0 / Swagger 2.0). */
export interface JsonSchema {
  type?: string;
  format?: string;
  $ref?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  not?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  multipleOf?: number;
  default?: unknown;
  example?: unknown;
  description?: string;
  title?: string;
  readOnly?: boolean;
  writeOnly?: boolean;
  [key: string]: unknown;
}

export interface PathParam {
  name: string;
  required: boolean;
  schema: JsonSchema | null;
}

export interface QueryParam {
  name: string;
  required: boolean;
  schema: JsonSchema | null;
}

export interface Route {
  method: HttpMethod;
  path: string;
  kind: RouteKind;
  /** Resource this route belongs to (null for standalone paths). */
  resource: string | null;
  operationId: string | null;
  summary: string | null;
  /** Success status declared by the spec, or the default for the route kind. */
  successStatus: number;
  requestSchema: JsonSchema | null;
  responseSchema: JsonSchema | null;
  pathParams: PathParam[];
  queryParams: QueryParam[];
}

export interface Resource {
  /** Resource name, e.g. "users" (from /users and /users/{id}). */
  name: string;
  collectionPath: string;
  itemPath: string | null;
  /** Field that identifies a record ("id", "uuid", "<name>Id", ...). */
  idField: string;
  schema: JsonSchema | null;
  routes: Route[];
}

export interface SpecInfo {
  title: string;
  version: string;
  specVersion: "openapi3" | "swagger2";
  routes: Route[];
  resources: Resource[];
  /** Validated raw document, kept for local $ref resolution. */
  document: Record<string, unknown>;
  sourcePath: string;
}

export interface ChaosConfig {
  latencyMs: number;
  errorRate: number;
  split404: number;
  split500: number;
}

export interface GenerateContext {
  /** Path of the value being generated, e.g. "/users/0/balance". */
  path: string;
  /** Nearest property name, used by the meaning-based data rules. */
  fieldName: string | null;
  rand: () => number;
  depth: number;
  sessionId: string;
  resource: string | null;
  /** Whole spec document, for local $ref resolution. */
  root: Record<string, unknown>;
}

export interface SessionRecord {
  [key: string]: unknown;
}

export interface SessionData {
  id: string;
  createdAt: number;
  lastAccessAt: number;
  /** resource name -> (record id -> record) */
  resources: Map<string, Map<string, SessionRecord>>;
  /** Record ids the client created via POST. The record cap counts these, not
   *  the deterministic seed records (otherwise a fresh session could not accept
   *  a single create). */
  created: Set<string>;
  /** Property names the client has supplied in this session. Those values are
   *  stored verbatim (contract 6), so dev-mode response validation must not
   *  blame the mock for them - not on the request that set them, and not on
   *  any later read of the same record. */
  clientFields: Set<string>;
}

export interface SessionStore {
  sessions: Map<string, SessionData>;
  ttlMs: number;
  maxSessions: number;
  maxRecords: number;
}

export interface MockForgeOptions {
  specPath: string;
  port?: number;
  host?: string;
  latencyMs?: number;
  errorRate?: number;
  split404?: number;
  split500?: number;
  seed?: number;
  sessionTtlMin?: number;
  maxSessions?: number;
  maxRecords?: number;
  mode?: "dev" | "prod";
  /** Directory with the built dashboard; /__ui serves it when present. */
  dashboardDir?: string | null;
}

export interface BootInfo {
  title: string;
  version: string;
  routeCount: number;
  resourceCount: number;
  bootMs: number;
  url: string;
  dashboardUrl: string;
}

export interface ErrorDetail {
  path: string;
  reason: string;
}
