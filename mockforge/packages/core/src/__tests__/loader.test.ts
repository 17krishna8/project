import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SpecError } from "../spec/errors.js";
import { MAX_SPEC_BYTES, parseSpecFile, validateSpecDocument } from "../spec/loader.js";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../acceptance/fixtures");

function tmpSpec(name: string, contents: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "mockforge-unit-")), name);
  writeFileSync(file, contents);
  return file;
}

describe("parseSpecFile", () => {
  it("reads an OpenAPI 3 YAML spec", () => {
    const loaded = parseSpecFile(path.join(fixtures, "users.yaml"));
    expect(loaded.specVersion).toBe("openapi3");
    expect(Object.keys(loaded.document.paths as object)).toContain("/users");
  });

  it("reads a Swagger 2.0 spec", () => {
    const loaded = parseSpecFile(path.join(fixtures, "users.swagger2.yaml"));
    expect(loaded.specVersion).toBe("swagger2");
  });

  it("reads a JSON spec", () => {
    const file = tmpSpec("spec.json", JSON.stringify({ openapi: "3.0.3", info: { title: "J", version: "1" }, paths: {} }));
    expect(parseSpecFile(file).specVersion).toBe("openapi3");
  });

  it("rejects a malformed spec and names the line and column", () => {
    expect(() => parseSpecFile(path.join(fixtures, "malformed.yaml"))).toThrowError(SpecError);
    try {
      parseSpecFile(path.join(fixtures, "malformed.yaml"));
    } catch (error) {
      expect((error as Error).message).toMatch(/line \d+, column \d+/);
    }
  });

  it("rejects a remote $ref and names the reference", () => {
    try {
      parseSpecFile(path.join(fixtures, "remote-ref.yaml"));
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SpecError);
      expect((error as Error).message).toContain("https://example.com/schemas/thing.yaml");
      expect((error as SpecError).location).toContain("$ref");
    }
  });

  it("rejects a spec over 5 MB", () => {
    const file = tmpSpec("big.yaml", `openapi: 3.0.3\ninfo:\n  title: Big\n  version: 1.0.0\n  description: ${"x".repeat(MAX_SPEC_BYTES + 10)}\npaths: {}\n`);
    try {
      parseSpecFile(file);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SpecError);
      expect((error as Error).message).toMatch(/5 MB limit/);
    }
  });

  it("rejects a spec without openapi or swagger keys", () => {
    const file = tmpSpec("nokeys.yaml", "info:\n  title: X\n  version: 1.0.0\npaths: {}\n");
    expect(() => parseSpecFile(file)).toThrowError(/openapi|swagger/);
  });

  it("rejects a missing file", () => {
    expect(() => parseSpecFile("/definitely/not/here.yaml")).toThrowError(SpecError);
  });

  it("rejects a spec that is not an object", () => {
    const file = tmpSpec("array.yaml", "- one\n- two\n");
    expect(() => parseSpecFile(file)).toThrowError(/must be a JSON\/YAML object/);
  });
});

describe("validateSpecDocument", () => {
  it("accepts the users fixture", async () => {
    const { document } = parseSpecFile(path.join(fixtures, "users.yaml"));
    await expect(validateSpecDocument(document)).resolves.toBeUndefined();
  });

  it("rejects a document whose paths are malformed", async () => {
    await expect(
      validateSpecDocument({ openapi: "3.0.3", info: { title: "X", version: "1" }, paths: { "/a": { get: "not-an-operation" } } })
    ).rejects.toThrowError(SpecError);
  });
});
