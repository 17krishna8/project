// a09 - validation (phase 5)
// Proves the B2 validation rules: 400 with {path, reason} details, 415 for
// unsupported content types, 413 for bodies over 1 MB, that every response is
// schema-valid (checked here by an INDEPENDENT Ajv instance built from the
// fixture spec, not from application code) and the dev/prod mode switch.
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import yaml from "js-yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request, sessionHeader } from "../helpers/http.js";
import { fixture, startMockForge, type StartedServer } from "../helpers/server.js";

const spec = yaml.load(readFileSync(fixture("users.yaml"), "utf8")) as {
  components: { schemas: { User: Record<string, unknown> } };
};
// An INDEPENDENT validator built from the fixture spec: nothing here imports
// application code, and the formats are declared explicitly.
const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addFormat("email", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/);
ajv.addFormat("date-time", {
  type: "string",
  validate: (value: string) => !Number.isNaN(Date.parse(value))
});
const validateUser = ajv.compile(spec.components.schemas.User);

let server: StartedServer;
const SESSION = "a09";

describe("a09 validation", () => {
  beforeAll(async () => {
    server = await startMockForge(fixture("users.yaml"));
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("a09.1 a below-minimum value returns 400 with path and reason", async () => {
    const res = await request(server.baseUrl, "POST", "/users", {
      headers: sessionHeader(SESSION),
      body: { name: "Negative Balance", email: "negative.balance@example.in", balance: -5 }
    });
    expect(res.status).toBe(400);
    const body = res.body as { error?: { code?: string; details?: Array<{ path: string; reason: string }> } };
    expect(body.error?.code).toBeTruthy();
    const details = body.error?.details ?? [];
    expect(Array.isArray(details)).toBe(true);
    expect(details.length).toBeGreaterThan(0);
    const hit = details.find((d) => d.path.includes("balance"));
    expect(hit, `details were ${JSON.stringify(details)}`).toBeDefined();
    expect(typeof hit!.reason).toBe("string");
    expect(hit!.reason.length).toBeGreaterThan(0);
  });

  it("a09.2 a wrong type returns 400", async () => {
    const res = await request(server.baseUrl, "POST", "/users", {
      headers: sessionHeader(SESSION),
      body: { name: "Wrong Type", email: "wrong.type@example.in", balance: "not-a-number" }
    });
    expect(res.status).toBe(400);
    expect((res.body as { error?: { details?: unknown[] } }).error?.details?.length).toBeGreaterThan(0);
  });

  it("a09.3 a missing required field returns 400 naming that field", async () => {
    const res = await request(server.baseUrl, "POST", "/users", {
      headers: sessionHeader(SESSION),
      body: { name: "No Email" }
    });
    expect(res.status).toBe(400);
    const details = (res.body as { error?: { details?: Array<{ path: string }> } }).error?.details ?? [];
    expect(details.some((d) => d.path.includes("email"))).toBe(true);
  });

  it("a09.4 an unsupported content type returns 415", async () => {
    const res = await request(server.baseUrl, "POST", "/users", {
      headers: { ...sessionHeader(SESSION), "content-type": "text/plain" },
      rawBody: JSON.stringify({ name: "Plain Text", email: "plain.text@example.in" })
    });
    expect(res.status).toBe(415);
  });

  it("a09.5 a body over 1 MB returns 413", async () => {
    const huge = JSON.stringify({ name: "x".repeat(1_100_000), email: "huge.body@example.in" });
    const res = await request(server.baseUrl, "POST", "/users", {
      headers: { ...sessionHeader(SESSION), "content-type": "application/json" },
      rawBody: huge
    });
    expect(res.status).toBe(413);
  });

  it("a09.6 every response body validates against the spec with an independent Ajv", async () => {
    const created = await request(server.baseUrl, "POST", "/users", {
      headers: sessionHeader(SESSION),
      body: { name: "Ajv Checked", email: "ajv.checked@example.in", balance: 42.5 }
    });
    expect(created.status).toBe(201);
    expect(validateUser(created.body), JSON.stringify(validateUser.errors)).toBe(true);

    const id = (created.body as { id: string }).id;
    const read = await request(server.baseUrl, "GET", `/users/${id}`, { headers: sessionHeader(SESSION) });
    expect(validateUser(read.body), JSON.stringify(validateUser.errors)).toBe(true);

    const patched = await request(server.baseUrl, "PATCH", `/users/${id}`, {
      headers: sessionHeader(SESSION),
      body: { balance: 99.99 }
    });
    expect(validateUser(patched.body), JSON.stringify(validateUser.errors)).toBe(true);

    const listed = await request(server.baseUrl, "GET", "/users?limit=100", { headers: sessionHeader(SESSION) });
    for (const user of listed.body as unknown[]) {
      expect(validateUser(user), JSON.stringify(validateUser.errors)).toBe(true);
    }
  });

  it("a09.7 dev mode is the default and prod mode is switchable", async () => {
    const dev = await request(server.baseUrl, "GET", "/users", { headers: sessionHeader(SESSION) });
    expect(dev.headers.get("x-mockforge-mode")).toBe("dev");

    const prod = await startMockForge(fixture("users.yaml"), { args: ["--mode", "prod"] });
    try {
      const res = await request(prod.baseUrl, "GET", "/users", { headers: sessionHeader("a09-prod") });
      expect(res.headers.get("x-mockforge-mode")).toBe("prod");
      expect(Array.isArray(res.body)).toBe(true);
    } finally {
      await prod.stop();
    }
  });
});
