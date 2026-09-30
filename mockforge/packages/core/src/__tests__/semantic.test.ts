// The product's promise: data that matches what the field MEANS.
import { describe, expect, it } from "vitest";
import { createRandom } from "../generator/random.js";
import { seedFaker, satisfiesConstraints, semanticValue } from "../generator/semantic.js";
import { generateRecord, generateValue } from "../generator/generate.js";
import type { GenerateContext, JsonSchema } from "../types.js";

const root = {} as Record<string, unknown>;

function ctx(fieldName: string | null, seed = 7): GenerateContext {
  return {
    path: "/users",
    fieldName,
    rand: createRandom(seed),
    depth: 0,
    sessionId: "semantics",
    resource: "users",
    root
  };
}

function value(fieldName: string, schema: JsonSchema = { type: "string" }): unknown {
  seedFaker(["semantics", "users", fieldName]);
  return semanticValue(schema, ctx(fieldName));
}

const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

describe("field-meaning rules", () => {
  const cases: Array<[string, string, (v: unknown) => void]> = [
    ["phoneNumber", "string", (v) => expect(v).toMatch(INDIAN_MOBILE)],
    ["mobile", "string", (v) => expect(v).toMatch(INDIAN_MOBILE)],
    ["contactNumber", "string", (v) => expect(v).toMatch(INDIAN_MOBILE)],
    ["postalCode", "string", (v) => expect(v).toMatch(/^[1-9][0-9]{5}$/)],
    ["pincode", "string", (v) => expect(v).toMatch(/^[1-9][0-9]{5}$/)],
    ["email", "string", (v) => expect(v).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i)],
    ["firstName", "string", (v) => expect(typeof v).toBe("string")],
    ["lastName", "string", (v) => expect(typeof v).toBe("string")],
    ["name", "string", (v) => expect(v as string).toMatch(/\s/)],
    ["balance", "number", (v) => expect(v as number).toBeGreaterThan(0)],
    ["totalPrice", "number", (v) => expect(v as number).toBeGreaterThan(0)],
    ["city", "string", (v) => expect(typeof v).toBe("string")],
    ["state", "string", (v) => expect(typeof v).toBe("string")],
    ["country", "string", (v) => expect(v).toBe("India")],
    ["company", "string", (v) => expect(typeof v).toBe("string")],
    ["age", "integer", (v) => {
      expect(v as number).toBeGreaterThanOrEqual(18);
      expect(v as number).toBeLessThanOrEqual(65);
    }],
    ["quantity", "integer", (v) => expect(v as number).toBeGreaterThan(0)],
    ["status", "string", (v) => expect(typeof v).toBe("string")],
    ["priority", "string", (v) => expect(typeof v).toBe("string")],
    ["role", "string", (v) => expect(typeof v).toBe("string")],
    ["gender", "string", (v) => expect(["male", "female", "other"]).toContain(v)],
    ["category", "string", (v) => expect(typeof v).toBe("string")],
    ["description", "string", (v) => expect((v as string).length).toBeGreaterThan(3)],
    ["title", "string", (v) => expect(typeof v).toBe("string")],
    ["website", "string", (v) => expect(v).toMatch(/^https:\/\//)],
    ["uuid", "string", (v) => expect(v).toMatch(/^[0-9a-f-]{36}$/i)],
    ["color", "string", (v) => expect(v).toMatch(/^#[0-9a-f]{6}$/)],
    ["ipAddress", "string", (v) => expect(v).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/)],
    ["latitude", "number", (v) => expect(v as number).toBeGreaterThan(7)],
    ["longitude", "number", (v) => expect(v as number).toBeLessThan(98)]
  ];

  for (const [fieldName, type, assertion] of cases) {
    it(`gives ${fieldName} a meaningful ${type}`, () => {
      assertion(value(fieldName, { type }));
    });
  }

  it("gives createdAt a recent ISO-8601 timestamp", () => {
    const created = value("createdAt", { type: "string", format: "date-time" }) as string;
    const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;
    expect(created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Date.now() - Date.parse(created)).toBeGreaterThanOrEqual(0);
    expect(Date.now() - Date.parse(created)).toBeLessThan(twoYears);
  });

  it("gives a date-only field a date-only value", () => {
    expect(value("createdAt", { type: "string", format: "date" })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("prices money with two decimals", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      seedFaker(["m", "u", "price"]);
      const price = semanticValue({ type: "number" }, ctx("price", seed)) as number;
      expect(price).toBeGreaterThan(0);
      // Exactly two decimals: no more digits after the decimal point.
      const decimals = String(price).split(".")[1] ?? "";
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });

  it("ignores unrelated field names", () => {
    expect(value("somethingElse")).toBeUndefined();
  });

  it("ignores a null schema and a missing field name", () => {
    expect(semanticValue(null, ctx("phone"))).toBeUndefined();
    expect(semanticValue({ type: "string" }, ctx(null))).toBeUndefined();
  });

  it("does not fire when the schema type disagrees with the rule", () => {
    expect(semanticValue({ type: "integer" }, ctx("phone"))).toBeUndefined();
  });
});

describe("schema constraints beat meaning", () => {
  it("steps aside for a pattern the value cannot satisfy", () => {
    // users.yaml id: ^usr_[A-Za-z0-9]{6,12}$ - no UUID will match that.
    const schema = { type: "string", pattern: "^usr_[A-Za-z0-9]{6,12}$" } as JsonSchema;
    expect(semanticValue(schema, ctx("id"))).toBeUndefined();
    const generated = generateValue(schema, ctx("id")) as string;
    expect(generated).toMatch(/^usr_[A-Za-z0-9]{6,12}$/);
  });

  it("steps aside for a minimum the value cannot satisfy", () => {
    expect(semanticValue({ type: "number", minimum: 900_000 }, ctx("balance"))).toBeUndefined();
  });

  it("steps aside for a length bound", () => {
    expect(semanticValue({ type: "string", maxLength: 3 }, ctx("name"))).toBeUndefined();
  });

  it("steps aside for a foreign date format", () => {
    expect(semanticValue({ type: "string", format: "email" }, ctx("createdAt"))).toBeUndefined();
  });

  it("keeps the enum when one is declared", () => {
    // The structural layer resolves enums before the meaning rules run.
    expect(generateValue({ type: "string", enum: ["A", "B"] }, ctx("status"))).toBe("A");
    expect(generateValue({ type: "string", enum: ["B"] }, ctx("status"))).toBe("B");
  });
});

describe("satisfiesConstraints", () => {
  it("accepts a value that fits", () => {
    expect(satisfiesConstraints("abc", { type: "string", minLength: 1, maxLength: 5, pattern: "^a" })).toBe(true);
  });

  it("rejects a wrong type", () => {
    expect(satisfiesConstraints("abc", { type: "integer" })).toBe(false);
    expect(satisfiesConstraints(3, { type: "integer" })).toBe(true);
    expect(satisfiesConstraints(3.5, { type: "number" })).toBe(true);
    expect(satisfiesConstraints("abc", { type: "number" })).toBe(false);
    expect(satisfiesConstraints([1], { type: "array" })).toBe(true);
  });

  it("rejects out-of-range numbers", () => {
    expect(satisfiesConstraints(1, { minimum: 2 })).toBe(false);
    expect(satisfiesConstraints(9, { maximum: 8 })).toBe(false);
    expect(satisfiesConstraints(2, { minimum: 2, exclusiveMinimum: true })).toBe(false);
    expect(satisfiesConstraints(8, { maximum: 8, exclusiveMaximum: true })).toBe(false);
    expect(satisfiesConstraints(3, { multipleOf: 2 })).toBe(false);
  });

  it("checks string bounds and formats", () => {
    expect(satisfiesConstraints("ab", { minLength: 3 })).toBe(false);
    expect(satisfiesConstraints("abcdef", { maxLength: 3 })).toBe(false);
    expect(satisfiesConstraints("nope", { pattern: "^yes" })).toBe(false);
    expect(satisfiesConstraints("a@b.co", { format: "email" })).toBe(true);
    expect(satisfiesConstraints("a@b", { format: "email" })).toBe(false);
    expect(satisfiesConstraints("2026-01-01", { format: "date" })).toBe(true);
    expect(satisfiesConstraints("2026-1-1", { format: "date" })).toBe(false);
    expect(satisfiesConstraints("2026-01-01T00:00:00.000Z", { format: "date-time" })).toBe(true);
    expect(satisfiesConstraints("nope", { format: "date-time" })).toBe(false);
    expect(satisfiesConstraints("123e4567-e89b-12d3-a456-426614174000", { format: "uuid" })).toBe(true);
    expect(satisfiesConstraints("123", { format: "uuid" })).toBe(false);
  });
});

describe("determinism", () => {
  it("produces the same record twice for the same seed", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" },
        phone: { type: "string" },
        balance: { type: "number" }
      }
    } as JsonSchema;
    // generateRecord is the real entry point: it seeds faker per record.
    const once = generateRecord(schema, "id", ctx(null, 42));
    const twice = generateRecord(schema, "id", ctx(null, 42));
    expect(once).toEqual(twice);
    expect(once.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(once.phone).toMatch(INDIAN_MOBILE);
  });
});
