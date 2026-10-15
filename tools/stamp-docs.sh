#!/usr/bin/env bash
# Purpose: stamp generated facts into docs so hand-written numbers cannot drift
#   (tambor-cie.5, DRIFT-001/002/003, ACC-004).
# Responsibilities: compute specodelic pin (versions.ddl.toml), spec count
#   (openspec/specs), contract count (.espectacular/*/*.toml) and SPA bundle
#   size (esbuild metafile from a fresh build), then rewrite the stamped
#   regions of README.md and EVALUATION.md in place.
# Rationale: the review found README saying specodelic 0.4.0 while CI pins
#   0.7.0, EVALUATION saying 22 specs vs README's 24, a hand-written "329+"
#   contract count and a stale bundle size. Every copy is now generated; CI
#   regenerates and git-diffs to enforce accuracy (docs-accuracy gate).
set -euo pipefail
cd "$(dirname "$0")/.."

SPK_VERSION=$(sed -n 's/^specodelic = "\([^"]*\)".*/\1/p' versions.ddl.toml)
SPEC_COUNT=$(ls -1 openspec/specs | wc -l | tr -d ' ')
CONTRACT_COUNT=$(ls -1 .espectacular/*/*.toml | wc -l | tr -d ' ')

# Bundle size needs a fresh build with a metafile (ACC-004: never hand-stamp).
rm -f dist/meta.json
npx esbuild src/spa/main.ts --bundle --format=esm --outfile=dist/spa.js \
  --metafile=dist/meta.json --log-level=silent
BUNDLE_KB=$(node -e '
  const m = require("./dist/meta.json");
  const kb = m.outputs["dist/spa.js"].bytes / 1024;
  process.stdout.write(kb.toFixed(1) + " kB");
')

stamp() { # stamp <file> <marker> <value> — replace text between markers
  local file=$1 marker=$2 value=$3
  python3 - "$file" "$marker" "$value" <<'EOF'
import re, sys
path, marker, value = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
pattern = re.compile(
    r"(<!-- stamp:" + re.escape(marker) + r" -->).*?(<!-- /stamp:" + re.escape(marker) + r" -->)",
    re.DOTALL,
)
new, n = pattern.subn(lambda m: m.group(1) + value + m.group(2), text)
if n != 1:
    sys.exit(f"stamp error: marker {marker!r} in {path}: {n} matches (want 1)")
open(path, "w").write(new)
EOF
}

stamp README.md   spk-version    "$SPK_VERSION"
stamp README.md   spec-count     "$SPEC_COUNT corpus specs"
stamp README.md   contract-count "$CONTRACT_COUNT contracts"
stamp README.md   bundle-size    "$BUNDLE_KB"
stamp EVALUATION.md spec-count   "$SPEC_COUNT specs"

echo "stamped: spk=$SPK_VERSION specs=$SPEC_COUNT contracts=$CONTRACT_COUNT bundle=$BUNDLE_KB"
