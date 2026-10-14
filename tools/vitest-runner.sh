#!/bin/sh
# vitest runner shim for ah (espectacular) — tambor-8rq.
#
# ah's batched invocation (espectacular GH#40, v0.11.0) assumes
# `--reporter=json` streams the jest-shaped report on STDOUT, but vitest 5
# ALWAYS routes the json reporter to a file (.vitest/json/output.json by
# default) and prints a "JSON report written to ..." notice line on stdout —
# so ah's parse fails and every batch degrades to per-binding fallback
# (measured: 329/658 contracts re-ran per-binding, batching win lost).
#
# This shim re-runs json-mode invocations with --outputFile=<tmp> and cats
# the clean JSON to stdout for ah's attribution. Non-json invocations (the
# per-binding exit-code runs, e.g. `--testNamePattern=p_values`) pass
# through untouched with vitest's own exit code.
#
# Note: CLI `--reporter=json` REPLACES the config reporter list, so the
# --outputFile here cannot collide with the config junit outputFile
# (vitest.config.ts: per-reporter object form, tambor-8rq).

set -eu

json=0
args=""
for a in "$@"; do
  case "$a" in
    --reporter=json) json=1 ;;
    *) if [ -z "$args" ]; then args="$a"; else args="$args $a"; fi ;;
  esac
done

if [ "$json" -eq 0 ]; then
  exec npx vitest run "$@"
fi

tmp=$(mktemp /tmp/vitest-json.XXXXXX.json)
trap 'rm -f "$tmp"' EXIT INT TERM
npx vitest run --reporter=json --outputFile="$tmp" $args >/dev/null 2>&1 || true
cat "$tmp"
