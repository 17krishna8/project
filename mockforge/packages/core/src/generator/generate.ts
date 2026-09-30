import type { GenerateContext, JsonSchema, SessionRecord } from "../types.js";
import { dereference, mergeAllOf } from "../spec/refs.js";
import { MAX_AGE_MS, TIME_ANCHOR_MS, seedFaker, semanticValue } from "./semantic.js";

export { TIME_ANCHOR_ISO, TIME_ANCHOR_MS } from "./semantic.js";
import { pick, randomInt, scopedRandom } from "./random.js";

/** Structural, schema-driven generation. Field-MEANING rules (Indian mobiles,
 *  INR prices, ...) live in generator/semantic.ts and are layered on top. */

const MAX_DEPTH = 12;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------- patterns

type PatternNode =
  | { kind: "lit"; value: string }
  | { kind: "set"; chars: string[] }
  | { kind: "alt"; branches: PatternNode[][] }
  | { kind: "rep"; node: PatternNode; min: number; max: number };

const DIGITS = "0123456789".split("");
const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const UPPER = LOWER.map((c) => c.toUpperCase());
const ALNUM = [...LOWER, ...UPPER, ...DIGITS];

function escapeAtom(char: string): PatternNode | null {
  switch (char) {
    case "d":
      return { kind: "set", chars: DIGITS };
    case "w":
      return { kind: "set", chars: ALNUM.concat("_") };
    case "s":
      return { kind: "set", chars: [" "] };
    case "D":
      return { kind: "set", chars: LOWER };
    case "W":
      return { kind: "set", chars: ["-", "."] };
    case "n":
      return { kind: "lit", value: "\n" };
    case "t":
      return { kind: "lit", value: "\t" };
    case "r":
      return { kind: "lit", value: "\r" };
    default:
      return char.length === 1 ? { kind: "lit", value: char } : null;
  }
}

function parseClass(pattern: string, start: number): { node: PatternNode; next: number } | null {
  let i = start + 1;
  const chars: string[] = [];
  let negated = false;
  if (pattern[i] === "^") {
    negated = true;
    i += 1;
  }
  while (i < pattern.length && pattern[i] !== "]") {
    const char = pattern[i]!;
    if (char === "\\") {
      const escaped = pattern[i + 1];
      if (escaped === undefined) return null;
      if (escaped === "d") chars.push(...DIGITS);
      else if (escaped === "w") chars.push(...ALNUM, "_");
      else chars.push(escaped);
      i += 2;
      continue;
    }
    const next = pattern[i + 1];
    if (next === "-" && pattern[i + 2] !== undefined && pattern[i + 2] !== "]") {
      const end = pattern[i + 2]!;
      for (let code = char.charCodeAt(0); code <= end.charCodeAt(0); code++) {
        chars.push(String.fromCharCode(code));
      }
      i += 3;
      continue;
    }
    chars.push(char);
    i += 1;
  }
  if (pattern[i] !== "]") return null;
  if (chars.length === 0) return null;
  if (negated) {
    const excluded = new Set(chars);
    const rest = ALNUM.filter((c) => !excluded.has(c));
    if (rest.length === 0) return null;
    return { node: { kind: "set", chars: rest }, next: i + 1 };
  }
  return { node: { kind: "set", chars }, next: i + 1 };
}

function parseQuantifier(pattern: string, start: number): { min: number; max: number; next: number } | null {
  const char = pattern[start]!;
  if (char === "?") return { min: 0, max: 1, next: start + 1 };
  if (char === "*") return { min: 0, max: 8, next: start + 1 };
  if (char === "+") return { min: 1, max: 8, next: start + 1 };
  if (char === "{") {
    const close = pattern.indexOf("}", start);
    if (close === -1) return null;
    const body = pattern.slice(start + 1, close);
    const range = /^(\d+)(,(\d*))?$/.exec(body);
    if (!range) return null;
    const min = Number(range[1]);
    const max = range[3] === undefined ? min : range[3] === "" ? min + 8 : Number(range[3]);
    return { min, max, next: close + 1 };
  }
  return null;
}

