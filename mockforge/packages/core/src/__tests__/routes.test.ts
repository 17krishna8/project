import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inferRoutes } from "../spec/routes.js";
import { parseSpecFile } from "../spec/loader.js";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../acceptance/fixtures");

function load(name: string) {
  const { document, specVersion } = parseSpecFile(path.join(fixtures, name));
  return inferRoutes(document, specVersion);
}

describe("inferRoutes", () => {
  it("infers CRUD kinds and the resource for a collection pair", () => {
    const { routes, resources } = load("users.yaml");
    const byKey = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]));
    expect(byKey.get("GET /users")?.kind).toBe("list");
    expect(byKey.get("POST /users")?.kind).toBe("create");
    expect(byKey.get("GET /users/{id}")?.kind).toBe("read");
    expect(byKey.get("PUT /users/{id}")?.kind).toBe("update");
    expect(byKey.get("PATCH /users/{id}")?.kind).toBe("update");
    expect(byKey.get("DELETE /users/{id}")?.kind).toBe("remove");
    expect(resources.map((resource) => resource.name)).toEqual(["users"]);
    expect(resources[0]?.idField).toBe("id");
    expect(resources[0]?.itemPath).toBe("/users/{id}");
    expect(resources[0]?.collectionPath).toBe("/users");
  });

  it("uses the status codes declared by the spec", () => {
    const { routes } = load("users.yaml");
    const byKey = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]));
    expect(byKey.get("POST /users")?.successStatus).toBe(201);
    expect(byKey.get("DELETE /users/{id}")?.successStatus).toBe(204);
    expect(byKey.get("GET /users")?.successStatus).toBe(200);
  });

  it("finds the id field from the schema", () => {
    const { resources } = load("petstore.yaml");
    expect(resources[0]?.name).toBe("pets");
    // The schema property "id" wins over the path parameter name "petId";
    // the router falls back to the path parameter when the schema has no id.
    expect(resources[0]?.idField).toBe("id");
  });

  it("falls back to the path parameter name when the schema has no id field", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Fallback", version: "1.0.0" },
      paths: {
        "/things": {
          post: {
            requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } } },
            responses: { "201": { description: "created" } }
          }
        },
        "/things/{thingId}": {
          parameters: [{ name: "thingId", in: "path", required: true, schema: { type: "string" } }],
          get: { responses: { "200": { description: "ok" } } }
        }
      }
    };
    const { resources } = inferRoutes(document, "openapi3");
    expect(resources[0]?.idField).toBe("thingId");
  });

  it("treats a path with no item sibling as standalone", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Standalone", version: "1.0.0" },
      paths: {
        "/ping": { get: { responses: { "200": { description: "pong" } } } }
      }
    };
    const { routes, resources } = inferRoutes(document, "openapi3");
    expect(routes[0]?.kind).toBe("list");
    expect(routes[0]?.resource).toBeNull();
    expect(resources).toHaveLength(0);
  });

  it("produces identical routes for the Swagger 2.0 twin", () => {
    const v3 = load("users.yaml");
    const v2 = load("users.swagger2.yaml");
    const key = (routes: typeof v3.routes) =>
      routes.map((route) => `${route.method} ${route.path} ${route.kind} ${route.successStatus}`).sort();
    expect(key(v2.routes)).toEqual(key(v3.routes));
  });

  it("reads request and response schemas from both spec flavours", () => {
    const v3 = load("users.yaml");
    const v2 = load("users.swagger2.yaml");
    const createV3 = v3.routes.find((route) => route.method === "POST" && route.path === "/users");
    const createV2 = v2.routes.find((route) => route.method === "POST" && route.path === "/users");
    expect(createV3?.requestSchema).toBeTruthy();
    expect(createV2?.requestSchema).toBeTruthy();
    expect(v3.resources[0]?.schema).toBeTruthy();
    expect(v2.resources[0]?.schema).toBeTruthy();
  });

  it("collects path and query parameters", () => {
    const { routes } = load("users.yaml");
    const list = routes.find((route) => route.method === "GET" && route.path === "/users");
    expect(list?.queryParams.map((parameter) => parameter.name).sort()).toEqual(["limit", "offset", "order", "sort", "status"]);
    const read = routes.find((route) => route.method === "GET" && route.path === "/users/{id}");
    expect(read?.pathParams.map((parameter) => parameter.name)).toEqual(["id"]);
  });

  it("handles a spec with no paths at all", () => {
    const { routes, resources } = inferRoutes({ openapi: "3.0.3", info: { title: "Empty", version: "1" }, paths: {} }, "openapi3");
    expect(routes).toHaveLength(0);
    expect(resources).toHaveLength(0);
  });
});
