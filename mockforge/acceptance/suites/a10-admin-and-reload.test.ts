// a10 - admin and reload (phase 6)
// Proves the B2 reserved paths: /__admin/routes, chaos, sessions and their
// data, the SSE log stream with all documented fields, and hot reload through
// POST /__admin/spec and --watch.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSse, request, sessionHeader } from "../helpers/http.js";
import { fixture, startMockForge, tmpFile } from "../helpers/server.js";

const SESSION = "a10";

describe("a10 admin and reload", () => {
  it("a10.1 GET /__admin/routes lists method, path, kind and resource", async () => {
    const server = await startMockForge(fixture("users.yaml"));
    try {
      const res = await request<Array<{ method: string; path: string; kind: string; resource: string | null }>>(
        server.baseUrl,
        "GET",
        "/__admin/routes"
      );
      expect(res.status).toBe(200);
      const routes = res.body as Array<{ method: string; path: string; kind: string; resource: string | null }>;
      expect(routes.length).toBeGreaterThan(0);
      const list = routes.find((r) => r.method === "GET" && r.path === "/users");
      const create = routes.find((r) => r.method === "POST" && r.path === "/users");
      const read = routes.find((r) => r.method === "GET" && r.path === "/users/{id}");
      const remove = routes.find((r) => r.method === "DELETE" && r.path === "/users/{id}");
      expect(list?.kind).toBe("list");
      expect(list?.resource).toBe("users");
      expect(create?.kind).toBe("create");
      expect(read?.kind).toBe("read");
      expect(remove?.kind).toBe("remove");
    } finally {
      await server.stop();
    }
  });

  it("a10.2 session admin routes list, inspect, delete one and delete all", async () => {
    const server = await startMockForge(fixture("users.yaml"));
    try {
      await request(server.baseUrl, "POST", "/users", {
        headers: sessionHeader(SESSION),
        body: { name: "Admin Visible", email: "admin.visible@example.in" }
      });

      const sessions = await request<Array<{ id: string }>>(server.baseUrl, "GET", "/__admin/sessions");
      expect(sessions.status).toBe(200);
      const ids = (sessions.body as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain(SESSION);

      const data = await request(server.baseUrl, "GET", `/__admin/sessions/${SESSION}/data`);
      expect(data.status).toBe(200);
      const body = data.body as { users?: Array<{ name: string }> };
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.users!.some((u) => u.name === "Admin Visible")).toBe(true);

      const del = await request(server.baseUrl, "DELETE", `/__admin/sessions/${SESSION}`);
      expect(del.status).toBe(204);
      expect((await request(server.baseUrl, "GET", `/__admin/sessions/${SESSION}/data`)).status).toBe(404);

      await request(server.baseUrl, "POST", "/users", {
        headers: sessionHeader("a10-2b"),
        body: { name: "Reset Me", email: "reset.me@example.in" }
      });
      expect((await request(server.baseUrl, "DELETE", "/__admin/sessions")).status).toBe(204);
      const after = await request<Array<{ id: string }>>(server.baseUrl, "GET", "/__admin/sessions");
      expect((after.body as Array<{ id: string }>).map((s) => s.id)).not.toContain("a10-2b");
    } finally {
      await server.stop();
    }
  });

  it("a10.3 the log stream emits events with every documented field", async () => {
    const server = await startMockForge(fixture("users.yaml"));
    try {
      const stream = readSse(`${server.baseUrl}/__admin/logs`, { count: 3, ms: 8000 });
      await new Promise((r) => setTimeout(r, 300));
      await request(server.baseUrl, "GET", "/users", { headers: sessionHeader(SESSION) });
      await request(server.baseUrl, "POST", "/users", {
        headers: sessionHeader(SESSION),
        body: { name: "Logged Request", email: "logged.request@example.in" }
      });
      await request(server.baseUrl, "GET", "/users/does-not-exist", { headers: sessionHeader(SESSION) });

      const events = await stream;
      expect(events.length).toBeGreaterThanOrEqual(3);
      const paths = new Set<string>();
      for (const raw of events) {
        const event = JSON.parse(raw) as Record<string, unknown>;
        for (const key of ["time", "session", "method", "path", "status", "latencyMs", "fault", "validation"]) {
          expect(event, `event ${raw} missing ${key}`).toHaveProperty(key);
        }
        paths.add(String(event.path));
      }
      expect(paths).toContain("/users");
    } finally {
      await server.stop();
    }
  });

  it("a10.4 POST /__admin/spec hot reloads a changed spec", async () => {
    const v1 = [
      "openapi: 3.0.3",
      "info:",
      "  title: Reload API",
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
    const file = tmpFile("reload.yaml", v1);
    const server = await startMockForge(file);
    try {
      expect((await request(server.baseUrl, "GET", "/ping")).status).toBe(200);

      const v2 = v1.replace("  /ping:", "  /ping:\n  /pong:\n    get:\n      operationId: pong\n      responses:\n        '200':\n          description: pong\n          content:\n            application/json:\n              schema:\n                type: object");
      writeFileSync(file, v2);

      const reload = await request(server.baseUrl, "POST", "/__admin/spec", { body: {} });
      expect(reload.status).toBe(200);
      const routes = await request<Array<{ path: string }>>(server.baseUrl, "GET", "/__admin/routes");
      const paths = (routes.body as Array<{ path: string }>).map((r) => r.path);
      expect(paths).toContain("/pong");
      expect((await request(server.baseUrl, "GET", "/pong")).status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it("a10.5 an invalid spec during reload is rejected and the old routes keep working", async () => {
    const v1 = [
      "openapi: 3.0.3",
      "info:",
      "  title: Reload Guard",
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
    const file = tmpFile("reload-guard.yaml", v1);
    const server = await startMockForge(file);
    try {
      writeFileSync(file, "this: [is not, a valid spec");
      const reload = await request(server.baseUrl, "POST", "/__admin/spec", { body: {} });
      expect(reload.status).toBeGreaterThanOrEqual(400);
      expect((await request(server.baseUrl, "GET", "/ping")).status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it("a10.6 --watch reloads the spec without an admin call", async () => {
    const v1 = [
      "openapi: 3.0.3",
      "info:",
      "  title: Watch API",
      "  version: 1.0.0",
      "paths:",
      "  /alpha:",
      "    get:",
      "      operationId: alpha",
      "      responses:",
      "        '200':",
      "          description: ok",
      "          content:",
      "            application/json:",
      "              schema:",
      "                type: object"
    ].join("\n");
    const file = tmpFile("watch.yaml", v1);
    const server = await startMockForge(file, { args: ["--watch"] });
    try {
      const beta = v1.replace(
        "  /alpha:",
        "  /alpha:\n  /beta:\n    get:\n      operationId: beta\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: object"
      );
      writeFileSync(file, beta);

      const deadline = Date.now() + 8000;
      let seen = false;
      while (Date.now() < deadline) {
        const routes = await request<Array<{ path: string }>>(server.baseUrl, "GET", "/__admin/routes");
        if ((routes.body as Array<{ path: string }>).some((r) => r.path === "/beta")) {
          seen = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(seen, "watcher did not pick up the new /beta route").toBe(true);
      expect((await request(server.baseUrl, "GET", "/beta")).status).toBe(200);
    } finally {
      await server.stop();
    }
  }, 20_000);
});
