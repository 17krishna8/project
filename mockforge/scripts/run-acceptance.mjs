#!/usr/bin/env node
/**
 * Runs the black-box acceptance suites whose phase is <= --upto N
 * (default: the number in PHASE_CURRENT). Each suite starts the real
 * `mockforge` CLI on a free port and talks HTTP to it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

let upto = null;
const uptoIdx = argv.indexOf("--upto");
if (uptoIdx !== -1) upto = Number(argv[uptoIdx + 1]);
if (upto === null || Number.isNaN(upto)) {
  const phaseFile = path.join(root, "PHASE_CURRENT");
  upto = existsSync(phaseFile) ? Number(readFileSync(phaseFile, "utf8").trim()) : 0;
}

const phases = JSON.parse(readFileSync(path.join(root, "acceptance/phases.json"), "utf8"));
// vitest is started with the config inside acceptance/, so the filters are
// file names relative to that directory.
const suites = Object.entries(phases)
  .filter(([, phase]) => phase <= upto)
  .map(([id]) => `${id}.test.ts`);

const logsDir = path.join(root, "acceptance/logs");
mkdirSync(logsDir, { recursive: true });

if (suites.length === 0) {
  const msg = `No acceptance suites for --upto ${upto}\n`;
  console.log(msg.trimEnd());
  process.exit(0);
}

const names = suites.join(", ");
console.log(`Acceptance: ${suites.length} suite(s) up to phase ${upto}: ${names}`);

// Run from inside acceptance/ so vitest picks up acceptance/vitest.config.ts
// with that directory as its root (the repo-root workspace file is not used).
const result = spawnSync("npx", ["vitest", "run", ...suites], {
  cwd: path.join(root, "acceptance"),
  encoding: "utf8"
});

const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const logFile = path.join(logsDir, `acceptance-${stamp}.log`);
writeFileSync(logFile, (result.stdout ?? "") + (result.stderr ?? ""));
console.log(`log written to acceptance/logs/${path.basename(logFile)}`);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
