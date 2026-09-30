// a03 - spec robustness (phase 2)
// Proves B2 security/robustness rules: circular refs must not hang, a malformed
// spec exits non-zero naming the location, remote $refs are rejected, and
// specs over 5 MB are rejected.
import { describe, expect, it } from "vitest";
import { request } from "../helpers/http.js";
import { fixture, runCli, startMockForge, tmpFile, type StartedServer } from "../helpers/server.js";

describe("a03 spec robustness", () => {
  it("a03.1 a circular $ref boots in under 5 seconds and still serves data", async () => {
    let server: StartedServer | undefined;
    try {
      const t0 = Date.now();
      server = await startMockForge(fixture("circular.yaml"), { timeoutMs: 8000 });
      expect(Date.now() - t0).toBeLessThan(5000);
      const res = await request(server.baseUrl, "GET", "/nodes");
      expect(res.status).toBe(200);
      const list = res.body as Array<Record<string, unknown>>;
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      for (const node of list) {
        expect(typeof node.label).toBe("string");
        expect(Array.isArray(node.children)).toBe(true);
      }
    } finally {
      await server?.stop();
    }
  });

  it("a03.2 a malformed spec exits non-zero naming the failing location", async () => {
    const result = await runCli(fixture("malformed.yaml"));
    expect(result.code).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    // The message must point at where the spec is broken (line/column or JSON path).
    expect(output).toMatch(/(line \d+|column \d+|\$\.|path)/i);
  });

  it("a03.3 a remote $ref is rejected, naming the offending reference", async () => {
    const result = await runCli(fixture("remote-ref.yaml"));
    expect(result.code).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output.toLowerCase()).toMatch(/(remote|\$ref|https:\/\/example\.com)/);
  });

  it("a03.4 a spec over 5 MB is rejected", async () => {
    const filler = "x".repeat(6 * 1024 * 1024);
    const big = [
      "openapi: 3.0.3",
      "info:",
      "  title: Too Big",
      "  version: 1.0.0",
      `  description: ${filler}`,
      "paths:",
      "  /ping:",
      "    get:",
      "      responses:",
      "        '200':",
      "          description: pong"
    ].join("\n");
    const file = tmpFile("too-big.yaml", big);
    const result = await runCli(file);
    expect(result.code).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output.toLowerCase()).toMatch(/(5\s*mb|5mb|size|too large|limit)/);
  });
});
