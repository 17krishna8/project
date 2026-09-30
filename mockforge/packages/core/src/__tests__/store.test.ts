import { describe, expect, it } from "vitest";
import { DEFAULT_STORE_OPTIONS, Store, newSessionId, sanitizeSessionId } from "../state/store.js";
import { parseSpecFile } from "../spec/loader.js";
import { inferRoutes } from "../spec/routes.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../acceptance/fixtures");

function usersResource() {
  const { document, specVersion } = parseSpecFile(path.join(fixtures, "users.yaml"));
  const { resources } = inferRoutes(document, specVersion);
  const resource = resources[0]!;
  return { resource, root: document };
}

describe("sanitizeSessionId", () => {
  it("keeps the safe alphabet", () => {
    expect(sanitizeSessionId("abc-123_XYZ")).toBe("abc-123_XYZ");
  });

  it("strips unsafe characters", () => {
    expect(sanitizeSessionId("has spaces!and*chars")).toBe("hasspacesandchars");
  });

  it("truncates to 64 characters", () => {
    expect(sanitizeSessionId("x".repeat(200))).toHaveLength(64);
  });

  it("falls back to default when nothing safe remains", () => {
    expect(sanitizeSessionId("!!!!")).toBe("default");
    expect(sanitizeSessionId("")).toBe("default");
  });

  it("generates unique ids", () => {
    expect(newSessionId()).not.toBe(newSessionId());
  });
});

describe("Store", () => {
  it("creates a session on first use and reuses it afterwards", () => {
    const store = new Store();
    const first = store.session("alice");
    const second = store.session("alice");
    expect(second).toBe(first);
    expect(store.sessionIds()).toEqual(["alice"]);
  });

  it("seeds a resource deterministically on first touch", () => {
    const store = new Store();
    const { resource, root } = usersResource();
    const session = store.session("alice");
    const records = store.ensureSeeded(session, resource.name, resource.schema, resource.idField, root, 42);
    expect(records.size).toBeGreaterThanOrEqual(5);
    expect(records.size).toBeLessThanOrEqual(10);

    const other = new Store();
    const again = other.ensureSeeded(other.session("alice"), resource.name, resource.schema, resource.idField, root, 42);
    expect([...again.values()]).toEqual([...records.values()]);
  });

  it("does not reseed a resource that already has records", () => {
    const store = new Store();
    const { resource, root } = usersResource();
    const session = store.session("alice");
    const records = store.ensureSeeded(session, resource.name, resource.schema, resource.idField, root, 42);
    records.set("custom", { id: "custom" });
    expect(store.ensureSeeded(session, resource.name, resource.schema, resource.idField, root, 42).size).toBe(records.size);
  });

  it("keeps resources separate inside a session", () => {
    const store = new Store();
    const session = store.session("alice");
    store.records(session, "users").set("1", { id: "1" });
    store.records(session, "orders").set("2", { id: "2" });
    expect(store.records(session, "users").has("1")).toBe(true);
    expect(store.records(session, "users").has("2")).toBe(false);
  });

  it("resets one session and all sessions", () => {
    const store = new Store();
    store.session("a").resources.set("users", new Map([["1", { id: "1" }]]));
    store.session("b").resources.set("users", new Map([["2", { id: "2" }]]));
    store.resetSession("a");
    expect(store.sessionIds()).toEqual(["b"]);
    store.resetAll();
    expect(store.sessionIds()).toEqual([]);
  });

  it("exposes the documented default limits", () => {
    expect(DEFAULT_STORE_OPTIONS).toEqual({ sessionTtlMin: 60, maxSessions: 500, maxRecords: 10_000 });
  });
});

describe("Store lifecycle", () => {
  const { resource, root } = usersResource();
  const schema = resource.schema as Record<string, unknown> | null;

  function seeded(store: Store, sessionId: string) {
    const session = store.session(sessionId);
    return store.ensureSeeded(session, resource.name, schema, resource.idField, root, 1);
  }

  it("seeds a deterministic number of records per session", () => {
    const store = new Store();
    const first = seeded(store, "a");
    const second = seeded(store, "b");
    expect(first.size).toBeGreaterThanOrEqual(5);
    expect(first.size).toBeLessThanOrEqual(10);
    // The count varies per session (5..10) but each session is reproducible.
    expect(second.size).toBeGreaterThanOrEqual(5);
    expect(second.size).toBeLessThanOrEqual(10);
    expect([...first.keys()]).not.toEqual([...second.keys()]);
  });

  it("evicts the least recently used session when the cap is reached", () => {
    const store = new Store({ sessionTtlMin: 60, maxSessions: 2, maxRecords: 100 });
    store.session("one");
    store.session("two");
    // Date.now() has millisecond resolution, so make the order explicit.
    store.sessions.get("one")!.lastAccessAt = Date.now() - 5_000;
    store.sessions.get("two")!.lastAccessAt = Date.now() - 10_000;
    store.session("three");
    expect(store.sessionIds()).not.toContain("two");
    expect(store.sessionIds()).toContain("one");
    expect(store.sessionIds()).toContain("three");
    expect(store.sessions.size).toBe(2);
  });

  it("expires a session that has been idle past its ttl", () => {
    const store = new Store({ sessionTtlMin: 0, maxSessions: 10, maxRecords: 100 });
    seeded(store, "short-lived");
    expect(store.sessions.has("short-lived")).toBe(true);
    store.sweep();
    expect(store.sessions.has("short-lived")).toBe(false);
  });

  it("keeps a session that is still inside its ttl", () => {
    const store = new Store({ sessionTtlMin: 60, maxSessions: 10, maxRecords: 100 });
    seeded(store, "fresh");
    store.sweep();
    expect(store.sessions.has("fresh")).toBe(true);
  });

  it("counts only client-created records towards the record cap", () => {
    const store = new Store({ sessionTtlMin: 60, maxSessions: 10, maxRecords: 3 });
    const records = seeded(store, "capped");
    const session = store.sessions.get("capped")!;
    expect(records.size).toBeGreaterThan(3); // seeds are not counted
    expect(store.createdCount(session)).toBe(0);
    session.created.add("x");
    session.created.add("y");
    session.created.add("z");
    expect(store.createdCount(session)).toBe(3);
    store.forget(session, "x");
    expect(store.createdCount(session)).toBe(2);
  });

  it("reports per-session stats and clears everything on resetAll", () => {
    const store = new Store();
    seeded(store, "stats");
    const stats = store.stats(store.sessions.get("stats")!);
    expect(stats.resources).toBe(1);
    expect(stats.records).toBeGreaterThan(0);
    store.resetAll();
    expect(store.sessionIds()).toHaveLength(0);
  });

  it("gives every new session a unique id", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSessionId()));
    expect(ids.size).toBe(50);
  });
});
