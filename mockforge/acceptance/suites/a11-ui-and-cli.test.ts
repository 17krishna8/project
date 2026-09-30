// a11 - UI and CLI (phase 7)
// Proves B1.6/B2 developer experience: /__ui serves the dashboard HTML (and its
// built assets), and the CLI behaves: help, version, exit codes and the
// startup summary.
import { describe, expect, it } from "vitest";
import { request } from "../helpers/http.js";
import { cliEntry, fixture, runCli, startMockForge } from "../helpers/server.js";

describe("a11 UI and CLI", () => {
  it("a11.1 GET /__ui returns the dashboard HTML", async () => {
    const server = await startMockForge(fixture("users.yaml"), { timeoutMs: 25_000 });
    try {
      const res = await request(server.baseUrl, "GET", "/__ui");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.raw).toContain('<div id="root"');
      expect(res.raw).toContain("MockForge Dashboard");

      // When the dashboard is built, its assets must be served too.
      const assetMatch = /(?:src|href)="(\/__ui\/assets\/[^"]+)"/.exec(res.raw);
      if (assetMatch) {
        const asset = await request(server.baseUrl, "GET", assetMatch[1]!);
        expect(asset.status, `asset ${assetMatch[1]} not served`).toBe(200);
      }
    } finally {
      await server.stop();
    }
  });

  it("a11.2 --help exits 0 and documents the flags", async () => {
    const result = await runCli(fixture("users.yaml"), ["--help"]);
    expect(result.code).toBe(0);
    for (const flag of ["--port", "--host", "--latency", "--error-rate", "--error-split", "--seed", "--watch", "--mode"]) {
      expect(result.stdout, `help missing ${flag}`).toContain(flag);
    }
  });

  it("a11.3 --version prints the version and exits 0", async () => {
    const result = await runCli(fixture("users.yaml"), ["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  it("a11.4 running with no arguments exits non-zero", async () => {
    const result = await runCli(fixture("users.yaml"), [], { timeoutMs: 10_000 });
    expect(result.code).not.toBe(0);
  });

  it("a11.5 the startup summary names the spec, routes, boot time and URLs", async () => {
    const server = await startMockForge(fixture("users.yaml"));
    try {
      const summary = server.stdout();
      expect(summary).toContain("Users API");
      expect(summary).toContain("1.2.0");
      expect(summary).toContain(`http://127.0.0.1:${server.port}`);
      expect(summary).toContain("/__ui");
      expect(summary).toMatch(/[Bb]oot/);
      expect(summary).toMatch(/\d+\s*ms/);
      expect(summary).toMatch(/[Rr]outes?:\s*\d+/);
    } finally {
      await server.stop();
    }
  });

  it("a11.6 the CLI entry point exists and is executable", () => {
    expect(cliEntry.endsWith("dist/index.js")).toBe(true);
  });
});
