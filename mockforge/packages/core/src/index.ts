/**
 * @mockforge/core - spec loading, semantic generation, session state, chaos,
 * validation and the Fastify app. Public surface is intentionally small.
 */
export const MOCKFORGE_VERSION = "0.1.0";

export { createMockForge, listen } from "./server/app.js";
export type { MockForgeApp, CreateOptions } from "./server/app.js";
export { parseSpecFile, validateSpecDocument, MAX_SPEC_BYTES, MAX_REF_DEPTH } from "./spec/loader.js";
export { SpecError } from "./spec/errors.js";
export { inferRoutes } from "./spec/routes.js";
export { Store, DEFAULT_STORE_OPTIONS, sanitizeSessionId, newSessionId } from "./state/store.js";
export type { StoreOptions } from "./state/store.js";
export {
  generateValue,
  generateRecord,
  generateSeedRecords,
  generateFromPattern,
  seedCount,
  TIME_ANCHOR_MS
} from "./generator/generate.js";
export { resolveRef, dereference, mergeAllOf, MAX_REF_STEPS } from "./spec/refs.js";
export { createRandom, hashString, scopedRandom } from "./generator/random.js";
export { semanticValue, satisfiesConstraints, seedFaker } from "./generator/semantic.js";
export * from "./types.js";
