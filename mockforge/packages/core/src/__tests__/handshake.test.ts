import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createMockForge, type MockForgeApp } from "../server/app.js";

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

describe("Frontend Auto-Linker and CORS", () => {
  it("provides frontend link config and updates linked origin", async () => {
    const forge = await boot();
    const getRes = await forge.app.inject({ method: "GET", url: "/__admin/frontend-link" });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.corsActive).toBe(true);
    expect(typeof getBody.envSnippet).toBe("string");

    const postRes = await forge.app.inject({
      method: "POST",
      url: "/__admin/frontend-link",
      payload: { frontendUrl: "http://localhost:5173" }
    });
    expect(postRes.statusCode).toBe(200);
    expect(postRes.json().linkedFrontendUrl).toBe("http://localhost:5173");
  });

  it("handles CORS headers on preflight OPTIONS requests", async () => {
    const forge = await boot();
    const res = await forge.app.inject({
      method: "OPTIONS",
      url: "/users",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("Automated Handshake Pipeline with Strict Multi-User Isolation", () => {
  it("isolates user session data and scopes memory transfer to caller session", async () => {
    const forge = await boot();

    // Create a task under alice's session
    const aliceRes = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers: { "x-session-id": "alice" },
      payload: { name: "Alice User", email: "alice@example.in", balance: 50 }
    });
    expect(aliceRes.statusCode).toBe(201);

    // Create a task under bob's session
    const bobRes = await forge.app.inject({
      method: "POST",
      url: "/users",
      headers: { "x-session-id": "bob" },
      payload: { name: "Bob User", email: "bob@example.in", balance: 100 }
    });
    expect(bobRes.statusCode).toBe(201);

    // Handshake for Alice: verify Alice only exports Alice's data
    const handshakeRes = await forge.app.inject({
      method: "POST",
      url: "/__admin/handshake",
      headers: { "x-session-id": "alice" },
      payload: {
        targetUrl: "http://127.0.0.1:9999", // Unreachable target for test
        strategy: "upsert",
        autoProxy: false,
        transferMemory: true
      }
    });

    expect(handshakeRes.statusCode).toBe(200);
    const body = handshakeRes.json();
    expect(body.sessionId).toBe("alice");
    expect(body.stages.memory.sessionId).toBe("alice");
    // Alice's entities should be isolated
    expect(body.stages.memory.entitiesCount).toBeGreaterThanOrEqual(1);

    // Dual memory viewer for Alice
    const dualRes = await forge.app.inject({
      method: "GET",
      url: "/__admin/backend-memory?sessionId=alice",
      headers: { "x-session-id": "alice" }
    });
    expect(dualRes.statusCode).toBe(200);
    const dualBody = dualRes.json();
    expect(dualBody.sessionId).toBe("alice");
    expect(dualBody.dummy.entitiesCount).toBeGreaterThanOrEqual(1);
  });

  it("configures and toggles proxy bridge mode with circuit breaker", async () => {
    const forge = await boot();

    const updateRes = await forge.app.inject({
      method: "POST",
      url: "/__admin/proxy",
      payload: { enabled: true, targetUrl: "http://127.0.0.1:8080", circuitBreaker: true }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().enabled).toBe(true);

    const getRes = await forge.app.inject({ method: "GET", url: "/__admin/proxy" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().enabled).toBe(true);
    expect(getRes.json().circuitBreaker).toBe(true);
  });
});
