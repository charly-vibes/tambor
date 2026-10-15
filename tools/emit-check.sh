#!/usr/bin/env bash
# Purpose: distribution.packaging.p_declarations gate — tsc emit check for the
#   publishable package (ticket tambor-y9d.1).
# Responsibilities: run the build config's emit and assert both JS and
#   declaration artifacts landed in dist/ for the whole src tree.
# Rationale: openspec/changes/add-distribution-packaging is the design
#   authority; declarations_emitted is a packaging invariant, not a type check.
set -euo pipefail
cd "$(dirname "$0")/.."

npx tsc -p tsconfig.build.json
JS_COUNT="$(find dist -name "*.js" | wc -l)"
DTS_COUNT="$(find dist -name "*.d.ts" | wc -l)"
echo "dist js=$JS_COUNT d.ts=$DTS_COUNT"
[ "$JS_COUNT" -ge 83 ] || { echo "FAIL: expected >=83 js files"; exit 1; }
[ "$DTS_COUNT" -ge 83 ] || { echo "FAIL: expected >=83 d.ts files"; exit 1; }
echo "emit-check: PASS"