function parseSequence(pattern: string, state: { index: number }): PatternNode[] | null {
  const nodes: PatternNode[] = [];
  const branches: PatternNode[][] = [];
  while (state.index < pattern.length) {
    const char = pattern[state.index]!;
    if (char === "|") {
      branches.push([...nodes]);
      nodes.length = 0;
      state.index += 1;
      continue;
    }
    if (char === ")") break;
    let atom: PatternNode | null = null;
    if (char === "^" || char === "$") {
      state.index += 1;
      continue;
    }
    if (char === "\\") {
      atom = escapeAtom(pattern[state.index + 1] ?? "");
      state.index += 2;
    } else if (char === "[") {
      const parsed = parseClass(pattern, state.index);
      if (!parsed) return null;
      atom = parsed.node;
      state.index = parsed.next;
    } else if (char === "(") {
      state.index += 1;
      if (pattern.slice(state.index, state.index + 2) === "?:") state.index += 2;
      const inner = parseSequence(pattern, state);
      if (inner === null) return null;
      if (pattern[state.index] !== ")") return null;
      state.index += 1;
      atom = { kind: "alt", branches: [inner] };
    } else if (char === ".") {
      atom = { kind: "set", chars: ALNUM };
      state.index += 1;
    } else {
      atom = { kind: "lit", value: char };
      state.index += 1;
    }
    if (!atom) return null;
    const quantifier = parseQuantifier(pattern, state.index);
    if (quantifier) {
      nodes.push({ kind: "rep", node: atom, min: quantifier.min, max: quantifier.max });
      state.index = quantifier.next;
    } else {
      nodes.push(atom);
    }
  }
  branches.push([...nodes]);
  return branches.length === 1 ? nodes : [{ kind: "alt", branches }];
}

/** Generates a string that matches `pattern` (safe subset; bounded work). */
export function generateFromPattern(pattern: string, rand: () => number, maxLength = 48): string | null {
  const state = { index: 0 };
  const nodes = parseSequence(pattern, state);
  if (!nodes) return null;
  let out = "";
  let budget = 500;

  const emit = (sequence: PatternNode[]): void => {
    for (const node of sequence) {
      if (budget <= 0 || out.length >= maxLength) return;
      budget -= 1;
      if (node.kind === "lit") {
        out += node.value;
      } else if (node.kind === "set") {
        out += pick(rand, node.chars);
      } else if (node.kind === "alt") {
        emit(pick(rand, node.branches));
      } else {
        const count = randomInt(rand, node.min, Math.min(node.max, 8));
        for (let i = 0; i < count; i++) {
          if (budget <= 0 || out.length >= maxLength) break;
          emit([node.node]);
        }
      }
    }
  };

  emit(nodes);
  return out.length > 0 ? out : null;
}

// ---------------------------------------------------------------- values

/**
 * Fixed anchor for generated timestamps. It MUST be derived from the seed only:
 * using the wall clock here would break `--seed` determinism across runs.
 * Keep it within two years of "now" (the acceptance suite asserts that); the
 * unit test below fails when it goes stale.
 */
export function isoWithinTwoYears(rand: () => number): string {
  // Same day-bucketed anchor as the semantic layer (generator/semantic.ts).
  const offset = Math.floor(rand() * MAX_AGE_MS);
  return new Date(TIME_ANCHOR_MS - offset).toISOString();
}

function randomAlphanumeric(rand: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += pick(rand, ALNUM);
  return out;
}

const HEX = "0123456789abcdef".split("");

