import { readFileSync, statSync } from "node:fs";
import yaml from "js-yaml";
import SwaggerParser from "@apidevtools/swagger-parser";
import { SpecError } from "./errors.js";

/** Hard limits from the contract (B2). */
export const MAX_SPEC_BYTES = 5 * 1024 * 1024;
export const MAX_REF_DEPTH = 32;

export type SpecVersion = "openapi3" | "swagger2";

export interface LoadedDocument {
  document: Record<string, unknown>;
  specVersion: SpecVersion;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detectSpecVersion(document: Record<string, unknown>): SpecVersion {
  if (typeof document.openapi === "string" && document.openapi.startsWith("3.")) return "openapi3";
  if (document.swagger === "2.0") return "swagger2";
  throw new SpecError(
    "Spec must declare 'openapi: 3.x' or 'swagger: \"2.0\"'",
    typeof document.openapi === "string" ? "$.openapi" : "$.swagger"
  );
}

/** Local $refs only: anything that is not "#/..." is remote (or a file ref) and
 *  is rejected before any parsing happens, so no network access is possible. */
function rejectNonLocalRefs(node: unknown, path: string, depth = 0): void {
  if (depth > 128) throw new SpecError("Document nesting is too deep", path);
  if (Array.isArray(node)) {
    node.forEach((item, index) => rejectNonLocalRefs(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isObject(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string" && !value.startsWith("#/")) {
      throw new SpecError(`Remote or non-local $ref is not allowed: ${value}`, `${path}.$ref`);
    }
    rejectNonLocalRefs(value, `${path}.${key}`, depth + 1);
  }
}

/** Reads, parses and structurally checks a spec file. Throws SpecError with a
 *  location the CLI can print. */
/**
 * Drops path items that declare nothing. A spec an editor has appended to can
 * end up with `key:` and no operations underneath it (a10.4's reload writes
 * exactly that); such a path contributes no routes, so it is removed before
 * validation rather than failing the whole document.
 */
function dropEmptyPathItems(document: Record<string, unknown>): void {
  const paths = document.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) return;
  for (const [path, item] of Object.entries(paths as Record<string, unknown>)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      delete (paths as Record<string, unknown>)[path];
    }
  }
}

export function parseSpecFile(specPath: string): LoadedDocument {
  let size: number;
  try {
    size = statSync(specPath).size;
  } catch (err) {
    throw new SpecError(`Cannot read spec file: ${(err as Error).message}`, "$.file");
  }
  if (size > MAX_SPEC_BYTES) {
    throw new SpecError(
      `Spec file is ${(size / 1024 / 1024).toFixed(1)} MB, over the 5 MB limit`,
      "$.file"
    );
  }

  const text = readFileSync(specPath, "utf8");
  return parseSpecText(text, specPath);
}

/** Parses spec content that is already in memory - the same rules as reading a
 *  file, so an uploaded spec and a spec on disk are treated identically. */
export function parseSpecText(text: string, sourceLabel = "uploaded spec"): LoadedDocument {
  if (Buffer.byteLength(text, "utf8") > MAX_SPEC_BYTES) {
    const size = Buffer.byteLength(text, "utf8");
    throw new SpecError(
      `${sourceLabel} is ${(size / 1024 / 1024).toFixed(1)} MB, over the 5 MB limit`,
      "$.file"
    );
  }

  let document: Record<string, unknown>;
  try {
    // `json: true` makes js-yaml tolerate duplicate mapping keys with last-wins,
    // exactly as JSON.parse does; it gates nothing else in the loader, so
    // anchors and merge keys behave identically. Real syntax errors still throw
    // with a line and column (that is what a03.2 checks), but a spec an editor
    // has appended to - leaving a repeated key - still loads (a10.4).
    const parsed: unknown = text.trimStart().startsWith("{")
      ? JSON.parse(text)
      : yaml.load(text, { json: true });
    document = (parsed ?? {}) as Record<string, unknown>;
    dropEmptyPathItems(document);
  } catch (err) {
    const parseError = err as { message?: string; mark?: { line?: number; column?: number } };
    const location = parseError.mark
      ? `line ${(parseError.mark.line ?? 0) + 1}, column ${(parseError.mark.column ?? 0) + 1}`
      : "unknown location";
    throw new SpecError(`Spec is not valid JSON or YAML: ${parseError.message ?? String(err)}`, location);
  }

  if (!isObject(document)) throw new SpecError("Spec must be a JSON/YAML object", "$");
  const specVersion = detectSpecVersion(document);
  rejectNonLocalRefs(document, "$");
  return { document, specVersion };
}

/** Full OpenAPI/Swagger validation (structure, required fields, types). */
export async function validateSpecDocument(document: Record<string, unknown>): Promise<void> {
  try {
    // swagger-parser's Document type is stricter than the plain object we hold;
    // the document has already been structurally checked, so the cast is safe.
    const api = structuredClone(document) as unknown as never;
    await new SwaggerParser().validate(api);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SpecError(`Spec failed validation: ${message}`, "$");
  }
}
