#!/usr/bin/env bash
# House-standard check for the tambor justfile test recipes (DDL test-runner
# standard, recorded in the dulce-de-leche repo): `just test` is the most
# obvious entry — the testaruda exec loop (TDD red→green); `just test-full`
# is the plain vitest suite (gate parity); `just test-blast` previews.
set -eu
cd "$(dirname "$0")/.."
out=$(just --justfile justfile --dry-run test 2>&1) || { echo "RED: just test dry-run failed: $out"; exit 1; }
echo "$out" | grep -q 'tools/gates/testaruda-exec.sh' || { echo "RED: just test must run tools/gates/testaruda-exec.sh, got: $out"; exit 1; }
out=$(just --justfile justfile --dry-run test-full 2>&1) || { echo "RED: just test-full dry-run failed: $out"; exit 1; }
echo "$out" | grep -q 'vitest' || { echo "RED: just test-full must be the full vitest suite, got: $out"; exit 1; }
grep -q 'wild-z56' justfile || { echo "RED: testaruda-gate self-heal (wild-z56) missing from justfile"; exit 1; }
echo "GREEN: justfile check passed"
