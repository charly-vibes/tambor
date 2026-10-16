# tambor — dev commands
#
# Gates live in lefthook.yml (pre-push: ah check --run-tests, pretender gate,
# testaruda exec, scaffold-debt report) — this justfile is the dev loop, not
# the gate. `just test` runs the affected-test loop through testaruda for the
# TDD red→green cycle; `just test-full` is the plain vitest suite (what CI's
# `npm test` parity and the ah contract tests effectively cover).
#
# House standard: dulce-de-leche justfile structure; testaruda exit-code
# contract (0 = ran and passed, 10 = store uncalibrated, 20 = nothing
# affected — all green) per tools/gates/testaruda-exec.sh; exit-4 self-heal
# after wild-z56.

set shell := ["bash", "-uc"]

default:
    @just --list

# === Test Commands ===

# TDD loop (default for red→green): testaruda exec — select the tests the
# working diff affects, run only those, ingest results, calibrate. The gate
# script owns the tolerance contract (0/10/20 green, calibration veto per
# tambor-cpd). The local store (.testaruda/, gitignored) is initialized on
# first use; a stale store self-heals (wild-z56).
test:
    #!/usr/bin/env bash
    set -uo pipefail
    if [ ! -d .testaruda ]; then
      testaruda init || { echo "❌ testaruda init failed" >&2; exit 1; }
    fi
    code=0
    tools/gates/testaruda-exec.sh || code=$?
    case "$code" in
      0|10|20) exit 0 ;;
      4)
        echo "⚠️ runner exit 4 — pruning stale local calibration store and retrying once (wild-z56)" >&2
        rm -rf .testaruda
        testaruda init || { echo "❌ testaruda re-init failed" >&2; exit 1; }
        tools/gates/testaruda-exec.sh ;;
      *) exit "$code" ;;
    esac

# Full suite, no selection (plain vitest — slowest, complete signal).
# CI parity: .github/workflows/ci.yml runs npm test + testaruda exec.
test-full:
    npx vitest run

# Blast-radius preview: which tests a change WOULD affect — runs nothing.
# Useful before a refactor; optionally name files: just test-blast src/label.ts
test-blast *files:
    #!/usr/bin/env bash
    if [ -z "{{files}}" ]; then
      testaruda select --pre-edit --human
    else
      testaruda select --pre-edit --human --files "{{files}}"
    fi

# Selection-only run (executes the affected tests, still ingests) without
# the full exec loop's calibrate step — same runner the gate uses.
test-selected:
    testaruda select --safe --human

# Self-check of this justfile's test recipes (house standard: red→green)
test-justfile:
    tools/check-justfile.sh

# === Health Commands ===

# testaruda config/store validation (same check pre-commit runs)
testaruda-doctor:
    testaruda doctor

# Type-check (tsc strict, same as the commit gate's tsc: strict clean)
type-check:
    npx tsc -p tsconfig.json --noEmit
