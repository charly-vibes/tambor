#!/bin/sh
# Scaffold-debt report — non-blocking.
#
# Counts todo_predicate! stubs across the specodelic proptest scaffolds.
# Every occurrence is a property whose predicate is not yet translated to
# an executable assertion (specodelic 0.4.0: verify unimplemented). The
# contract-test gate currently verifies traceability, not behavior; this
# number is the measurable gap that shrinks as the tambor port lands.
#
# Always exits 0 — reporting, not gating.

set -eu

total=0
files=0
for f in specodelic/*_props.rs; do
    [ -f "$f" ] || continue
    n=$(grep -c "todo_predicate!" "$f" || true)
    if [ "$n" -gt 0 ]; then
        printf '  %-45s %s\n' "$f" "$n"
        files=$((files + 1))
        total=$((total + n))
    fi
done

echo "scaffold debt: $total todo predicates across $files scaffold files (0 = fully executable)"