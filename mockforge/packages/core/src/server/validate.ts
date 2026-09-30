import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import type { ErrorDetail, Route } from "../types.js";

/**
 * Decimal-exact `multipleOf`.
 *
 * Ajv's built-in check divides (`1234.56 / 0.01 === 123455.99999999999`) and
 * demands an integer quotient, so a perfectly valid two-decimal price is
 * reported as "must be multiple of 0.01". JSON Schema means decimal
 * arithmetic, so this compares the values as exact integers after shifting
 * both by the same power of ten - `1234.56` is `123456` hundredths, and
 * `1234.567` is not a whole number of them.
 */
function isMultipleOf(value: number, multipleOf: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(multipleOf) || multipleOf <= 0) return true;
  const decimalsOf = (n: number): number => {
    const text = String(n);
    if (text.includes("e") || text.includes("E")) return -1;
    const dot = text.indexOf(".");
    return dot < 0 ? 0 : text.length - dot - 1;
  };
  const valueScale = decimalsOf(value);
  const multipleScale = decimalsOf(multipleOf);
  if (valueScale < 0 || multipleScale < 0) {
    // Exponential notation (|value| >= 1e21): fall back to a relative check.
    const quotient = value / multipleOf;
    return Math.abs(quotient - Math.round(quotient)) <= Math.max(1e-9, Math.abs(quotient) * Number.EPSILON * 16);
  }
  const scale = Math.max(valueScale, multipleScale);
  const digitsOf = (n: number): bigint => BigInt(n.toFixed(scale).replace("-", "").replace(".", ""));
  const dividend = digitsOf(value);
  const divisor = digitsOf(multipleOf);
  return divisor === 0n ? true : dividend % divisor === 0n;
}

/**
 * Schema validation, used for two things:
 *
 *  1. incoming request bodies - a body that breaks the spec is a 400 naming the
 *     offending path and reason (B2 / a09);
 *  2. generated responses in dev mode - if the mock would emit something the
 *     spec forbids, that is a 500 `MOCKFORGE_SCHEMA_MISMATCH` (contract 5).
 *
 * `ajv-formats` is deliberately not a dependency: the mirror only carries a
 * version that needs ajv 6, so the handful of formats the specs use are
 * registered by hand - the same ones the acceptance suite registers in its own
 * independent Ajv instance.
 */
export class SpecValidator {
  private readonly ajv: Ajv;
  private readonly cache = new Map<Route, { request: ValidateFunction | null; response: ValidateFunction | null }>();

  constructor(private readonly document: Record<string, unknown>) {
    this.ajv = new Ajv({ strict: false, allErrors: true });
    this.ajv.removeKeyword("multipleOf");
    this.ajv.addKeyword({
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      validate(schema: number, data: unknown) {
        return typeof data !== "number" || isMultipleOf(data, schema);
      }
    });
    this.ajv.addFormat("email", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/);
    this.ajv.addFormat("date-time", {
      type: "string",
      validate: (value: string) => !Number.isNaN(Date.parse(value))
    });
    this.ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);
    this.ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    this.ajv.addFormat("uri", /^[a-z][a-z0-9+.-]*:/i);
  }

  /** Compiles (once per route) the request and response schemas of a route. */
  for(route: Route): { request: ValidateFunction | null; response: ValidateFunction | null } {
    const cached = this.cache.get(route);
    if (cached) return cached;
    const entry = {
      request: this.compile(route.requestSchema),
      response: this.compile(route.responseSchema)
    };
    this.cache.set(route, entry);
    return entry;
  }

  /**
   * Compiles a schema in the context of the whole document, so `$ref`s such as
   * `#/components/schemas/User` (OpenAPI 3) and `#/definitions/User` (Swagger 2)
   * resolve without the caller having to pre-resolve them.
   */
  private compile(schema: unknown): ValidateFunction | null {
    if (!schema || typeof schema !== "object") return null;
    const wrapper: Record<string, unknown> = {
      ...(schema as Record<string, unknown>),
      components: this.document.components,
      definitions: this.document.definitions
    };
    try {
      return this.ajv.compile(wrapper as never);
    } catch {
      // A schema Ajv cannot express (or an unsupported keyword) must not take
      // the mock down: skip validation for that route.
      return null;
    }
  }

  /** Maps Ajv errors onto the documented `{ path, reason }` detail shape. */
  details(validate: ValidateFunction): ErrorDetail[] {
    const errors = (validate.errors ?? []) as ErrorObject[];
    return errors.slice(0, 20).map((error) => {
      const missing = (error.params as { missingProperty?: string } | undefined)?.missingProperty;
      const path = missing ? `${error.instancePath}/${missing}` : error.instancePath || "/";
      return { path, reason: error.message ?? "is invalid" };
    });
  }
}
