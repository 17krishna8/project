import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createMockForge, listen, type MockForgeApp } from "../server/app.js";
import { resolveSessionIdentity } from "../server/sessions.js";
import type { FastifyRequest } from "fastify";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../acceptance/fixtures");

const open: MockForgeApp[] = [];

async function boot(spec = "users.yaml") {
  const forge = await createMockForge({ specPath: path.join(fixtures, spec) });
  open.push(forge);
  return forge;
}

afterEach(async () => {
  while (open.length > 0) {
    const forge = open.pop();
    await forge?.app.close();
  }
});

describe("createMockForge", () => {
  it("boots a spec and reports its routes", async () => {
    const forge = await boot();
    const res = await forge.app.inject({ method: "GET", url: "/__health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.routes).toBe(6);
    expect(typeof body.bootMs).toBe("number");
  });

  it("seeds a list with the X-Total-Count header", async () => {
    const forge = await boot();
    const res = await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "unit" } });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    expect(res.json().length).toBeGreaterThanOrEqual(5);
    expect(Number(res.headers["x-total-count"])).toBe(res.json().length);
  });

  it("creates, reads, updates and deletes a record", async () => {
    const forge = await boot();
    const headers = { "x-session-id": "unit-crud" };

    const created = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: { name: "Unit Test", email: "unit.test@example.in", balance: 10 }
    });
    expect(created.statusCode).toBe(201);
    const record = created.json();
    expect(record.name).toBe("Unit Test");
    expect(typeof record.id).toBe("string");
    expect(typeof record.phone).toBe("string");

    const read = await forge.app.inject({ method: "GET", url: `/users/${record.id}`, headers });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(record);

    const patched = await forge.app.inject({
      method: "PATCH",
      url: `/users/${record.id}`,
      headers,
      payload: { balance: 99.5 }
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().balance).toBe(99.5);
    expect(patched.json().name).toBe("Unit Test");

    const removed = await forge.app.inject({ method: "DELETE", url: `/users/${record.id}`, headers });
    expect(removed.statusCode).toBe(204);
    expect((await forge.app.inject({ method: "GET", url: `/users/${record.id}`, headers })).statusCode).toBe(404);
  });

  it("returns 404 with the documented error shape", async () => {
    const forge = await boot();
    const res = await forge.app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("MOCKFORGE_NOT_FOUND");
    expect(Array.isArray(res.json().error.details)).toBe(true);
  });

  it("returns 405 with an Allow header for an undeclared method", async () => {
    const forge = await boot();
    const res = await forge.app.inject({ method: "DELETE", url: "/users" });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("GET, POST");
    expect(res.json().error.code).toBe("MOCKFORGE_METHOD_NOT_ALLOWED");
  });

  it("isolates sessions by X-Session-Id", async () => {
    const forge = await boot();
    await forge.app.inject({
      method: "POST",
      url: "/users",
      headers: { "x-session-id": "alice" },
      payload: { name: "Alice", email: "alice@example.in" }
    });
    const bob = await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "bob" } });
    expect(bob.json().some((user: { name: string }) => user.name === "Alice")).toBe(false);
  });

  it("issues an mf_session cookie when no session is given", async () => {
    const forge = await boot();
    const res = await forge.app.inject({ method: "GET", url: "/users" });
    expect(res.statusCode).toBe(200);
    const cookie = res.headers["set-cookie"] as unknown as string;
    expect(String(cookie)).toContain("mf_session=");
  });

  it("serves a Swagger 2.0 spec identically", async () => {
    const forge = await boot("users.swagger2.yaml");
    const created = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers: { "x-session-id": "swagger" },
      payload: { name: "Swagger Two", email: "swagger.two@example.in" }
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await forge.app.inject({ method: "GET", url: `/users/${id}`, headers: { "x-session-id": "swagger" } })).statusCode).toBe(200);
  });

  it("rejects an oversized body with 413", async () => {
    const forge = await boot();
    const res = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "x".repeat(1_100_000), email: "huge@example.in" })
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("MOCKFORGE_BODY_TOO_LARGE");
  });

  it("rejects an unsupported content type with 415", async () => {
    const forge = await boot();
    const res = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers: { "content-type": "text/plain" },
      payload: "name=Unit"
    });
    expect(res.statusCode).toBe(415);
  });

  it("swaps the route table on reload without dropping sessions", async () => {
    const forge = await boot();
    const before = await forge.app.inject({ method: "GET", url: "/__admin/routes" });
    expect(before.json()).toHaveLength(6);
    forge.reload({
      routes: [
        {
          method: "GET",
          path: "/pong",
          kind: "list",
          resource: null,
          operationId: null,
          summary: null,
          successStatus: 200,
          requestSchema: null,
          responseSchema: null,
          pathParams: [],
          queryParams: []
        }
      ],
      resources: [],
      title: "Reloaded",
      version: "2.0.0"
    });
    const after = await forge.app.inject({ method: "GET", url: "/__admin/routes" });
    expect(after.json()).toHaveLength(1);
    expect((await forge.app.inject({ method: "GET", url: "/pong" })).statusCode).toBe(200);
    expect((await forge.app.inject({ method: "GET", url: "/users" })).statusCode).toBe(404);
  });

  it("throws a SpecError for a broken spec", async () => {
    await expect(createMockForge({ specPath: path.join(fixtures, "malformed.yaml") })).rejects.toThrowError(/line \d+/);
  });
});

