#!/bin/sh
# Per-gate timing wrapper (tambor-j44).
#
# Runs a gate command, propagates its exit code, and appends one CSV row
# per invocation to $GATE_TIMING_LOG (default: ./.gate-timing.log):
#
#     ts,gate,exit,duration_ms
#
# lefthook prints per-job durations only in its ephemeral end-of-hook
# summary — this wrapper is the persistence layer that lets gate costs
# accumulate into a measurable distribution across pushes before any
# restructuring of the pre-push suite. The log is gitignored.

set -u

if [ $# -lt 2 ]; then
    echo "usage: gate-timing.sh <gate-name> <cmd...>" >&2
    exit 64
fi

gate="$1"
shift
log="${GATE_TIMING_LOG:-.gate-timing.log}"

start=$(date +%s%3N)
"$@"
code=$?
end=$(date +%s%3N)

if [ ! -f "$log" ]; then
    printf 'ts,gate,exit,duration_ms\n' >"$log"
fi
printf '%s,%s,%s,%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$gate" "$code" "$((end - start))" >>"$log"

exit "$code"