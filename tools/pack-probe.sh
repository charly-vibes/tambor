#!/usr/bin/env bash
# Purpose: distribution.packaging gate — pack, clean-install and ESM-import
#   probe for the publishable tambor package (brief tambor-y9d.1).
# Responsibilities: build nothing itself beyond npm's prepack hook; pack the
#   tarball, install it into a pristine project, and assert the clean-project
#   import contract: root entry yields >=5 named exports and the DOM-free
#   ./core subpath resolves.
# Rationale: openspec/changes/add-distribution-packaging is the design
#   authority; a clean-room install is the only honest check that the
#   exports map, files allowlist and emitted declarations survive npm.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIN_EXPORTS="${MIN_EXPORTS:-5}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== npm pack =="
TARBALL="$(cd "$REPO_ROOT" && npm pack --silent | tail -n1)"
TARBALL_PATH="$REPO_ROOT/$TARBALL"
echo "packed: $TARBALL_PATH"

echo "== clean project install =="
cd "$WORK"
npm init -y >/dev/null
npm i --no-save --silent "$TARBALL_PATH" >/dev/null

echo "== ESM import probe =="
node -e '
  const min = Number(process.env.MIN_EXPORTS);
  Promise.all([import("tambor"), import("tambor/core")]).then(
    ([root, core]) => {
      const n = Object.keys(root).length;
      const c = Object.keys(core).length;
      console.log("exports:", n, "core:", c);
      if (n < min) {
        console.error(`FAIL: root tambor has ${n} named exports, need >= ${min}`);
        process.exit(1);
      }
      if (c < 1) {
        console.error("FAIL: tambor/core resolved but exports nothing");
        process.exit(1);
      }
    },
    (err) => {
      console.error("FAIL: clean-project import threw:", err.message);
      process.exit(1);
    }
  );
'
echo "PASS: clean-project ESM import ($MIN_EXPORTS+ named exports, ./core resolves)"
