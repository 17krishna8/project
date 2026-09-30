// a07 - limits (phase 4)
// Proves the B2 session limits: TTL expiry, max sessions with LRU eviction and
// max records per session resource.
import { describe, expect, it } from "vitest";
import { request, sessionHeader } from "../helpers/http.js";
import { fixture, startMockForge, type StartedServer } from "../helpers/server.js";

async function create(server: StartedServer, session: string, name: string) {
  const res = await request(server.baseUrl, "POST", "/users", {
    headers: sessionHeader(session),
    body: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.in` }
  });
  return res;
}

async function names(server: StartedServer, session: string) {
  const res = await request(server.baseUrl, "GET", "/users?limit=100", { headers: sessionHeader(session) });
  expect(res.status).toBe(200);
  return (res.body as Array<Record<string, any>>).map((u) => String(u.name));
}

describe("a07 limits", () => {
  it("a07.1 an expired session loses its records (TTL)", async () => {
    const server = await startMockForge(fixture("users.yaml"), { args: ["--session-ttl-min", "0"] });
    try {
      expect((await create(server, "ttl-session", "Ephemeral Record")).status).toBe(201);
      expect(await names(server, "ttl-session")).toContain("Ephemeral Record");
      await new Promise((r) => setTimeout(r, 300));
      expect(await names(server, "ttl-session")).not.toContain("Ephemeral Record");
    } finally {
      await server.stop();
    }
  });

  it("a07.2 exceeding max sessions evicts the least recently used session", async () => {
    const server = await startMockForge(fixture("users.yaml"), { args: ["--max-sessions", "3"] });
    try {
      expect((await create(server, "s1", "Record S1")).status).toBe(201);
      expect((await create(server, "s2", "Record S2")).status).toBe(201);
      expect((await create(server, "s3", "Record S3")).status).toBe(201);
      expect((await create(server, "s4", "Record S4")).status).toBe(201);
      expect(await names(server, "s4")).toContain("Record S4");
      expect(await names(server, "s3")).toContain("Record S3");
      expect(await names(server, "s1")).not.toContain("Record S1");
    } finally {
      await server.stop();
    }
  });

  it("a07.3 exceeding max records per session returns 409 MOCKFORGE_LIMIT_RECORDS", async () => {
    const server = await startMockForge(fixture("users.yaml"), { args: ["--max-records", "10"] });
    try {
      for (let i = 0; i < 10; i++) {
        const res = await create(server, "cap-session", `Record ${i}`);
        expect(res.status, `record ${i} should be accepted`).toBe(201);
      }
      const overflow = await create(server, "cap-session", "One Too Many");
      expect(overflow.status).toBe(409);
      const body = overflow.body as { error?: { code?: string } };
      expect(body.error?.code).toBe("MOCKFORGE_LIMIT_RECORDS");
    } finally {
      await server.stop();
    }
  });
});
