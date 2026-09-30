import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  TIME_ANCHOR_ISO,
  TIME_ANCHOR_MS,
  generateFromPattern,
  generateRecord,
  generateSeedRecords,
  generateValue,
  seedCount
} from "../generator/generate.js";
import { dereference, mergeAllOf } from "../spec/refs.js";
import { createRandom, hashString, scopedRandom } from "../generator/random.js";
import type { GenerateContext, JsonSchema } from "../types.js";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../acceptance/fixtures");
const userSpec = yaml.load(readFileSync(path.join(fixtures, "users.yaml"), "utf8")) as Record<string, any>;
const userSchema = userSpec.components.schemas.User as JsonSchema;

function context(overrides: Partial<GenerateContext> = {}): GenerateContext {
  return {
    path: "/",
    fieldName: null,
    rand: createRandom(7),
    depth: 0,
    sessionId: "unit",
    resource: "users",
    root: userSpec,
    ...overrides
  };
}

describe("random", () => {
  it("is deterministic for the same seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces different streams for different seeds", () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it("hashes strings stably", () => {
    expect(hashString("mockforge")).toBe(hashString("mockforge"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });

  it("scopes randomness to its parts", () => {
    expect(scopedRandom(["s", "users", 0])()).toBe(scopedRandom(["s", "users", 0])());
    expect(scopedRandom(["s", "users", 0])()).not.toBe(scopedRandom(["s", "users", 1])());
  });
});

describe("generateFromPattern", () => {
  const cases: Array<[string, RegExp]> = [
    ["^usr_[A-Za-z0-9]{6,12}$", /^usr_[A-Za-z0-9]{6,12}$/],
    ["^(\\+91)?[6-9]\\d{9}$", /^(\+91)?[6-9]\d{9}$/],
    ["^[1-9][0-9]{5}$", /^[1-9][0-9]{5}$/],
    ["^(cat|dog|bird)$", /^(cat|dog|bird)$/],
    ["^a+b?c*$", /^a+b?c*$/],
    ["^[A-Z]{2}-\\d{4}$", /^[A-Z]{2}-\d{4}$/],
    ["^(?:foo|bar)-\\d{2,4}$", /^(?:foo|bar)-\d{2,4}$/]
  ];

  for (const [pattern, regex] of cases) {
    it(`generates values matching ${pattern}`, () => {
      const rand = createRandom(1234);
      for (let i = 0; i < 50; i++) {
        const value = generateFromPattern(pattern, rand);
        expect(value, `generated ${value}`).not.toBeNull();
        expect(value!).toMatch(regex);
      }
    });
  }

  it("stays bounded on hostile patterns", () => {
    const started = Date.now();
    const value = generateFromPattern("(a+)+$", createRandom(1), 32);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(typeof value).toBe("string");
  });
});

describe("generateValue", () => {
  it("only ever returns declared enum values", () => {
    const rand = createRandom(99);
    for (let i = 0; i < 30; i++) {
      const value = generateValue({ type: "string", enum: ["active", "blocked"] }, context({ rand }));
      expect(["active", "blocked"]).toContain(value);
    }
  });

  it("respects minimum and maximum for numbers", () => {
    const rand = createRandom(5);
    for (let i = 0; i < 50; i++) {
      const value = generateValue({ type: "number", minimum: 10, maximum: 20 }, context({ rand })) as number;
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThanOrEqual(20);
    }
  });

  it("respects minimum and maximum for integers", () => {
    const rand = createRandom(6);
    for (let i = 0; i < 50; i++) {
      const value = generateValue({ type: "integer", minimum: 18, maximum: 65 }, context({ rand })) as number;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(18);
      expect(value).toBeLessThanOrEqual(65);
    }
  });

  it("respects minLength and maxLength for strings", () => {
    const rand = createRandom(8);
    for (let i = 0; i < 30; i++) {
      const value = generateValue({ type: "string", minLength: 5, maxLength: 8 }, context({ rand })) as string;
      expect(value.length).toBeGreaterThanOrEqual(5);
      expect(value.length).toBeLessThanOrEqual(8);
    }
  });

  it("produces ISO 8601 timestamps for date-time", () => {
    const value = generateValue({ type: "string", format: "date-time" }, context()) as string;
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(value))).toBe(false);
  });

  it("keeps the timestamp anchor within two years of now (fails when stale)", () => {
    expect(TIME_ANCHOR_MS).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(TIME_ANCHOR_MS).toBeGreaterThan(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    expect(TIME_ANCHOR_ISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("produces valid emails for the email format", () => {
    const value = generateValue({ type: "string", format: "email" }, context()) as string;
    expect(value).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("generates arrays within minItems and maxItems", () => {
    const value = generateValue({ type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 }, context()) as unknown[];
    expect(value.length).toBeGreaterThanOrEqual(2);
    expect(value.length).toBeLessThanOrEqual(3);
  });

  it("always includes required properties", () => {
    const record = generateValue(userSchema, context()) as Record<string, unknown>;
    for (const field of userSchema.required ?? []) {
      expect(record[field], `missing ${field}`).toBeDefined();
    }
  });

  it("never invents properties outside the schema", () => {
    const record = generateValue(userSchema, context()) as Record<string, unknown>;
    const allowed = new Set(Object.keys(userSchema.properties ?? {}));
    for (const key of Object.keys(record)) expect(allowed.has(key)).toBe(true);
  });

  it("terminates on a circular schema", () => {
    const circular = {
      type: "object",
      properties: {
        label: { type: "string" },
        children: { type: "array", items: { $ref: "#/components/schemas/Node" } }
      },
      components: { schemas: { Node: { $ref: "#/components/schemas/Node" } } }
    } as unknown as JsonSchema;
    const started = Date.now();
    const value = generateValue(circular, context({ root: circular as unknown as Record<string, unknown> }));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(typeof value).toBe("object");
  });

  it("resolves local refs", () => {
    const resolved = dereference({ $ref: "#/components/schemas/User" }, userSpec);
    expect(resolved?.type).toBe("object");
    expect(dereference({ $ref: "#/components/schemas/Nope" }, userSpec)).toBeNull();
    expect(dereference(null, userSpec)).toBeNull();
  });

  it("merges allOf branches", () => {
    const merged = mergeAllOf(
      {
        allOf: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, { properties: { b: { type: "number" } } }]
      },
      {}
    );
    expect(Object.keys(merged.properties ?? {}).sort()).toEqual(["a", "b"]);
    expect(merged.required).toEqual(["a"]);
  });
});

describe("records and seeding", () => {
  it("generates a record that carries the id field", () => {
    const record = generateRecord(userSchema, "id", context());
    expect(typeof record.id).toBe("string");
    expect(String(record.id).length).toBeGreaterThan(0);
  });

  it("seeds between 5 and 10 records, deterministically per session", () => {
    expect(seedCount("alice", "users")).toBeGreaterThanOrEqual(5);
    expect(seedCount("alice", "users")).toBeLessThanOrEqual(10);
    expect(seedCount("alice", "users")).toBe(seedCount("alice", "users"));
    expect(seedCount("alice", "users")).not.toBe(seedCount("bob", "users"));
  });

  it("produces identical seed records for the same session and seed", () => {
    const options = { root: userSpec, seed: 42, sessionId: "s1", resource: "users" };
    const first = generateSeedRecords(userSchema, "id", options);
    const second = generateSeedRecords(userSchema, "id", options);
    expect(second).toEqual(first);
    const other = generateSeedRecords(userSchema, "id", { ...options, seed: 43 });
    expect(other).not.toEqual(first);
  });

  it("seeds a different set for a different session", () => {
    const options = { root: userSpec, seed: 42, sessionId: "s1", resource: "users" };
    const other = generateSeedRecords(userSchema, "id", { ...options, sessionId: "s2" });
    expect(other).not.toEqual(generateSeedRecords(userSchema, "id", options));
  });
});
