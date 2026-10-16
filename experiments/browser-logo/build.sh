#!/usr/bin/env bash
# Purpose: build the y9d.7 browser artifacts — the same Logo world source
#   (src/logo/*.cljs) compiled by squint and by cherry into two separate
#   artifact directories, each a static page + one esbuild bundle.
# Responsibilities: the exact build commands, in the exact order (the two
#   compilers both emit `main.mjs` next to the .cljs sources, so each
#   build must compile AND bundle before the next compiler runs); the
#   CSP scan of the emitted bundles (eval / new Function / import()).
# Rationale: reproducibility is the point of the evidence — any
#   reviewer re-running this script gets the same artifacts the
#   screenshots were taken from.
set -euo pipefail

# --- squint build: compile .cljs → .mjs, bundle → artifact-squint/ ---
npx squint compile src/logo/expr.cljs
npx squint compile src/logo/interp.cljs
npx squint compile src/logo/checks.cljs
npx squint compile src/logo/main.cljs
npx esbuild src/logo/main.mjs --bundle --format=iife --outfile=artifact-squint/bundle.js

# --- cherry build: same source, cherry compiler, separate artifact ---
npx cherry compile src/logo/expr.cljs
npx cherry compile src/logo/interp.cljs
npx cherry compile src/logo/checks.cljs
npx cherry compile src/logo/main.cljs
npx esbuild src/logo/main.mjs --bundle --format=iife --outfile=artifact-cherry/bundle.js

# --- the bundles re-materialize the squint .mjs files, so re-emit the
# --- squint .mjs files last to leave the source tree squint-shaped
npx squint compile src/logo/expr.cljs >/dev/null
npx squint compile src/logo/interp.cljs >/dev/null
npx squint compile src/logo/checks.cljs >/dev/null
npx squint compile src/logo/main.cljs >/dev/null

# --- CSP scan: dynamic code generation would violate script-src 'self'
for b in artifact-squint/bundle.js artifact-cherry/bundle.js; do
  echo "== CSP scan: $b"
  grep -n "eval(" "$b" | head -3 || true
  grep -cn "new Function" "$b" | head -3 || true
  grep -n "document.write\|setTimeout(\"\|setAttribute(\"on\|import(" "$b" | head -5 || true
done
echo "build ok"
