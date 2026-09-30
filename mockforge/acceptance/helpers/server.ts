/**
 * Black-box harness: every acceptance suite starts the real `mockforge` CLI as
 * a child process on a free port and talks plain HTTP to it. Nothing here
 * imports application code.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../..");
export const cliEntry = path.join(repoRoot, "packages/cli/dist/index.js");
export const fixturesDir = path.join(repoRoot, "acceptance/fixtures");

export function fixture(name: string): string {
  return path.join(fixturesDir, name);
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export interface StartedServer {
  baseUrl: string;
  port: number;
  stdout: () => string;
  stderr: () => string;
  stop: () => Promise<void>;
}

export interface StartOptions {
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

/** Starts the CLI and resolves once GET /__health answers. */
export async function startMockForge(specFile: string, opts: StartOptions = {}): Promise<StartedServer> {
  const port = await freePort();
  const child: ChildProcess = spawn(
    "node",
    [cliEntry, specFile, "--port", String(port), ...(opts.args ?? [])],
    { cwd: repoRoot, env: { ...process.env, ...(opts.env ?? {}) }, stdio: ["ignore", "pipe", "pipe"] }
  );

  let out = "";
  let err = "";
  child.stdout?.on("data", (d) => {
    out += String(d);
  });
  child.stderr?.on("data", (d) => {
    err += String(d);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const timeout = opts.timeoutMs ?? 20_000;
  const deadline = Date.now() + timeout;
  let healthy = false;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${baseUrl}/__health`);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  if (!healthy) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    throw new Error(
      `mockforge did not become healthy within ${timeout}ms (exitCode=${child.exitCode}).\n` +
        `--- stdout ---\n${out}\n--- stderr ---\n${err}`
    );
  }

  return {
    baseUrl,
    port,
    stdout: () => out,
    stderr: () => err,
    stop: async () => {
      if (child.exitCode === null) child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
      if (child.exitCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
  };
}

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

/** Runs the CLI to completion (never waits for a server) - exit codes and output. */
export function runCli(
  specFile: string,
  args: string[] = [],
  opts: { env?: Record<string, string>; timeoutMs?: number } = {}
): Promise<CliResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("node", [cliEntry, specFile, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...(opts.env ?? {}) }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }, opts.timeoutMs ?? 20_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, ms: Date.now() - started });
    });
  });
}

/** Writes a throwaway file (used for generated/oversized specs) and returns its path. */
export function tmpFile(name: string, contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mockforge-acc-"));
  const file = path.join(dir, name);
  writeFileSync(file, contents);
  return file;
}
