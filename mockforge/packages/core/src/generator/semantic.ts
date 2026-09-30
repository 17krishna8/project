import { fakerEN_IN as faker } from "@faker-js/faker";
import type { GenerateContext, JsonSchema } from "../types.js";
import { hashString, pick, randomInt } from "./random.js";

/**
 * Field-MEANING rules (playbook B1.1 / B2 data rules).
 *
 * A rule fires when the property name says what the value means - "phone" is an
 * Indian mobile, "balance" is INR with two decimals, "createdAt" is a recent ISO
 * timestamp. Every produced value is then checked against the schema: if it
 * would violate `pattern`, `minimum`, `format`, ... the rule steps aside and
 * structural generation (which respects those constraints exactly) takes over.
 */

type SemanticRule = (schema: JsonSchema, ctx: GenerateContext) => unknown;

interface FieldRule {
  /** Matched against the property name, case-insensitive. */
  name: RegExp;
  rule: SemanticRule;
  /** Optional guard, e.g. "only when the schema says this is a number". */
  type?: string;
}

function money(ctx: GenerateContext, min: number, max: number): number {
  const whole = randomInt(ctx.rand, min, max);
  const paise = randomInt(ctx.rand, 0, 99);
  return Number((whole + paise / 100).toFixed(2));
}

function indianMobile(ctx: GenerateContext): string {
  const first = randomInt(ctx.rand, 6, 9);
  let rest = "";
  for (let i = 0; i < 9; i += 1) rest += String(randomInt(ctx.rand, 0, 9));
  return `+91${first}${rest}`;
}

function indianPinCode(ctx: GenerateContext): string {
  const first = randomInt(ctx.rand, 1, 9);
  let rest = "";
  for (let i = 0; i < 5; i += 1) rest += String(randomInt(ctx.rand, 0, 9));
  return `${first}${rest}`;
}

const DAY_MS = 86_400_000;

/**
 * Timestamps must sit inside the last two years, so the anchor has to track
 * real time - but `--seed` output must be identical between two runs. Both are
 * satisfied by anchoring to the start of the current UTC **day**: the value
 * moves once a day, so two servers started seconds apart agree, and the whole
 * range always lands inside [now - 2y, now]. A hardcoded epoch would silently
 * expire (a04.7 caught exactly that).
 */
export const TIME_ANCHOR_MS = Math.floor(Date.now() / DAY_MS) * DAY_MS;
export const TIME_ANCHOR_ISO = new Date(TIME_ANCHOR_MS).toISOString();

/** Two years minus a day of headroom, so the oldest value is never too old. */
export const MAX_AGE_MS = 2 * 365 * DAY_MS - DAY_MS;

function recentIso(ctx: GenerateContext, dateOnly: boolean): string {
  const stamp = new Date(TIME_ANCHOR_MS - Math.floor(ctx.rand() * MAX_AGE_MS)).toISOString();
  return dateOnly ? stamp.slice(0, 10) : stamp;
}

function hexColor(ctx: GenerateContext): string {
  let out = "#";
  for (let i = 0; i < 6; i += 1) out += "0123456789abcdef"[randomInt(ctx.rand, 0, 15)];
  return out;
}

function ipv4(ctx: GenerateContext): string {
  return `${randomInt(ctx.rand, 11, 223)}.${randomInt(ctx.rand, 0, 255)}.${randomInt(ctx.rand, 0, 255)}.${randomInt(ctx.rand, 1, 254)}`;
}

const STATUSES = ["active", "inactive", "pending", "blocked", "archived"];
const PRIORITIES = ["low", "medium", "high", "critical"];
const CURRENCIES = ["INR", "INR", "INR", "USD", "EUR"];
const ROLES = ["admin", "editor", "viewer", "auditor", "owner"];
const GENDERS = ["male", "female", "other"];
const CATEGORIES = ["general", "billing", "technical", "account", "feedback"];

