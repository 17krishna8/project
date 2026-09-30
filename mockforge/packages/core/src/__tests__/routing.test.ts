import { describe, expect, it } from "vitest";
import { allowedMethods, matchRoute, matchTemplate } from "../server/app.js";
import type { Route } from "../types.js";

function route(method: string, path: string): Route {
  return {
    method: method as Route["method"],
    path,
    kind: "custom",
    resource: null,
    operationId: null,
    summary: null,
    successStatus: 200,
    requestSchema: null,
    responseSchema: null,
    pathParams: [],
    queryParams: []
  };
}

const routes = [route("GET", "/users"), route("POST", "/users"), route("GET", "/users/{id}"), route("DELETE", "/users/{id}")];

describe("matchTemplate", () => {
  it("matches an exact path", () => {
    expect(matchTemplate("/users", "/users")).toEqual({});
  });

  it("extracts path parameters", () => {
    expect(matchTemplate("/users/{id}", "/users/usr_1")).toEqual({ id: "usr_1" });
  });

  it("decodes percent-encoded segments", () => {
    expect(matchTemplate("/users/{id}", "/users/a%20b")).toEqual({ id: "a b" });
  });

  it("rejects different segment counts", () => {
    expect(matchTemplate("/users/{id}", "/users")).toBeNull();
    expect(matchTemplate("/users/{id}", "/users/1/extra")).toBeNull();
  });

  it("rejects a mismatching literal segment", () => {
    expect(matchTemplate("/users/{id}", "/orders/1")).toBeNull();
  });
});

describe("matchRoute", () => {
  it("matches on method and path", () => {
    expect(matchRoute(routes, "GET", "/users")?.route.path).toBe("/users");
  });

  it("prefers the exact path over a parametric one", () => {
    expect(matchRoute(routes, "GET", "/users")?.route.path).toBe("/users");
  });

  it("matches parametric routes", () => {
    const match = matchRoute(routes, "GET", "/users/usr_9");
    expect(match?.route.path).toBe("/users/{id}");
    expect(match?.params).toEqual({ id: "usr_9" });
  });

  it("returns null for an unknown method or path", () => {
    expect(matchRoute(routes, "DELETE", "/users")).toBeNull();
    expect(matchRoute(routes, "GET", "/nope")).toBeNull();
  });

  it("does not let a parameter match an empty segment", () => {
    expect(matchRoute(routes, "GET", "/users/")).toBeNull();
  });
});

describe("allowedMethods", () => {
  it("lists the declared methods for a known path", () => {
    expect(allowedMethods(routes, "/users")).toEqual(["GET", "POST"]);
  });

  it("lists the methods for a parametric path", () => {
    expect(allowedMethods(routes, "/users/usr_1")).toEqual(["DELETE", "GET"]);
  });

  it("is empty for an unknown path", () => {
    expect(allowedMethods(routes, "/nope")).toEqual([]);
  });
});
