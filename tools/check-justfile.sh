#!/usr/bin/env bash
# House-standard check for the tambor justfile test recipes.
# Fails (red) if: no justfile, `just test` doesn't route through
# tools/gates/testaruda-exec.sh, or the self-heal/init guard is missing.
set -eu
cd "$(dirname "$0")/.."
out=$(just --justfile justfile --dry-run test 2>&1) || { echo "RED: just test dry-run failed: $out"; exit 1; }
echo "$out" | grep -q 'tools/gates/testaruda-exec.sh' || { echo "RED: just test must run tools/gates/testaruda-exec.sh, got: $out"; exit 1; }
grep -q 'wild-z56' justfile || { echo "RED: testaruda-gate self-heal (wild-z56) missing from justfile"; exit 1; }
grep -q 'test-full' justfile || { echo "RED: test-full (plain vitest) recipe missing"; exit 1; }
echo "GREEN: justfile check passed"
