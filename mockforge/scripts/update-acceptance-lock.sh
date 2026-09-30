#!/usr/bin/env bash
# Regenerates acceptance/.lock after an intentional change to the acceptance
# contract (human-owned: the integrity gate fails a stale lock).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/integrity/hash-acceptance.mjs > acceptance/.lock
echo "acceptance/.lock updated: $(cat acceptance/.lock)"
