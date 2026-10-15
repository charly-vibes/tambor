#!/usr/bin/env bash
# Purpose: distribution.packaging.p_core_split gate — DOM-free core subpath
#   check (ticket tambor-y9d.1).
# Responsibilities: emit the build output and import dist/core.js in bare Node,
#   asserting the DOM-free core resolves standalone with >=5 named exports.
# Rationale: openspec/changes/add-distribution-packaging is the design
#   authority; a transitive DOM import would make core un-importable in
#   headless contexts, which is exactly the split this subpath exists for.
set -euo pipefail
cd "$(dirname "$0")/.."

npx tsc -p tsconfig.build.json
node --input-type=module -e "import('./dist/core.js').then(m=>{const n=Object.keys(m).length;console.log('core exports:',n);if(n<5)process.exit(1)})"
echo "core-split-check: PASS"
