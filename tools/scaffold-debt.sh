#!/bin/sh
# Scaffold-debt report — non-blocking.
#
# TS-port metric (ruling 2026-10-08): the progress unit is a *contract
# binding*, not a specodelic proptest scaffold. The *_props.rs files are
# spk compile artifacts of the corpus — their todo_predicate! stubs can
# only disappear via the corpus loop's **rust:** markers, which a
# TypeScript port never produces. So debt is now counted where
# executability actually lives: .espectacular/*/*.toml contracts that
# lack a [[tests.vitest]] binding. The number shrinks as predicates
# become executable vitest/fast-check tests.
#
# Always exits 0 — reporting, not gating.

set -eu

total=0
files=0
for d in .espectacular/*/; do
    spec=$(basename "$d")
    unbound=0
    for f in "$d"*.toml; do
        [ -f "$f" ] || continue
        grep -q '\[\[tests.vitest\]\]' "$f" || unbound=$((unbound + 1))
    done
    if [ "$unbound" -gt 0 ]; then
        printf '  %-45s %s\n' "$spec" "$unbound"
        files=$((files + 1))
        total=$((total + unbound))
    fi
done

echo "scaffold debt: $total unbound contracts across $files specs (0 = fully executable)"