describe("resolveSessionIdentity", () => {
  const request = (headers: Record<string, string>) => ({ headers }) as unknown as FastifyRequest;

  it("uses the X-Session-Id header", () => {
    const identity = resolveSessionIdentity(request({ "x-session-id": "abc" }));
    expect(identity).toEqual({ id: "abc", issueCookie: false });
  });

  it("sanitizes a hostile header value", () => {
    expect(resolveSessionIdentity(request({ "x-session-id": "a b!c" })).id).toBe("abc");
  });

  it("falls back to the mf_session cookie", () => {
    const identity = resolveSessionIdentity(request({ cookie: "other=1; mf_session=cookie-session" }));
    expect(identity).toEqual({ id: "cookie-session", issueCookie: false });
  });

  it("mints a new session when nothing is provided", () => {
    const identity = resolveSessionIdentity(request({}));
    expect(identity.issueCookie).toBe(true);
    expect(identity.id.length).toBeGreaterThan(0);
  });

  it("ignores an empty header and an empty cookie", () => {
    expect(resolveSessionIdentity(request({ "x-session-id": "   " })).issueCookie).toBe(true);
    expect(resolveSessionIdentity(request({ cookie: "mf_session=" })).issueCookie).toBe(true);
  });
});

describe("list queries", () => {
  async function seededSession(forge: MockForgeApp, session = "queries") {
    await forge.app.inject({ method: "POST", url: "/users", headers: { "x-session-id": session }, payload: { name: "Q One", email: "q1@example.in", status: "active", balance: 300 } });
    await forge.app.inject({ method: "POST", url: "/users", headers: { "x-session-id": session }, payload: { name: "Q Two", email: "q2@example.in", status: "blocked", balance: 100 } });
    await forge.app.inject({ method: "POST", url: "/users", headers: { "x-session-id": session }, payload: { name: "Q Three", email: "q3@example.in", status: "active", balance: 200 } });
    return session;
  }

  it("returns the whole collection when no paging is asked for", async () => {
    const forge = await boot();
    const session = await seededSession(forge);
    const all = await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": session } });
    const total = Number(all.headers["x-total-count"]);
    expect(all.json()).toHaveLength(total);
    expect(total).toBeGreaterThanOrEqual(8);
  });

  it("filters by equality", async () => {
    const forge = await boot();
    const session = await seededSession(forge);
    const res = await forge.app.inject({ method: "GET", url: "/users?status=active&limit=100", headers: { "x-session-id": session } });
    const users = res.json() as Array<{ name: string; status: string }>;
    const names = users.map((user) => user.name);
    expect(names).toContain("Q One");
    expect(names).toContain("Q Three");
    expect(names).not.toContain("Q Two");
    for (const user of users) expect(user.status).toBe("active");
    expect(Number(res.headers["x-total-count"])).toBe(users.length);
  });

  it("paginates with limit and offset, and page matches the same window", async () => {
    const forge = await boot();
    const session = await seededSession(forge);
    const url = "/users?limit=2&offset=0&sort=name&order=asc";
    const first = await forge.app.inject({ method: "GET", url, headers: { "x-session-id": session } });
    const second = await forge.app.inject({
      method: "GET",
      url: "/users?limit=2&offset=2&sort=name&order=asc",
      headers: { "x-session-id": session }
    });
    const paged = await forge.app.inject({
      method: "GET",
      url: "/users?limit=2&page=2&sort=name&order=asc",
      headers: { "x-session-id": session }
    });
    expect(first.json()).toHaveLength(2);
    expect(second.json()).toHaveLength(2);
    expect(paged.json()).toEqual(second.json());
    const ids1 = (first.json() as Array<{ id: string }>).map((u) => u.id);
    const ids2 = (second.json() as Array<{ id: string }>).map((u) => u.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it("sorts ascending and descending", async () => {
    const forge = await boot();
    const session = await seededSession(forge);
    const asc = (await forge.app.inject({ method: "GET", url: "/users?sort=balance&order=asc&limit=100", headers: { "x-session-id": session } })).json() as Array<{ balance: number }>;
    const desc = (await forge.app.inject({ method: "GET", url: "/users?sort=balance&order=desc&limit=100", headers: { "x-session-id": session } })).json() as Array<{ balance: number }>;
    expect(asc.map((u) => Number(u.balance))).toEqual([...asc.map((u) => Number(u.balance))].sort((a, b) => a - b));
    expect(desc.map((u) => Number(u.balance))).toEqual([...desc.map((u) => Number(u.balance))].sort((a, b) => b - a));
  });
});

describe("admin and limits", () => {
  it("lists and deletes sessions", async () => {
    const forge = await boot();
    await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "admin-one" } });
    const listed = await forge.app.inject({ method: "GET", url: "/__admin/sessions" });
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0].id).toBe("admin-one");
    expect(listed.json()[0].records).toBeGreaterThan(0);

    const deleted = await forge.app.inject({ method: "DELETE", url: "/__admin/sessions" });
    expect(deleted.statusCode).toBe(204);
    expect((await forge.app.inject({ method: "GET", url: "/__admin/sessions" })).json()).toHaveLength(0);
  });

  it("returns the records of one session", async () => {
    const forge = await boot();
    await forge.app.inject({ method: "POST", url: "/users", headers: { "x-session-id": "data-view" }, payload: { name: "Visible", email: "visible@example.in" } });
    const res = await forge.app.inject({ method: "GET", url: "/__admin/sessions/data-view/data" });
    expect(res.json().users.some((user: { name: string }) => user.name === "Visible")).toBe(true);
    expect((await forge.app.inject({ method: "GET", url: "/__admin/sessions/nope/data" })).statusCode).toBe(404);
  });

  it("reads and updates the chaos settings", async () => {
    const forge = await boot();
    expect((await forge.app.inject({ method: "GET", url: "/__admin/chaos" })).json()).toEqual({ latencyMs: 0, errorRate: 0, split404: 50, split500: 50 });
    const updated = await forge.app.inject({ method: "PUT", url: "/__admin/chaos", payload: { latencyMs: 50, errorRate: 0.1 } });
    expect(updated.json().latencyMs).toBe(50);
    expect(updated.json().errorRate).toBe(0.1);
    expect(forge.chaos.latencyMs).toBe(50);
    // Clamped to the documented ranges.
    const clamped = await forge.app.inject({ method: "PUT", url: "/__admin/chaos", payload: { latencyMs: 99_999, errorRate: 5, split404: -1 } });
    expect(clamped.json()).toEqual({ latencyMs: 3000, errorRate: 1, split404: 0, split500: 50 });
  });

  it("rejects a create beyond the record cap with 409", async () => {
    const forge = await createMockForge({
      specPath: path.join(fixtures, "users.yaml"),
      maxRecords: 2,
      sessionTtlMin: 60
    });
    open.push(forge);
    const headers = { "x-session-id": "capped" };
    const first = await forge.app.inject({ method: "POST", url: "/users", headers, payload: { name: "One", email: "one@example.in" } });
    expect(first.statusCode).toBe(201);
    expect((await forge.app.inject({ method: "POST", url: "/users", headers, payload: { name: "Two", email: "two@example.in" } })).statusCode).toBe(201);
    const third = await forge.app.inject({ method: "POST", url: "/users", headers, payload: { name: "Three", email: "three@example.in" } });
    expect(third.statusCode).toBe(409);
    expect(third.json().error.code).toBe("MOCKFORGE_LIMIT_RECORDS");
    // Freeing a slot by deleting a record the client created lets the next one in.
    await forge.app.inject({ method: "DELETE", url: `/users/${first.json().id}`, headers });
    expect((await forge.app.inject({ method: "POST", url: "/users", headers, payload: { name: "Four", email: "four@example.in" } })).statusCode).toBe(201);
  });

  it("drops an expired session on the next sweep", async () => {
    const forge = await createMockForge({ specPath: path.join(fixtures, "users.yaml"), sessionTtlMin: 0 });
    open.push(forge);
    await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "ttl" } });
    expect(forge.store.sessions.has("ttl")).toBe(true);
    forge.store.sweep();
    expect(forge.store.sessions.has("ttl")).toBe(false);
  });
});

