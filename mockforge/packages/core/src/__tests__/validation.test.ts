import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createMockForge, type MockForgeApp } from "../server/app.js";
import { SpecValidator } from "../server/validate.js";
import type { Route } from "../types.js";

/**
 * `multipleOf` is where decimal intent meets IEEE-754 reality: Ajv's built-in
 * check divides and demands an integer quotient, so a valid two-decimal price
 * is rejected as "not a multiple of 0.01". These tests pin the decimal-exact
 * behaviour the validator uses instead.
 */
const multipleOfRoute: Route = {
  method: "POST",
  path: "/prices",
  kind: "create",
  resource: "prices",
  operationId: "createPrice",
  summary: null,
  successStatus: 201,
  requestSchema: {
    type: "object",
    required: ["amount"],
    properties: { amount: { type: "number", minimum: 0, maximum: 1_000_000, multipleOf: 0.01 } }
  },
  responseSchema: null,
  pathParams: [],
  queryParams: []
};

function validator() {
  return new SpecValidator({});
}

function validateAmount(amount: number): string[] {
  const { request } = validator().for(multipleOfRoute);
  expect(request).not.toBeNull();
  const reasons: string[] = [];
  if (!request!({ amount })) {
    for (const detail of validator().details(request!)) reasons.push(detail.reason);
  }
  return reasons;
}

describe("multipleOf", () => {
  it("accepts two-decimal prices that Ajv's division check would reject", () => {
    // 1234.56 / 0.01 === 123455.99999999999 in IEEE-754.
    expect(validateAmount(1234.56)).toEqual([]);
    expect(validateAmount(48644.68)).toEqual([]);
    expect(validateAmount(99999.99)).toEqual([]);
    expect(validateAmount(0.01)).toEqual([]);
    expect(validateAmount(0)).toEqual([]);
  });

  it("rejects values that are genuinely not multiples", () => {
    expect(validateAmount(1234.567).length).toBeGreaterThan(0);
    expect(validateAmount(0.015).length).toBeGreaterThan(0);
    expect(validateAmount(1.005).length).toBeGreaterThan(0);
  });

  it("keeps whole-number multiples exact", () => {
    const integerRoute: Route = {
      ...multipleOfRoute,
      requestSchema: {
        type: "object",
        required: ["amount"],
        properties: { amount: { type: "number", multipleOf: 1 } }
      }
    };
    const { request } = validator().for(integerRoute);
    expect(request!({ amount: 5 })).toBe(true);
    expect(request!({ amount: 1.5 })).toBe(false);
  });

  it("handles small steps without losing the non-multiples", () => {
    const fineRoute: Route = {
      ...multipleOfRoute,
      requestSchema: {
        type: "object",
        required: ["amount"],
        properties: { amount: { type: "number", multipleOf: 0.0001 } }
      }
    };
    const { request } = validator().for(fineRoute);
    expect(request!({ amount: 0.0075 })).toBe(true);
    expect(request!({ amount: 0.00751 })).toBe(false);
    expect(request!({ amount: 0.0002 })).toBe(true);
  });

  it("stays correct at magnitudes where float noise dominates", () => {
    const bigRoute: Route = {
      ...multipleOfRoute,
      requestSchema: {
        type: "object",
        required: ["amount"],
        properties: { amount: { type: "number", minimum: 0, maximum: 1_000_000_000_000, multipleOf: 0.01 } }
      }
    };
    const { request } = validator().for(bigRoute);
    expect(request!({ amount: 987654.32 })).toBe(true);
    expect(request!({ amount: 123456789.12 })).toBe(true);
    expect(request!({ amount: 123456789.123 })).toBe(false);
  });
});

describe("multipleOf end to end", () => {
  // Written to a scratch directory on purpose: acceptance/** is read-only.
  const dir = mkdtempSync(path.join(os.tmpdir(), "mockforge-multiple-of-"));
  const specPath = path.join(dir, "multiple-of.yaml");
  writeFileSync(
    specPath,
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Invoices API",
      "  version: 1.0.0",
      "paths:",
      "  /invoices:",
      "    get:",
      "      operationId: listInvoices",
      "      responses:",
      "        '200':",
      "          description: Invoices",
      "          content:",
      "            application/json:",
      "              schema:",
      "                type: array",
      "                items:",
      "                  $ref: '#/components/schemas/Invoice'",
      "  /invoices/{invoiceId}:",
      "    parameters:",
      "      - name: invoiceId",
      "        in: path",
      "        required: true",
      "        schema:",
      "          type: string",
      "          pattern: '^inv_[A-Za-z0-9]{6,12}$'",
      "    get:",
      "      operationId: getInvoice",
      "      responses:",
      "        '200':",
      "          description: Invoice",
      "          content:",
      "            application/json:",
      "              schema:",
      "                $ref: '#/components/schemas/Invoice'",
      "components:",
      "  schemas:",
      "    Invoice:",
      "      type: object",
      "      required: [id, total]",
      "      properties:",
      "        id:",
      "          type: string",
      "          pattern: '^inv_[A-Za-z0-9]{6,12}$'",
      "        total:",
      "          type: number",
      "          minimum: 1",
      "          maximum: 100000",
      "          multipleOf: 0.01",
      ""
    ].join("\n")
  );

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("serves a spec whose prices are constrained to two decimals", async () => {
    const forge: MockForgeApp = await createMockForge({ specPath, mode: "dev", seed: 42 });
    try {
      const res = await forge.app.inject({ method: "GET", url: "/invoices", headers: { "x-session-id": "mo" } });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ total: number }>;
      expect(body.length).toBeGreaterThan(0);
      for (const invoice of body) {
        expect(Number.isInteger(Math.round(invoice.total * 100))).toBe(true);
      }
    } finally {
      await forge.app.close();
    }
  });
});
