#!/usr/bin/env bash
# Purpose: Test oracle for the tdd-ro5 pipeline (green / refactor / fix-review / ship-close gates).
# Responsibilities: run testaruda's exec loop (select → run → ingest → calibrate)
#   against the changed surface and fail the gate if selected tests fail.
#   Accepts an artifact path as $1 (oracle contract) but inspects the repo.
# Exit 0 = pass, exit 20 = no tests affected (benign — nothing to run), other
# non-zero = fail; failure reason is written to stderr.
# Rationale: testaruda is tambor's test runner — vitest + fast-check selection
# over the espectacular contract bindings. Keeping the oracle here means every
# pipeline gate proves correctness through the same runner as the git hooks.
set -uo pipefail

# Artifact path ($1) accepted per the oracle contract but unused: this oracle
# inspects repository state at gate time rather than artifact contents.

code=0
testaruda exec || code=$?

case "$code" in
  0)
    exit 0
    ;;
  20)
    # No tests affected — benign during scaffold phase (todo_predicate! stubs
    # bind no executable tests yet). Say so on stderr, then pass.
    echo "tests-pass: testaruda exec selected no tests (exit 20) — nothing to prove at this gate" >&2
    exit 0
    ;;
  *)
    echo "tests-pass: testaruda exec failed with exit code $code" >&2
    exit "$code"
    ;;
esac
