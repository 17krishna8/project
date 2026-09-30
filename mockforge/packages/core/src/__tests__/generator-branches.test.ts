// Focused coverage for the generator's branch matrix: every format, every
// schema combinator and every pattern construct it supports.
import { describe, expect, it } from "vitest";
import {
  TIME_ANCHOR_MS,
  generateFromPattern,
  generateRecord,
  generateValue,
  seedCount
} from "../generator/generate.js";
import { dereference, mergeAllOf, resolveRef } from "../spec/refs.js";
import { createRandom } from "../generator/random.js";
import type { GenerateContext } from "../types.js";

const root = {
  components: {
    schemas: {
      A: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
      B: { $ref: "#/components/schemas/A" },
      C: { $ref: "#/components/schemas/B" }
    }
  }
} as unknown as Record<string, unknown>;

function ctx(overrides: Partial<GenerateContext> = {}): GenerateContext {
  return {
    path: "/",
    fieldName: null,
    rand: createRandom(31),
    depth: 0,
    sessionId: "branch",
    resource: "things",
    root,
    ...overrides
  };
}

describe("string formats", () => {
  const formats = ["date", "time", "uuid", "uri", "url", "hostname", "ipv4", "byte", "password", "unknown-format"];

  for (const format of formats) {
    it(`generates a ${format} value`, () => {
      const value = generateValue({ type: "string", format }, ctx()) as string;
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    });
  }

  it("generates a parseable date", () => {
    expect(generateValue({ type: "string", format: "date" }, ctx())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("generates a valid uuid shape", () => {
    expect(generateValue({ type: "string", format: "uuid" }, ctx())).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("falls back to alphanumeric when a pattern cannot be generated", () => {
    const value = generateValue({ type: "string", pattern: "(", minLength: 4, maxLength: 6 }, ctx()) as string;
    expect(value.length).toBeGreaterThanOrEqual(4);
    expect(value.length).toBeLessThanOrEqual(6);
  });
});

describe("schema combinators", () => {
  it("uses the first oneOf branch", () => {
    const value = generateValue({ oneOf: [{ type: "string" }, { type: "number" }] }, ctx());
    expect(typeof value).toBe("string");
  });

  it("uses the first anyOf branch", () => {
    const value = generateValue({ anyOf: [{ type: "integer" }, { type: "string" }] }, ctx());
    expect(typeof value).toBe("number");
  });

  it("returns the const value", () => {
    expect(generateValue({ const: "fixed" }, ctx())).toBe("fixed");
  });

  it("generates booleans and nulls", () => {
    const rand = createRandom(3);
    const booleans = new Set(
      Array.from({ length: 20 }, () => generateValue({ type: "boolean" }, ctx({ rand })))
    );
    expect(booleans.size).toBeGreaterThan(1);
    expect(generateValue({ type: "null" }, ctx())).toBeNull();
  });

  it("infers the type when none is declared", () => {
    expect(typeof generateValue({ properties: { a: { type: "string" } } }, ctx())).toBe("object");
    expect(Array.isArray(generateValue({ items: { type: "string" } }, ctx()))).toBe(true);
    expect(typeof generateValue({ minLength: 3, maxLength: 5 }, ctx())).toBe("string");
    expect(typeof generateValue({ minimum: 1, maximum: 5 }, ctx())).toBe("number");
  });

  it("respects multipleOf and exclusive bounds", () => {
    const value = generateValue({ type: "number", minimum: 0, maximum: 10, multipleOf: 0.5 }, ctx()) as number;
    expect(Number.isInteger(value * 2)).toBe(true);
    const exclusive = generateValue({ type: "integer", minimum: 0, exclusiveMinimum: true, maximum: 5 }, ctx()) as number;
    expect(exclusive).toBeGreaterThan(0);
    const top = generateValue({ type: "integer", minimum: 0, maximum: 5, exclusiveMaximum: true }, ctx()) as number;
    expect(top).toBeLessThan(5);
  });

  it("respects numeric exclusiveMinimum/Maximum given as numbers", () => {
    const value = generateValue({ type: "integer", exclusiveMinimum: 3, exclusiveMaximum: 7 }, ctx()) as number;
    expect(value).toBeGreaterThan(3);
    expect(value).toBeLessThan(7);
  });

  it("clamps a range where the maximum is below the minimum", () => {
    const value = generateValue({ type: "number", minimum: 10, maximum: 2 }, ctx()) as number;
    expect(value).toBe(10);
  });

  it("caps long arrays", () => {
    const value = generateValue({ type: "array", items: { type: "string" }, maxItems: 50 }, ctx()) as unknown[];
    expect(value.length).toBeLessThanOrEqual(5);
  });

  it("returns null for a null schema and for a broken ref", () => {
    expect(generateValue(null, ctx())).toBeNull();
    expect(generateValue({ $ref: "#/components/schemas/Missing" }, ctx())).toBeNull();
  });

  it("stops at the depth limit", () => {
    const deep = { type: "object", properties: { next: { type: "object", properties: { next: { type: "string" } } } } };
    expect(typeof generateValue(deep, ctx({ depth: 99 }))).toBe("object");
  });

  it("generates a record without a schema", () => {
    const record = generateRecord(null, "id", ctx());
    expect(typeof record.id).toBe("string");
  });
});

describe("ref resolution", () => {
  it("follows a chain of refs", () => {
    expect(dereference({ $ref: "#/components/schemas/C" }, root)?.type).toBe("object");
  });

  it("returns null for a ref into a non-object", () => {
    expect(resolveRef(root, "#/components/schemas/A/type/x")).toBeNull();
    expect(resolveRef(root, "http://example.com/x")).toBeNull();
  });

  it("decodes ~0 and ~1 escapes", () => {
    const escaped = { components: { schemas: { "a/b": { type: "string" } } } } as unknown as Record<string, unknown>;
    expect(resolveRef(escaped, "#/components/schemas/a~1b")?.type).toBe("string");
  });

  it("merges allOf branches that are refs", () => {
    const merged = mergeAllOf({ allOf: [{ $ref: "#/components/schemas/A" }] }, root);
    expect(Object.keys(merged.properties ?? {})).toEqual(["a"]);
  });

  it("returns the schema unchanged when allOf is empty", () => {
    const schema = { type: "string" };
    expect(mergeAllOf(schema, root)).toBe(schema);
  });
});

describe("pattern constructs", () => {
  const cases: Array<[string, RegExp]> = [
    ["[^abc]{3}", /^[^abc]{3}$/],
    ["\\w{4}", /^\w{4}$/],
    ["\\d{2,4}", /^\d{2,4}$/],
    ["a.c", /^a.c$/],
    ["^\\-?\\d+$", /^-?\d+$/],
    ["(ab|cd)+", /^(ab|cd)+$/],
    ["[A-Za-z]{2}\\d{2}[A-Za-z]{2}", /^[A-Za-z]{2}\d{2}[A-Za-z]{2}$/],
    ["x{3}", /^x{3}$/]
  ];

  for (const [pattern, regex] of cases) {
    it(`handles ${pattern}`, () => {
      const rand = createRandom(77);
      for (let i = 0; i < 25; i++) {
        const value = generateFromPattern(pattern, rand);
        expect(value, `generated ${value}`).not.toBeNull();
        expect(value!).toMatch(regex);
      }
    });
  }

  it("returns null for an unsupported pattern", () => {
    expect(generateFromPattern("[unclosed", createRandom(1))).toBeNull();
  });

  it("keeps the timestamp anchor deterministic", () => {
    const first = generateValue({ type: "string", format: "date-time" }, ctx()) as string;
    const second = generateValue({ type: "string", format: "date-time" }, ctx()) as string;
    expect(first).toBe(second);
    expect(Date.parse(first)).toBeLessThanOrEqual(TIME_ANCHOR_MS);
  });

  it("spreads seed counts across the 5..10 range", () => {
    const counts = new Set(
      Array.from({ length: 40 }, (_, index) => seedCount(`session-${index}`, "things"))
    );
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(5);
      expect(count).toBeLessThanOrEqual(10);
    }
  });
});
