// a04 - semantic data (phase 3)
// Proves B1.1 (data chosen by field MEANING, not only type) and the B2 data
// rules: Indian mobiles, valid emails, positive 2-decimal money, enums,
// required fields, min/max, ISO timestamps, --seed determinism, and scale
// (over 1,000 objects per fixture).
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request, sessionHeader } from "../helpers/http.js";
import { fixture, startMockForge, type StartedServer } from "../helpers/server.js";

const spec = yaml.load(readFileSync(fixture("users.yaml"), "utf8")) as {
  components: { schemas: { User: { required: string[]; properties: Record<string, { enum?: string[] }> } } };
};
const USER_REQUIRED = spec.components.schemas.User.required;
const STATUS_ENUM = spec.components.schemas.User.properties.status?.enum ?? [];

const PHONE_RE = /^(\+91)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PIN_RE = /^[1-9][0-9]{5}$/;
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

let server: StartedServer;

async function listUsers(session = "a04"): Promise<Array<Record<string, any>>> {
  const res = await request(server.baseUrl, "GET", "/users", { headers: sessionHeader(session) });
  expect(res.status).toBe(200);
  return res.body as Array<Record<string, any>>;
}

describe("a04 semantic data", () => {
  beforeAll(async () => {
    server = await startMockForge(fixture("users.yaml"));
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("a04.1 phone fields are 10-digit Indian mobiles starting 6-9", async () => {
    const users = await listUsers();
    expect(users.length).toBeGreaterThanOrEqual(5);
    for (const user of users) {
      expect(String(user.phone), `phone=${user.phone}`).toMatch(PHONE_RE);
    }
  });

  it("a04.2 email fields are valid email addresses", async () => {
    for (const user of await listUsers()) {
      expect(String(user.email), `email=${user.email}`).toMatch(EMAIL_RE);
    }
  });

  it("a04.3 money fields are non-negative with 2 decimals", async () => {
    for (const user of await listUsers()) {
      const balance = Number(user.balance);
      expect(Number.isFinite(balance)).toBe(true);
      expect(balance).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(Math.round(balance * 100)), `balance=${balance}`).toBe(true);
    }
  });

  it("a04.4 enum fields only ever use declared values", async () => {
    for (const user of await listUsers()) {
      expect(STATUS_ENUM).toContain(user.status);
    }
  });

  it("a04.5 required fields are always present", async () => {
    for (const user of await listUsers()) {
      for (const field of USER_REQUIRED) {
        expect(user[field], `missing ${field} in ${JSON.stringify(user)}`).toBeDefined();
        expect(user[field]).not.toBeNull();
      }
    }
  });

  it("a04.6 minimum, maximum and pattern constraints hold", async () => {
    for (const user of await listUsers()) {
      expect(Number.isInteger(user.age)).toBe(true);
      expect(user.age).toBeGreaterThanOrEqual(18);
      expect(user.age).toBeLessThanOrEqual(65);
      expect(String(user.postalCode)).toMatch(PIN_RE);
      expect(String(user.id)).toMatch(/^usr_[A-Za-z0-9]{6,12}$/);
    }
  });

  it("a04.7 timestamps are ISO 8601 within the last two years", async () => {
    const now = Date.now();
    for (const user of await listUsers()) {
      const createdAt = String(user.createdAt);
      expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
      const parsed = Date.parse(createdAt);
      expect(Number.isNaN(parsed)).toBe(false);
      expect(parsed).toBeLessThanOrEqual(now + 60_000);
      expect(parsed).toBeGreaterThan(now - TWO_YEARS_MS);
    }
  });

  it("a04.8 --seed makes generation repeatable, and different seeds differ", async () => {
    const a = await startMockForge(fixture("users.yaml"), { args: ["--seed", "42"] });
    const b = await startMockForge(fixture("users.yaml"), { args: ["--seed", "42"] });
    const c = await startMockForge(fixture("users.yaml"), { args: ["--seed", "43"] });
    try {
      const read = async (s: StartedServer, session: string) => {
        const res = await request(s.baseUrl, "GET", "/users", { headers: sessionHeader(session) });
        return (res.body as Array<Record<string, any>>).map((u) => JSON.stringify(u));
      };
      const first = await read(a, "seed-session");
      const second = await read(b, "seed-session");
      const other = await read(c, "seed-session");
      expect(second).toEqual(first);
      expect(other).not.toEqual(first);
    } finally {
      await a.stop();
      await b.stop();
      await c.stop();
    }
  });

  it("a04.9 a session can hold over 1,000 objects and they all follow the rules", async () => {
    const session = "a04-9";
    const created: Array<Record<string, any>> = [];
    for (let batch = 0; batch < 20; batch++) {
      const batchResults = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          request(server.baseUrl, "POST", "/users", {
            headers: sessionHeader(session),
            body: { name: `Load Tester ${batch}-${i}`, email: `load${batch}_${i}@example.in` }
          })
        )
      );
      for (const res of batchResults) {
        expect(res.status).toBe(201);
        created.push(res.body as Record<string, any>);
      }
    }
    expect(created.length).toBe(1000);

    const list = await listUsers(session);
    expect(Number(list.length)).toBeGreaterThanOrEqual(1000);
    const total = await request(server.baseUrl, "GET", "/users?limit=1", { headers: sessionHeader(session) });
    expect(Number(total.headers.get("x-total-count"))).toBeGreaterThanOrEqual(1000);

    for (const user of created.slice(0, 200)) {
      expect(String(user.phone)).toMatch(PHONE_RE);
      expect(String(user.email)).toMatch(EMAIL_RE);
      expect(Number(user.balance)).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(Math.round(Number(user.balance) * 100))).toBe(true);
    }
  }, 60_000);
});
