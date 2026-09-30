import { defineConfig } from "vitest/config";

/**
 * Black-box acceptance configuration: suites spawn the built CLI as a child
 * process and speak HTTP to it. No mocking of our own code is allowed here.
 */
export default defineConfig({
  test: {
    include: ["suites/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: "forks",
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ["verbose"]
  }
});