/** Most specific names first: "postalCode" must win over a generic "code". */
const FIELD_RULES: FieldRule[] = [
  { name: /(phonenumber|mobile|msisdn|contactnumber|^phone$|phone)/, rule: (_s, ctx) => indianMobile(ctx), type: "string" },
  { name: /(pincode|postalcode|zipcode|^zip$|^pin$)/, rule: (_s, ctx) => indianPinCode(ctx), type: "string" },
  { name: /(firstname|givenname)/, rule: () => faker.person.firstName(), type: "string" },
  { name: /(lastname|surname|familyname)/, rule: () => faker.person.lastName(), type: "string" },
  { name: /(fullname|displayname|username|^name$|customername|contactname)/, rule: () => faker.person.fullName(), type: "string" },
  { name: /(email|e-mail)/, rule: () => faker.internet.email(), type: "string" },
  { name: /(price|amount|cost|total|balance|fee|salary|revenue|payment|tax|discount|subtotal|grandtotal)/, rule: (_s, ctx) => money(ctx, 10, 250_000), type: "number" },
  { name: /(currency|currencycode)/, rule: () => pick(Math.random, CURRENCIES), type: "string" },
  { name: /(createdat|updatedat|modifiedat|deletedat|timestamp|datetime|^date$|^time$|lastseen|loggedat|sentat)/, rule: (s, ctx) => recentIso(ctx, s.format === "date"), type: "string" },
  { name: /(latitude|^lat$)/, rule: (_s, ctx) => Number((8 + ctx.rand() * 29).toFixed(6)), type: "number" },
  { name: /(longitude|^lng$|^lon$)/, rule: (_s, ctx) => Number((68 + ctx.rand() * 29).toFixed(6)), type: "number" },
  { name: /(ipaddress|^ip$|clientip|sourceip|ipv4)/, rule: (_s, ctx) => ipv4(ctx), type: "string" },
  { name: /(city|town|district)/, rule: () => faker.location.city(), type: "string" },
  { name: /(state|province)/, rule: () => faker.location.state(), type: "string" },
  { name: /(country|nation)/, rule: () => "India", type: "string" },
  { name: /(address|street|addr|locality)/, rule: () => faker.location.streetAddress(), type: "string" },
  { name: /(company|organization|employer|^org$|vendor|merchant)/, rule: () => faker.company.name(), type: "string" },
  { name: /(jobtitle|designation)/, rule: () => faker.person.jobTitle(), type: "string" },
  { name: /(description|summary|content|notes|comment|body|message|bio|about|remark)/, rule: () => faker.lorem.sentence(), type: "string" },
  { name: /(title|subject|headline|label)/, rule: () => faker.lorem.words({ min: 2, max: 5 }).replace(/^./, (c) => c.toUpperCase()), type: "string" },
  { name: /(website|homepage|^url$|^link$|avatar|image|photo|logo|icon|thumbnail)/, rule: () => `https://${faker.internet.domainName()}/${faker.string.alphanumeric(8).toLowerCase()}`, type: "string" },
  { name: /(uuid|^guid$)/, rule: () => faker.string.uuid(), type: "string" },
  { name: /(color|colour)/, rule: (_s, ctx) => hexColor(ctx), type: "string" },
  { name: /(priority|severity)/, rule: () => pick(Math.random, PRIORITIES), type: "string" },
  { name: /(status|state)/, rule: () => pick(Math.random, STATUSES), type: "string" },
  { name: /(role|permission)/, rule: () => pick(Math.random, ROLES), type: "string" },
  { name: /(gender|sex)/, rule: () => pick(Math.random, GENDERS), type: "string" },
  { name: /(category|type|kind|channel|source|tag)/, rule: () => pick(Math.random, CATEGORIES), type: "string" },
  { name: /(^age$)/, rule: (_s, ctx) => randomInt(ctx.rand, 18, 65), type: "integer" },
  { name: /(count|quantity|qty|stock|score|rating|views|likes|retries)/, rule: (_s, ctx) => randomInt(ctx.rand, 1, 500), type: "integer" }
];

function typeOfValue(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/** Does `value` satisfy the hard constraints declared by the schema? */
export function satisfiesConstraints(value: unknown, schema: JsonSchema): boolean {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum.includes(value);
  if (typeof schema.type === "string") {
    const declared = schema.type;
    const actual = typeOfValue(value);
    if (declared === "number") {
      if (actual !== "number" && actual !== "integer") return false;
    } else if (declared !== actual) {
      return false;
    }
  }
  if (typeof value === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) return false;
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
    if (schema.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return false;
    if (schema.format === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return false;
    if (schema.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) return false;
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
    if (schema.exclusiveMinimum === true && typeof schema.minimum === "number" && value <= schema.minimum) return false;
    if (schema.exclusiveMaximum === true && typeof schema.maximum === "number" && value >= schema.maximum) return false;
    if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
      if (Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9) return false;
    }
  }
  return true;
}

/**
 * Returns a meaning-based value for a property, or undefined when no rule
 * applies or the rule's value would break the schema.
 */
export function semanticValue(schema: JsonSchema | null, ctx: GenerateContext): unknown {
  if (!schema || !ctx.fieldName) return undefined;
  const name = ctx.fieldName.toLowerCase();

  for (const fieldRule of FIELD_RULES) {
    if (!fieldRule.name.test(name)) continue;
    if (fieldRule.type && schema.type && fieldRule.type !== schema.type) continue;
    let value: unknown;
    try {
      value = fieldRule.rule(schema, ctx);
    } catch {
      return undefined;
    }
    if (value === undefined || value === null) return undefined;
    return satisfiesConstraints(value, schema) ? value : undefined;
  }
  return undefined;
}

/** Seeds faker for one record so meaning-based values are reproducible. */
export function seedFaker(parts: Array<string | number>): void {
  faker.seed(hashString(parts.join("\u0000")));
}
