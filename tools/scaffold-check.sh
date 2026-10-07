#!/bin/sh
# Contract scaffold-binding check.
#
# Asserts that a contract's property is bound to its specodelic proptest
# scaffold: specodelic/<component>_props.rs exists and declares the test
# function for this property. This is the traceability gate while the
# tambor port has no executable test suite yet; contracts are
# upgraded to vitest / fast-check entries as the implementation lands
# (see corpus README: intended stack is vitest + fast-check).
#
# Usage: scaffold-check.sh <component-dir> <contract-id>
#   component-dir: .espectacular/<component>/ slug, e.g. view-model
#   contract-id:   contract id, e.g. p-translate (kebab) or p_layout (snake)
set -eu

comp="$1"
prop="$2"

# kebab contract ids map to snake function names in the scaffold
prop_fn=$(printf '%s' "$prop" | tr '-' '_')

f="specodelic/${comp}_props.rs"

if [ ! -f "$f" ]; then
    echo "scaffold-check: missing scaffold artifact $f for contract $comp/$prop" >&2
    exit 1
fi

if ! grep -q "fn ${prop_fn}(" "$f"; then
    echo "scaffold-check: scaffold $f does not declare fn ${prop_fn}() for contract $comp/$prop" >&2
    exit 1
fi

echo "scaffold-bound: ${comp}/${prop} -> ${f}#fn ${prop_fn}"