describe("chaos", () => {
  it("delays every response by the configured latency", async () => {
    const forge = await createMockForge({ specPath: path.join(fixtures, "users.yaml"), latencyMs: 120 });
    open.push(forge);
    const started = Date.now();
    const res = await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "latency" } });
    const elapsed = Date.now() - started;
    expect(res.statusCode).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it("lets X-Mock-Latency override the configured latency", async () => {
    const forge = await boot();
    const started = Date.now();
    await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "latency", "x-mock-latency": "150" } });
    expect(Date.now() - started).toBeGreaterThanOrEqual(120);
  });

  it("clamps latency above 3000 ms", async () => {
    const forge = await createMockForge({ specPath: path.join(fixtures, "users.yaml"), latencyMs: 99_999 });
    open.push(forge);
    expect(forge.chaos.latencyMs).toBe(3000);
  });

  it("injects a 404 and a 500 according to the split", async () => {
    const forge = await createMockForge({ specPath: path.join(fixtures, "users.yaml"), errorRate: 1, split404: 100 });
    open.push(forge);
    const res = await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "chaos" } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("MOCKFORGE_INJECTED_404");
    expect(res.json().error.message).toBeTypeOf("string");
    expect(Array.isArray(res.json().error.details)).toBe(true);

    forge.chaos.split404 = 0;
    const other = await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "chaos" } });
    expect(other.statusCode).toBe(500);
    expect(other.json().error.code).toBe("MOCKFORGE_INJECTED_500");
  });

  it("never faults a reserved path", async () => {
    const forge = await createMockForge({ specPath: path.join(fixtures, "users.yaml"), errorRate: 1 });
    open.push(forge);
    for (const path of ["/__health", "/__admin/routes", "/__admin/sessions", "/__admin/chaos", "/__ui"]) {
      const res = await forge.app.inject({ method: "GET", url: path });
      expect(res.statusCode, path).toBe(200);
    }
  });

  it("forces a status with X-Mock-Error and X-Mock-Status", async () => {
    const forge = await boot();
    const forced = await forge.app.inject({
      method: "GET",
      url: "/users",
      headers: { "x-session-id": "forced", "x-mock-error": "503" }
    });
    expect(forced.statusCode).toBe(503);
    expect(forced.json().error.code).toBe("MOCKFORGE_INJECTED_503");

    const teapot = await forge.app.inject({
      method: "GET",
      url: "/users",
      headers: { "x-session-id": "forced", "x-mock-status": "418" }
    });
    expect(teapot.statusCode).toBe(418);
    expect(teapot.json().error.code).toBe("MOCKFORGE_INJECTED_418");

    // A nonsense header is ignored rather than trusted.
    const ignored = await forge.app.inject({
      method: "GET",
      url: "/users",
      headers: { "x-session-id": "forced", "x-mock-status": "banana" }
    });
    expect(ignored.statusCode).toBe(200);
  });

  it("X-Mock-Error without a status picks one from the 404:500 split", async () => {
    const forge = await boot();
    // 100% 404 split, so a flag-only fault must come back as a 404.
    await forge.app.inject({
      method: "PUT",
      url: "/__admin/chaos",
      headers: { "x-session-id": "forced" },
      payload: { split404: 100, split500: 0 }
    });

    for (const spelling of ["1", "true", "yes", "on"]) {
      const res = await forge.app.inject({
        method: "GET",
        url: "/users",
        headers: { "x-session-id": "forced", "x-mock-error": spelling }
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("MOCKFORGE_INJECTED_404");
    }

    // Falsy spellings leave the request alone.
    for (const spelling of ["0", "false", "no"]) {
      const res = await forge.app.inject({
        method: "GET",
        url: "/users",
        headers: { "x-session-id": "forced", "x-mock-error": spelling }
      });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe("validation", () => {
  const headers = { "x-session-id": "validation", "content-type": "application/json" };

  it("returns 400 naming the offending path when a minimum is broken", async () => {
    const forge = await boot();
    const res = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: { name: "Negative", email: "negative@example.in", balance: -5 }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("MOCKFORGE_VALIDATION_ERROR");
    const details = res.json().error.details as Array<{ path: string; reason: string }>;
    const hit = details.find((detail) => detail.path.includes("balance"));
    expect(hit).toBeDefined();
    expect(hit!.reason.length).toBeGreaterThan(0);
  });

  it("returns 400 for a wrong type and for a missing required field", async () => {
    const forge = await boot();
    const wrongType = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: { name: "Wrong", email: "wrong@example.in", balance: "not-a-number" }
    });
    expect(wrongType.statusCode).toBe(400);

    const missing = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: { name: "No Email" }
    });
    expect(missing.statusCode).toBe(400);
    const paths = (missing.json().error.details as Array<{ path: string }>).map((detail) => detail.path);
    expect(paths.some((path) => path.includes("email"))).toBe(true);
  });

  it("rejects malformed JSON and prototype-pollution keys with a MOCKFORGE code", async () => {
    const forge = await boot();

    const malformed = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: "{ not json"
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe("MOCKFORGE_INVALID_JSON_BODY");

    const polluted = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: '{"__proto__":{"polluted":true}}'
    });
    expect(polluted.statusCode).toBe(400);
    expect(polluted.json().error.code).toBe("MOCKFORGE_INVALID_JSON_BODY");

    // Whatever happened above, the prototype was not touched.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps a client-supplied id even when it breaks the id pattern", async () => {
    const forge = await boot();
    const created = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: { id: "usr_client_supplied", name: "Client Supplied", email: "client@example.in" }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().id).toBe("usr_client_supplied");
    const read = await forge.app.inject({ method: "GET", url: "/users/usr_client_supplied", headers });
    expect(read.statusCode).toBe(200);
    expect(read.json().name).toBe("Client Supplied");
  });

  it("reports the mode it runs in", async () => {
    const dev = await boot();
    expect((await dev.app.inject({ method: "GET", url: "/users" })).headers["x-mockforge-mode"]).toBe("dev");
    const prod = await createMockForge({ specPath: path.join(fixtures, "users.yaml"), mode: "prod" });
    open.push(prod);
    expect((await prod.app.inject({ method: "GET", url: "/users" })).headers["x-mockforge-mode"]).toBe("prod");
  });

  it("rejects a body that would make the response invalid in dev mode", async () => {
    // The response schema demands a valid id; a stored record the client built
    // from an invalid id is exempt, but a body that breaks a generated field is
    // caught on the way in.
    const forge = await boot();
    const res = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: { name: "Bad Phone", email: "bad.phone@example.in", phone: "12345" }
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("admin reload and logs", () => {
  it("deletes one session and reports a missing one", async () => {
    const forge = await boot();
    await forge.app.inject({ method: "GET", url: "/users", headers: { "x-session-id": "doomed" } });
    expect((await forge.app.inject({ method: "DELETE", url: "/__admin/sessions/doomed" })).statusCode).toBe(204);
    expect((await forge.app.inject({ method: "DELETE", url: "/__admin/sessions/doomed" })).statusCode).toBe(404);
    expect(forge.store.sessions.has("doomed")).toBe(false);
  });

  it("reloads a changed spec and keeps serving the old one when the new one is broken", async () => {
    const file = path.join(fixtures, "reload-unit.yaml");
    const v1 = [
      "openapi: 3.0.3",
      "info:",
      "  title: Unit Reload",
      "  version: 1.0.0",
      "paths:",
      "  /ping:",
      "    get:",
      "      operationId: ping",
      "      responses:",
      "        '200':",
      "          description: pong",
      "          content:",
      "            application/json:",
      "              schema:",
      "                type: object"
    ].join("\n");
    writeFileSync(file, v1);
    try {
      const forge = await createMockForge({ specPath: file });
      open.push(forge);
      expect((await forge.app.inject({ method: "GET", url: "/ping" })).statusCode).toBe(200);
      expect((await forge.app.inject({ method: "GET", url: "/pong" })).statusCode).toBe(404);

      const v2 = `${v1}\n  /pong:\n    get:\n      operationId: pong\n      responses:\n        '200':\n          description: pong\n          content:\n            application/json:\n              schema:\n                type: object`;
      writeFileSync(file, v2);
      const reloaded = await forge.app.inject({ method: "POST", url: "/__admin/spec", payload: {} });
      expect(reloaded.statusCode).toBe(200);
      expect(reloaded.json().routes).toBe(2);
      expect((await forge.app.inject({ method: "GET", url: "/pong" })).statusCode).toBe(200);

      // A broken file must not take the running mock down.
      writeFileSync(file, "this: [is not, a valid spec");
      const rejected = await forge.app.inject({ method: "POST", url: "/__admin/spec", payload: {} });
      expect(rejected.statusCode).toBeGreaterThanOrEqual(400);
      expect(rejected.json().error.code).toBe("MOCKFORGE_SPEC_INVALID");
      expect((await forge.app.inject({ method: "GET", url: "/pong" })).statusCode).toBe(200);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("keeps a session's records across a reload", async () => {
    const file = path.join(fixtures, "reload-keep.yaml");
    const spec = [
      "openapi: 3.0.3",
      "info:",
      "  title: Keep",
      "  version: 1.0.0",
      "paths:",
      "  /items:",
      "    get:",
      "      operationId: listItems",
      "      responses:",
      "        '200':",
      "          description: items",
      "          content:",
      "            application/json:",
      "              schema:",
      "                type: array",
      "                items:",
      "                  type: object",
      "    post:",
      "      operationId: createItem",
      "      responses:",
      "        '201':",
      "          description: created",
      "          content:",
      "            application/json:",
      "              schema:",
      "                type: object"
    ].join("\n");
    writeFileSync(file, spec);
    try {
      const forge = await createMockForge({ specPath: file });
      open.push(forge);
      const created = await forge.app.inject({
        method: "POST",
        url: "/items",
        headers: { "x-session-id": "keeper" },
        payload: { name: "Kept" }
      });
      expect(created.statusCode).toBe(201);
      writeFileSync(file, `${spec}\n  /extra:\n    get:\n      operationId: extra\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: object`);
      await forge.app.inject({ method: "POST", url: "/__admin/spec", payload: {} });
      const list = await forge.app.inject({ method: "GET", url: "/items?limit=100", headers: { "x-session-id": "keeper" } });
      expect(list.json().some((item: { name: string }) => item.name === "Kept")).toBe(true);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("streams one log event per served request over SSE", async () => {
    const forge = await boot();
    open.push(forge);
    await listen(forge, "127.0.0.1", 0);
    const address = forge.app.server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    const base = `http://127.0.0.1:${port}`;

    const controller = new AbortController();
    const stream = await fetch(`${base}/__admin/logs`, { signal: controller.signal });
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();

    await fetch(`${base}/users`, { headers: { "x-session-id": "sse" } });

    const deadline = Date.now() + 5000;
    let dataLine: string | undefined;
    while (dataLine === undefined && Date.now() < deadline) {
      const step = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
      const chunk = await Promise.race([reader.read(), step]);
      if (chunk === null) continue;
      if (chunk.done) break;
      dataLine = decoder.decode(chunk.value).split("\n").find((line) => line.startsWith("data:"));
    }
    controller.abort();
    await forge.close();

    expect(dataLine, "no SSE data line arrived").toBeDefined();
    const event = JSON.parse(dataLine!.slice(5).trim()) as Record<string, unknown>;
    for (const key of ["time", "session", "method", "path", "status", "latencyMs", "fault", "validation"]) {
      expect(event, `event missing ${key}`).toHaveProperty(key);
    }
    expect(event.path).toBe("/users");
    expect(event.status).toBe(200);
    expect(event.session).toBe("sse");
  }, 15_000);
});

describe("spec upload", () => {
  const minimal = [
    "openapi: 3.0.3",
    "info:",
    "  title: Uploaded API",
    "  version: 9.9.9",
    "paths:",
    "  /widgets:",
    "    get:",
    "      operationId: listWidgets",
    "      responses:",
    "        '200':",
    "          description: widgets",
    "          content:",
    "            application/json:",
    "              schema:",
    "                type: array",
    "                items:",
    "                  $ref: '#/components/schemas/Widget'",
    "  /widgets/{widgetId}:",
    "    parameters:",
    "      - name: widgetId",
    "        in: path",
    "        required: true",
    "        schema:",
    "          type: string",
    "    get:",
    "      operationId: getWidget",
    "      responses:",
    "        '200':",
    "          description: widget",
    "          content:",
    "            application/json:",
    "              schema:",
    "                $ref: '#/components/schemas/Widget'",
    "components:",
    "  schemas:",
    "    Widget:",
    "      type: object",
    "      required: [id, name]",
    "      properties:",
    "        id:",
    "          type: string",
    "        name:",
    "          type: string"
  ].join("\n");

  /** Boots with no spec file at all: the upload-only mode. */
  async function bootEmpty() {
    const forge = await createMockForge({ specPath: "" });
    open.push(forge);
    return forge;
  }

  it("boots with no spec and serves nothing until one is uploaded", async () => {
    const forge = await bootEmpty();
    expect(forge.spec.loaded).toBe(false);
    const health = await forge.app.inject({ method: "GET", url: "/__health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().specLoaded).toBe(false);
    expect(health.json().routes).toBe(0);
    // The catch-all has no routes to match yet.
    expect((await forge.app.inject({ method: "GET", url: "/widgets" })).statusCode).toBe(404);
  });

  it("accepts an uploaded YAML spec and starts serving it", async () => {
    const forge = await bootEmpty();
    const res = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: minimal, filename: "widgets.yaml" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe("Uploaded API");
    expect(body.version).toBe("9.9.9");
    expect(body.routes).toBe(2);
    expect(body.source).toBe("upload");
    expect(forge.spec.loaded).toBe(true);

    const health = await forge.app.inject({ method: "GET", url: "/__health" });
    expect(health.json().specLoaded).toBe(true);

    const list = await forge.app.inject({ method: "GET", url: "/widgets", headers: { "x-session-id": "up" } });
    expect(list.statusCode).toBe(200);
    const items = list.json() as Array<{ id: string; name: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.name.length).toBeGreaterThan(0);
  });

  it("accepts a JSON spec body too", async () => {
    const forge = await bootEmpty();
    const jsonSpec = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "JSON Upload", version: "1.0.0" },
      paths: {
        "/things": {
          get: {
            operationId: "listThings",
            responses: {
              "200": {
                description: "things",
                content: { "application/json": { schema: { type: "array", items: { type: "object" } } } }
              }
            }
          }
        }
      }
    });
    const res = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: jsonSpec, filename: "things.json" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("JSON Upload");
    expect((await forge.app.inject({ method: "GET", url: "/things", headers: { "x-session-id": "j" } })).statusCode).toBe(200);
  });

  it("rejects a malformed upload and stays unloaded", async () => {
    const forge = await bootEmpty();
    const res = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: "openapi: 3.0.3\ninfo:\n  title: [broken", filename: "bad.yaml" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("MOCKFORGE_SPEC_INVALID");
    expect(forge.spec.loaded).toBe(false);
    expect((await forge.app.inject({ method: "GET", url: "/__health" })).json().specLoaded).toBe(false);
  });

  it("rejects an upload that is not a spec, naming why", async () => {
    const forge = await bootEmpty();
    const res = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: "hello: world", filename: "nope.yaml" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/openapi: 3\.x|swagger: "2\.0"/);
    expect(res.json().error.details[0].reason.length).toBeGreaterThan(0);
  });

  it("rejects an upload carrying a remote $ref", async () => {
    const forge = await bootEmpty();
    const res = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: {
        spec: [
          "openapi: 3.0.3",
          "info:",
          "  title: Remote",
          "  version: 1.0.0",
          "paths:",
          "  /a:",
          "    get:",
          "      responses:",
          "        '200':",
          "          description: a",
          "          content:",
          "            application/json:",
          "              schema:",
          "                $ref: 'http://evil.example/x.yaml#/A'"
        ].join("\n"),
        filename: "remote.yaml"
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/non-local \$ref/i);
    expect(forge.spec.loaded).toBe(false);
  });

  it("a >1 MB upload is stopped by the request body limit, not the spec limit", async () => {
    const forge = await bootEmpty();
    const huge = `openapi: 3.0.3\ninfo:\n  title: Huge\n  version: 1.0.0\n# ${"x".repeat(6 * 1024 * 1024)}\npaths: {}\n`;
    const res = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: huge, filename: "huge.yaml" }
    });
    // The 1 MB request-body limit fires first, so an oversized upload never
    // reaches the loader. The 5 MB spec limit still guards file reads (a03.4).
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("MOCKFORGE_BODY_TOO_LARGE");
    expect(forge.spec.loaded).toBe(false);
  });

  it("keeps an already-loaded spec when a later upload is bad", async () => {
    const forge = await bootEmpty();
    await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: minimal, filename: "widgets.yaml" }
    });
    const rejected = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: "not: [a spec", filename: "bad.yaml" }
    });
    expect(rejected.statusCode).toBe(400);
    // The first spec is still serving.
    expect(forge.spec.title).toBe("Uploaded API");
    expect((await forge.app.inject({ method: "GET", url: "/widgets", headers: { "x-session-id": "keep" } })).statusCode).toBe(200);
  });

  it("an upload replaces the previous spec's routes", async () => {
    const forge = await bootEmpty();
    await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: minimal, filename: "widgets.yaml" }
    });
    expect((await forge.app.inject({ method: "GET", url: "/widgets", headers: { "x-session-id": "a" } })).statusCode).toBe(200);

    const second = [
      "openapi: 3.0.3",
      "info:",
      "  title: Second API",
      "  version: 2.0.0",
      "paths:",
      "  /gadgets:",
      "    get:",
      "      operationId: listGadgets",
      "      responses:",
      "        '200':",
      "          description: gadgets",
      "          content:",
      "            application/json:",
      "              schema:",
      "                type: array",
      "                items:",
      "                  type: object"
    ].join("\n");
    const res = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: second, filename: "gadgets.yaml" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Second API");
    expect((await forge.app.inject({ method: "GET", url: "/gadgets", headers: { "x-session-id": "a" } })).statusCode).toBe(200);
    // The old shape is gone.
    expect((await forge.app.inject({ method: "GET", url: "/widgets", headers: { "x-session-id": "a" } })).statusCode).toBe(404);
  });

  it("a body with no spec content still reloads from disk", async () => {
    const forge = await bootEmpty();
    const res = await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: {}
    });
    // No file was given at boot, so there is nothing to reload.
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("MOCKFORGE_SPEC_INVALID");
    expect(forge.spec.loaded).toBe(false);
  });

  it("the uploaded spec survives validation in dev mode", async () => {
    const forge = await createMockForge({ specPath: "", mode: "dev" });
    open.push(forge);
    await forge.app.inject({
      method: "POST",
      url: "/__admin/spec",
      headers: { "content-type": "application/json" },
      payload: { spec: minimal, filename: "widgets.yaml" }
    });
    const list = await forge.app.inject({ method: "GET", url: "/widgets", headers: { "x-session-id": "devmode" } });
    expect(list.statusCode).toBe(200);
    expect(list.headers["x-mockforge-mode"]).toBe("dev");
  });
});
