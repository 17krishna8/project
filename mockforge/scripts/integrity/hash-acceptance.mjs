#!/usr/bin/env node
/**
 * Deterministic SHA-256 over every file under acceptance/ except .lock.
 * The digest is what acceptance/.lock must contain.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const accDir = path.join(root, "acceptance");

// Run outputs (acceptance/logs) are not part of the contract: they change on
// every run and must not make the lock stale.
const EXCLUDED_DIRS = new Set(["logs"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(accDir)
  .filter((f) => path.basename(f) !== ".lock")
  .sort();

const hash = createHash("sha256");
for (const file of files) {
  hash.update(path.relative(root, file).replaceAll("\\", "/"));
  hash.update("\0");
  hash.update(readFileSync(file));
  hash.update("\0");
}

process.stdout.write(`${hash.digest("hex")}\n`);
