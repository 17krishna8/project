#!/usr/bin/env node
/**
 * Integrity gate.
 *
 * 1. acceptance/.lock must equal the SHA-256 of everything under acceptance/
 *    (except .lock). A stale lock means the acceptance contract was edited
 *    without the human-owned lock being refreshed.
 * 2. With --base <ref>: the diff must not modify protected paths from an
 *    agent/* branch, and must not add forbidden test-weakening patterns.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const problems = [];
const git = (args) => execFileSync("git", args, { cwd: root }).toString().trim();

// --- 1. acceptance lock -----------------------------------------------------
const lockPath = path.join(root, "acceptance/.lock");
if (!existsSync(lockPath)) {
  problems.push("acceptance/.lock is missing - run: npm run lock:acceptance");
} else {
  const expected = readFileSync(lockPath, "utf8").trim();
  const actual = execFileSync("node", ["scripts/integrity/hash-acceptance.mjs"], { cwd: root })
    .toString()
    .trim();
  if (expected !== actual) {
    problems.push(
      `acceptance/.lock is stale (current digest is ${actual.slice(0, 12)}...) - run: npm run lock:acceptance`
    );
  }
}

// --- 2. diff checks ---------------------------------------------------------
const baseIdx = process.argv.indexOf("--base");
if (baseIdx !== -1) {
  const base = process.argv[baseIdx + 1];
  const PROTECTED = [
    "acceptance/",
    "PHASE_CURRENT",
    ".github/",
    "scripts/integrity/",
    "CODEOWNERS",
    "AGENT_PLAYBOOK.md"
  ];
  const TEST_FILE = /(\.test\.ts$|^acceptance\/|vitest\.config|vitest\.workspace)/;
  const TEST_FORBIDDEN = [/\.skip\(/, /\.only\(/, /\bxit\(/, /\bxdescribe\(/, /\btodo\(/, /--passWithNoTests/];
  const ANY_FORBIDDEN = [/continue-on-error/, /\|\|\s*true/];

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  let changed = [];
  try {
    changed = git(["diff", "--name-only", `${base}...HEAD`]).split("\n").filter(Boolean);
  } catch {
    console.log(`integrity: could not diff against ${base} (skipping diff checks)`);
  }

  if (branch.startsWith("agent/")) {
    for (const file of changed) {
      if (PROTECTED.some((p) => file === p || file.startsWith(p))) {
        problems.push(`agent/ branch modified protected path: ${file}`);
      }
    }
  }

  let diff = "";
  try {
    diff = git(["diff", `${base}...HEAD`]);
  } catch {
    /* already reported */
  }
  let currentFile = "";
  for (const line of diff.split("\n")) {
    const m = /^\+\+\+ b\/(.*)$/.exec(line);
    if (m) currentFile = m[1] ?? "";
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    if (TEST_FILE.test(currentFile)) {
      for (const re of TEST_FORBIDDEN) {
        if (re.test(line)) problems.push(`forbidden pattern ${re} added in ${currentFile}`);
      }
    }
    for (const re of ANY_FORBIDDEN) {
      if (re.test(line)) problems.push(`forbidden pattern ${re} added in ${currentFile}`);
    }
  }
}

if (problems.length > 0) {
  console.error("INTEGRITY: FAIL");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("INTEGRITY: OK (acceptance lock verified, no forbidden patterns, no protected-path edits)");
