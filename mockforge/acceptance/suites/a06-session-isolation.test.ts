// a06 - session isolation (phase 4)
// Proves B1.4 (zero persistence leaks: state isolated per session via
// X-Session-Id) and the B2 session rules: header, cookie fallback, concurrent
// sessions and admin reset.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request, sessionHeader } from "../helpers/http.js";
import { fixture, startMockForge, type StartedServer } from "../helpers/server.js";

let server: StartedServer;

async function createIn(session: string, name: string) {
  const res = await request(server.baseUrl, "POST", "/users", {
    headers: sessionHeader(session),
    body: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.in` }
  });
  expect(res.status).toBe(201);
  return res.body as Record<string, any>;
}

async function namesIn(session: string) {
  const res = await request(server.baseUrl, "GET", "/users?limit=100", { headers: sessionHeader(session) });
  expect(res.status).toBe(200);
  return (res.body as Array<Record<string, any>>).map((u) => String(u.name));
}

describe("a06 session isolation", () => {
  beforeAll(async () => {
    server = await startMockForge(fixture("users.yaml"));
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("a06.1 one session never sees another session's records", async () => {
    await createIn("alice", "Alice Only");
    await createIn("bob", "Bob Only");
    const aliceNames = await namesIn("alice");
    const bobNames = await namesIn("bob");
    expect(aliceNames).toContain("Alice Only");
    expect(aliceNames).not.toContain("Bob Only");
    expect(bobNames).toContain("Bob Only");
    expect(bobNames).not.toContain("Alice Only");
  });

  it("a06.2 a missing X-Session-Id gets an mf_session cookie that carries the session", async () => {
    const first = await request(server.baseUrl, "POST", "/users", {
      body: { name: "Cookie Session", email: "cookie.session@example.in" }
    });
    expect(first.status).toBe(201);
    const cookie = first.setCookies.find((c) => c.startsWith("mf_session="));
    expect(cookie, `no mf_session cookie in ${JSON.stringify(first.setCookies)}`).toBeTruthy();
    const cookieHeader = cookie!.split(";")[0] ?? "";

    const list = await request(server.baseUrl, "GET", "/users", { headers: { cookie: cookieHeader } });
    const names = (list.body as Array<Record<string, any>>).map((u) => String(u.name));
    expect(names).toContain("Cookie Session");

    const withoutCookie = await request(server.baseUrl, "GET", "/users");
    const freshNames = (withoutCookie.body as Array<Record<string, any>>).map((u) => String(u.name));
    expect(freshNames).not.toContain("Cookie Session");
  });

  it("a06.3 concurrent sessions stay isolated from each other", async () => {
    const sessions = ["conc-a", "conc-b", "conc-c", "conc-d", "conc-e"];
    await Promise.all(sessions.map((s) => createIn(s, `Record ${s}`)));
    for (const session of sessions) {
      const names = await namesIn(session);
      expect(names).toContain(`Record ${session}`);
      for (const other of sessions) {
        if (other !== session) expect(names).not.toContain(`Record ${other}`);
      }
    }
  });

  it("a06.4 deleting all sessions resets every session's data", async () => {
    await createIn("reset-me", "Before Reset");
    expect(await namesIn("reset-me")).toContain("Before Reset");
    const reset = await request(server.baseUrl, "DELETE", "/__admin/sessions");
    expect(reset.status).toBe(204);
    expect(await namesIn("reset-me")).not.toContain("Before Reset");
  });
});
