import type { JsonSchema } from "../types.js";

/** Local $ref resolution. The spec layer owns this; the generator and the
 *  router both consume it. Remote refs never reach here (loader rejects them). */

export const MAX_REF_STEPS = 32;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolves "#/components/schemas/User" against the document root. */
export function resolveRef(root: Record<string, unknown>, ref: string): JsonSchema | null {
  if (!ref.startsWith("#/")) return null;
  const parts = ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node: unknown = root;
  for (const part of parts) {
    if (!isObject(node)) return null;
    node = node[part];
  }
  return isObject(node) ? (node as JsonSchema) : null;
}

/** Follows $ref chains to the concrete schema (null when a ref is broken). */
export function dereference(schema: JsonSchema | null, root: Record<string, unknown>): JsonSchema | null {
  let current = schema;
  let steps = 0;
  while (current && typeof current.$ref === "string" && steps < MAX_REF_STEPS) {
    const next = resolveRef(root, current.$ref);
    if (!next) return null;
    current = next;
    steps += 1;
  }
  return current ?? null;
}

/** Flattens allOf into a single schema (properties and required are merged). */
export function mergeAllOf(schema: JsonSchema, root: Record<string, unknown>): JsonSchema {
  const branches = (schema.allOf ?? [])
    .map((branch) => dereference(branch, root))
    .filter((branch): branch is JsonSchema => branch !== null);
  if (branches.length === 0) return schema;
  const merged: JsonSchema = { ...schema };
  delete merged.allOf;
  const properties: Record<string, JsonSchema> = { ...(schema.properties ?? {}) };
  const required = new Set<string>(schema.required ?? []);
  for (const branch of branches) {
    Object.assign(properties, branch.properties ?? {});
    for (const field of branch.required ?? []) required.add(field);
    for (const [key, value] of Object.entries(branch)) {
      if (key === "properties" || key === "required" || key === "allOf") continue;
      if (merged[key] === undefined) merged[key] = value;
    }
  }
  merged.properties = properties;
  merged.required = [...required];
  return merged;
}
