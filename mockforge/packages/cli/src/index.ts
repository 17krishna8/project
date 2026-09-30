#!/usr/bin/env node
import fs from "node:fs";
import { createMockForge, listen, MOCKFORGE_VERSION, SpecError } from "@mockforge/core";

const USAGE = `mockforge [specFile] [options]

  The spec file is optional: without one the server boots and the dashboard
  opens on an upload view - POST a spec to /__admin/spec to start mocking.

  --port <n>            port to listen on (default 3000)
  --host <addr>         host to bind (default 127.0.0.1)
  --latency <ms>        base latency injected into every response (default 0)
  --error-rate <0..1>   probability of an injected fault (default 0)
  --error-split <a:b>   404:500 weights for injected faults (default 50:50)
  --seed <n>            deterministic generation seed
  --watch               reload the mock when the spec file changes
  --session-ttl-min <n> session time-to-live in minutes (default 60)
  --max-sessions <n>    maximum live sessions, LRU evicted (default 500)
  --max-records <n>     maximum records per session resource (default 10000)
  --mode <dev|prod>     dev validates every response against the spec (default dev)
  --dashboard <dir>     directory with the built dashboard
  -h, --help            show this help
  -v, --version         show version`;

interface CliOptions {
  specPath: string;
  port: number;
  host: string;
  latencyMs: number;
  errorRate: number;
  split404: number;
  split500: number;
  seed: number;
  watch: boolean;
  sessionTtlMin: number;
  maxSessions: number;
  maxRecords: number;
  mode: "dev" | "prod";
  dashboardDir?: string;
}

/** Flags that take no value. */
const BOOLEAN_FLAGS = new Set(["--watch"]);

const VALUE_FLAGS = new Set([
  "--port",
  "--host",
  "--latency",
  "--error-rate",
  "--error-split",
  "--seed",
  "--session-ttl-min",
  "--max-sessions",
  "--max-records",
  "--mode",
  "--dashboard"
]);

function numberFlag(name: string, raw: string, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new SpecError(`${name} expects a number, got "${raw}"`, `$.cli.${name}`);
  }
  return raw === "" ? fallback : value;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    specPath: "",
    port: 3000,
    host: "127.0.0.1",
    latencyMs: 0,
    errorRate: 0,
    split404: 50,
    split500: 50,
    seed: 1,
    watch: false,
    sessionTtlMin: 60,
    maxSessions: 500,
    maxRecords: 10_000,
    mode: "dev"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h" || arg === "--version" || arg === "-v") continue;
    if (!arg.startsWith("--")) {
      if (options.specPath !== "") {
        throw new SpecError(`Unexpected extra argument "${arg}"`, "$.cli.argv");
      }
      options.specPath = arg;
      continue;
    }
    const separator = arg.indexOf("=");
    const name = separator === -1 ? arg : arg.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : arg.slice(separator + 1);
    if (BOOLEAN_FLAGS.has(name)) {
      if (name === "--watch") options.watch = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      throw new SpecError(`Unknown option "${name}"`, "$.cli.argv");
    }
    let value = inlineValue;
    if (value === undefined) {
      value = argv[index + 1];
      index += 1;
    }
    if (value === undefined) {
      throw new SpecError(`${name} expects a value`, "$.cli.argv");
    }
    switch (name) {
      case "--port":
        options.port = numberFlag(name, value, options.port);
        break;
      case "--host":
        options.host = value;
        break;
      case "--latency":
        options.latencyMs = numberFlag(name, value, options.latencyMs);
        break;
      case "--error-rate":
        options.errorRate = numberFlag(name, value, options.errorRate);
        break;
      case "--error-split": {
        const parts = value.split(":");
        const split404 = Number(parts[0]);
        const split500 = Number(parts[1] ?? 100 - split404);
        if (!Number.isFinite(split404) || !Number.isFinite(split500) || split404 + split500 <= 0) {
          throw new SpecError(`--error-split expects "a:b" weights, got "${value}"`, "$.cli.error-split");
        }
        options.split404 = split404;
        options.split500 = split500;
        break;
      }
      case "--seed":
        options.seed = numberFlag(name, value, options.seed);
        break;
      case "--session-ttl-min":
        options.sessionTtlMin = numberFlag(name, value, options.sessionTtlMin);
        break;
      case "--max-sessions":
        options.maxSessions = numberFlag(name, value, options.maxSessions);
        break;
      case "--max-records":
        options.maxRecords = numberFlag(name, value, options.maxRecords);
        break;
      case "--mode":
        if (value !== "dev" && value !== "prod") {
          throw new SpecError(`--mode expects dev or prod, got "${value}"`, "$.cli.mode");
        }
        options.mode = value;
        break;
      case "--dashboard":
        options.dashboardDir = value;
        break;
    }
  }
  return options;
}

function printSummary(info: {
  title: string;
  version: string;
  routeCount: number;
  resourceCount: number;
  bootMs: number;
  url: string;
  dashboardUrl: string;
}): void {
  const resources = info.resourceCount === 1 ? "resource" : "resources";
  console.log("");
  console.log(`  MockForge v${MOCKFORGE_VERSION}`);
  console.log(`  Spec:       ${info.title} v${info.version}`);
  console.log(`  Routes:     ${info.routeCount}  (${info.resourceCount} ${resources})`);
  console.log(`  Boot:       ${info.bootMs} ms`);
  console.log(`  Server:     ${info.url}`);
  console.log(`  Dashboard:  ${info.dashboardUrl}`);
  console.log("");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(`mockforge ${MOCKFORGE_VERSION}`);
    process.exit(0);
  }
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`mockforge: ${message}`);
    console.error(USAGE);
    process.exit(2);
  }

  if (options.specPath === "") {
    // No spec: boot anyway and serve the upload view at /__ui. A spec can be
    // pushed later with POST /__admin/spec.
    console.log("mockforge: no spec given - open the dashboard to upload one");
  }

  try {
    const started = Date.now();
    const forge = await createMockForge(options);
    const info = await listen(forge, options.host, options.port);
    printSummary({ ...info, bootMs: Date.now() - started });

    // --watch: reload the spec when the file changes. A broken edit is reported
    // and the running route table is kept (a10.6).
    let watcher: fs.FSWatcher | null = null;
    let reloading = false;
    if (options.watch && options.specPath !== "") {
      try {
        watcher = fs.watch(options.specPath, () => {
          if (reloading) return;
          reloading = true;
          // Editors often write in two steps; let the file settle first.
          setTimeout(() => {
            forge
              .reloadFromDisk()
              .then((summary) => {
                console.log(
                  `mockforge: reloaded ${options.specPath} - ${summary.title} v${summary.version}, ${summary.routes} routes`
                );
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`mockforge: reload failed, keeping the current routes: ${message}`);
              })
              .finally(() => {
                reloading = false;
              });
          }, 50);
        });
      } catch (error) {
        console.error(
          `mockforge: could not watch ${options.specPath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const shutdown = async () => {
      watcher?.close();
      await forge.close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  } catch (error) {
    if (error instanceof SpecError) {
      console.error(`mockforge: invalid spec ${options.specPath}: ${error.message}`);
      process.exit(1);
    }
    const code = (error as { code?: string }).code;
    if (code === "EADDRINUSE") {
      console.error(`mockforge: port ${options.port} is already in use`);
      process.exit(1);
    }
    console.error(`mockforge: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

void main();