function uuidLike(rand: () => number): string {
  // 32 hex digits, laid out as 8-4-4-4-12 with the version/variant nibbles.
  const hex = Array.from({ length: 32 }, () => pick(rand, HEX)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function numberInRange(schema: JsonSchema, rand: () => number, integer: boolean): number {
  let min = typeof schema.minimum === "number" ? schema.minimum : 0;
  let max = typeof schema.maximum === "number" ? schema.maximum : min + 1000;
  if (schema.exclusiveMinimum === true && typeof schema.minimum === "number") min += 1;
  if (typeof schema.exclusiveMinimum === "number") min = schema.exclusiveMinimum + 1;
  if (schema.exclusiveMaximum === true && typeof schema.maximum === "number") max -= 1;
  if (typeof schema.exclusiveMaximum === "number") max = schema.exclusiveMaximum - 1;
  if (max < min) max = min;
  const raw = min + rand() * (max - min);
  const multipleOf = typeof schema.multipleOf === "number" && schema.multipleOf > 0 ? schema.multipleOf : null;
  let value = multipleOf ? Math.round(raw / multipleOf) * multipleOf : raw;
  if (integer) value = Math.round(value);
  value = Math.min(Math.max(value, min), max);
  return Number(value.toFixed(integer ? 0 : 6));
}

function stringForFormat(format: string | undefined, rand: () => number): string | null {
  switch (format) {
    case "date-time":
      return isoWithinTwoYears(rand);
    case "date":
      return isoWithinTwoYears(rand).slice(0, 10);
    case "time":
      return isoWithinTwoYears(rand).slice(11, 19);
    case "email":
      return `user${randomInt(rand, 1, 9999)}@example.com`;
    case "uuid":
      return uuidLike(rand);
    case "uri":
    case "url":
      return `https://example.com/${randomAlphanumeric(rand, 8).toLowerCase()}`;
    case "hostname":
      return `host-${randomInt(rand, 1, 999)}.example.com`;
    case "ipv4":
      return `${randomInt(rand, 1, 254)}.${randomInt(rand, 0, 255)}.${randomInt(rand, 0, 255)}.${randomInt(rand, 1, 254)}`;
    case "byte":
      return randomAlphanumeric(rand, 12);
    case "password":
      return randomAlphanumeric(rand, 12);
    default:
      return null;
  }
}

function stringValue(schema: JsonSchema, rand: () => number): string {
  if (typeof schema.pattern === "string") {
    const generated = generateFromPattern(schema.pattern, rand);
    if (generated !== null) return generated;
  }
  const fromFormat = stringForFormat(schema.format, rand);
  if (fromFormat !== null) return fromFormat;
  const min = typeof schema.minLength === "number" ? schema.minLength : 4;
  const max = typeof schema.maxLength === "number" ? Math.min(schema.maxLength, min + 12) : min + 8;
  return randomAlphanumeric(rand, randomInt(rand, min, Math.max(min, max)));
}

/**
 * The value produced once MAX_DEPTH is reached. It has to stay schema-valid -
 * returning null here made recursive specs (fixtures/circular.yaml) emit
 * objects where the schema demanded one, which dev-mode validation then
 * rejected. Objects keep only their required properties, arrays become empty
 * and scalars take their smallest legal value.
 */
function minimalValue(schema: JsonSchema | null, ctx: GenerateContext): unknown {
  if (!schema) return null;
  const type = typeof schema.type === "string" ? schema.type : inferType(schema);
  switch (type) {
    case "object": {
      const record: SessionRecord = {};
      const properties = schema.properties ?? {};
      for (const name of schema.required ?? []) {
        const property = properties[name];
        if (property) record[name] = minimalValue(property as JsonSchema, ctx);
      }
      return record;
    }
    case "array":
      return [];
    case "boolean":
      return false;
    case "integer":
    case "number":
      return typeof schema.minimum === "number" ? schema.minimum : 0;
    default: {
      if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
      if (schema.const !== undefined) return schema.const;
      // Patterns do not recurse, so honour them even at the limit.
      if (typeof schema.pattern === "string") {
        const generated = generateFromPattern(schema.pattern, ctx.rand);
        if (generated !== null) return generated;
      }
      const minLength = typeof schema.minLength === "number" ? Math.max(schema.minLength, 1) : 1;
      const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : minLength;
      return "x".repeat(Math.min(Math.max(minLength, 1), Math.max(maxLength, 1)));
    }
  }
}

/** Generates one value for a schema. `ctx.fieldName` carries the property name
 *  so semantic rules can key off meaning. */
export function generateValue(schema: JsonSchema | null, ctx: GenerateContext): unknown {
  if (!schema) return null;

  let resolved = dereference(schema, ctx.root);
  if (!resolved) return null;
  if (ctx.depth > MAX_DEPTH) return minimalValue(resolved, ctx);
  if (Array.isArray(resolved.allOf) && resolved.allOf.length > 0) {
    resolved = mergeAllOf(resolved, ctx.root);
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) return pick(ctx.rand, resolved.enum);
  if (resolved.const !== undefined) return resolved.const;
  for (const key of ["oneOf", "anyOf"] as const) {
    const branches = resolved[key];
    if (Array.isArray(branches) && branches.length > 0) {
      const branch = dereference(branches[0] as JsonSchema, ctx.root);
      if (branch) return generateValue(branch, ctx);
    }
  }

  // Meaning first: "phone" is an Indian mobile, "balance" is INR money.
  // A rule that would break the schema steps aside (see semantic.ts).
  const semantic = semanticValue(resolved, ctx);
  if (semantic !== undefined) return semantic;

  const type = typeof resolved.type === "string" ? resolved.type : inferType(resolved);

  switch (type) {
    case "object": {
      const record: SessionRecord = {};
      const properties = resolved.properties ?? {};
      // Past the depth limit only required properties are expanded, so a
      // recursive schema terminates instead of exploding.
      const atLimit = ctx.depth >= MAX_DEPTH;
      for (const [name, propertySchema] of Object.entries(properties)) {
        if (atLimit && !(resolved.required ?? []).includes(name)) continue;
        if (propertySchema?.readOnly === true && ctx.fieldName === null) {
          // response generation keeps readOnly fields; request generation skips them
        }
        record[name] = generateValue(propertySchema as JsonSchema, {
          ...ctx,
          path: `${ctx.path}/${name}`,
          fieldName: name,
          depth: ctx.depth + 1
        });
      }
      if (resolved.additionalProperties === true) {
        // nothing extra: we never invent properties outside the schema
      }
      return record;
    }
    case "array": {
      const itemSchema = Array.isArray(resolved.items) ? resolved.items[0] : resolved.items;
      const minItems = typeof resolved.minItems === "number" ? resolved.minItems : 1;
      // Fewer items deeper in the tree: recursion has to stay bounded.
      const depthBudget = Math.max(1, 3 - Math.floor(ctx.depth / 3));
      const maxItems = typeof resolved.maxItems === "number" ? Math.min(resolved.maxItems, depthBudget) : depthBudget;
      const count = randomInt(ctx.rand, minItems, Math.max(minItems, maxItems));
      return Array.from({ length: count }, () =>
        generateValue((itemSchema ?? null) as JsonSchema | null, { ...ctx, depth: ctx.depth + 1 })
      );
    }
    case "string":
      return stringValue(resolved, ctx.rand);
    case "integer":
      return numberInRange(resolved, ctx.rand, true);
    case "number":
      return numberInRange(resolved, ctx.rand, false);
    case "boolean":
      return ctx.rand() > 0.5;
    case "null":
      return null;
    default:
      return null;
  }
}

function inferType(schema: JsonSchema): string {
  if (schema.properties || schema.additionalProperties) return "object";
  if (schema.items) return "array";
  if (schema.minLength !== undefined || schema.maxLength !== undefined || schema.pattern || schema.format) return "string";
  if (schema.minimum !== undefined || schema.maximum !== undefined || schema.multipleOf) return "number";
  return "string";
}

/** A full generated record for a resource (id field included). */
export function generateRecord(
  schema: JsonSchema | null,
  idField: string,
  ctx: GenerateContext
): SessionRecord {
  seedFaker([ctx.sessionId, ctx.resource ?? "", ctx.path, ctx.fieldName ?? "", ctx.depth]);
  const generated = generateValue(schema, ctx);
  const record: SessionRecord = isObject(generated) ? (generated as SessionRecord) : {};
  if (record[idField] === undefined) {
    record[idField] = uuidLike(ctx.rand);
  }
  return record;
}

/** How many seed records a session gets for a resource (5..10, deterministic). */
export function seedCount(sessionId: string, resource: string): number {
  const hash = [...`${sessionId}:${resource}:seed-count`].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return 5 + (hash % 6);
}

/** Deterministic seed records for one session and resource. */
export function generateSeedRecords(
  schema: JsonSchema | null,
  idField: string,
  options: { root: Record<string, unknown>; seed: number; sessionId: string; resource: string }
): SessionRecord[] {
  const count = seedCount(options.sessionId, options.resource);
  return Array.from({ length: count }, (_, index) => {
    const rand = scopedRandom([options.seed, options.sessionId, options.resource, index]);
    return generateRecord(schema, idField, {
      path: `/${options.resource}/${index}`,
      fieldName: null,
      rand,
      depth: 0,
      sessionId: options.sessionId,
      resource: options.resource,
      root: options.root
    });
  });
}

