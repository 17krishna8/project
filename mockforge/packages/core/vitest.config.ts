import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Coverage thresholds are a protected input (scripts/integrity/thresholds.json).
// CI fails if coverage drops below them; lowering the file requires a human.
const thresholds = JSON.parse(
  readFileSync(new URL("../../scripts/integrity/thresholds.json", import.meta.url), "utf8")
) as { statements: number; branches: number; functions: number; lines: number };

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/types.ts"],
      thresholds
    }
  }
});
