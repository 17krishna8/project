// a01 - boot and routes (phase 2)
// Proves B1.6 (boots in under 5 seconds) and B2 (reserved paths, documented
// status codes per method, JSON error shape for unknown paths/methods).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request, sessionHeader } from "../helpers/http.js";
import { fixture, startMockForge, type StartedServer } from "../helpers/server.js";

let server: StartedServer;

beforeAll(async () => {
  server = await startMockForge(fixture("users.yaml"));
}, 30_000);

afterAll(async () => {
  await server.stop();
});

describe("a01 boot and routes", () => {
  it("a01.1 every fixture boots in under 5 seconds", async () => {
    for (const name of ["users.yaml", "petstore.yaml", "circular.yaml"]) {
      const t0 = Date.now();
      const s = await startMockForge(fixture(name));
      const elapsed = Date.now() - t0;
      await s.stop();
      expect(elapsed, `${name} booted in ${elapsed}ms`).toBeLessThan(5000);
    }
  });

  it("a01.2 GET /__health reports status, routes, sessions, uptime and boot time", async () => {
    const res = await request(server.baseUrl, "GET", "/__health");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(typeof body.routes).toBe("number");
    expect(body.routes as number).toBeGreaterThan(0);
    expect(typeof body.sessions).toBe("number");
    expect(typeof body.uptimeMs).toBe("number");
    expect(typeof body.bootMs).toBe("number");
    expect(body.bootMs as number).toBeLessThan(5000);
  });

  it("a01.3 every declared path and method answers with its documented status", async () => {
    const list = await request(server.baseUrl, "GET", "/users");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);

    const created = await request(server.baseUrl, "POST", "/users", {
      headers: sessionHeader("a01-3"),
      body: { name: "Asha Rao", email: "asha.rao@example.in" }
    });
    expect(created.status).toBe(201);
    const id = (created.body as Record<string, unknown>).id as string;
    expect(typeof id).toBe("string");

    expect((await request(server.baseUrl, "GET", `/users/${id}`, { headers: sessionHeader("a01-3") })).status).toBe(200);
    expect(
      (
        await request(server.baseUrl, "PUT", `/users/${id}`, {
          headers: sessionHeader("a01-3"),
          body: { name: "Asha Rao", email: "asha.rao@example.in", balance: 10 }
        })
      ).status
    ).toBe(200);
    expect(
      (
        await request(server.baseUrl, "PATCH", `/users/${id}`, {
          headers: sessionHeader("a01-3"),
          body: { balance: 25.5 }
        })
      ).status
    ).toBe(200);
    expect((await request(server.baseUrl, "DELETE", `/users/${id}`, { headers: sessionHeader("a01-3") })).status).toBe(204);
  });

  it("a01.4 an unknown path returns 404 with the JSON error shape", async () => {
    const res = await request(server.baseUrl, "GET", "/nope");
    expect(res.status).toBe(404);
    const body = res.body as { error?: { code?: string; message?: string; details?: unknown } };
    expect(body.error).toBeDefined();
    expect(typeof body.error?.code).toBe("string");
    expect(typeof body.error?.message).toBe("string");
    expect(Array.isArray(body.error?.details)).toBe(true);
  });

  it("a01.5 an undeclared method on a known path returns 405 with Allow", async () => {
    const res = await request(server.baseUrl, "DELETE", "/users");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBeTruthy();
  });

  it("a01.6 list responses carry the X-Total-Count header", async () => {
    const res = await request(server.baseUrl, "GET", "/users");
    expect(res.status).toBe(200);
    const total = res.headers.get("x-total-count");
    expect(total).not.toBeNull();
    expect(Number(total)).toBeGreaterThan(0);
  });
});
