#!/usr/bin/env bash
# Purpose: re-run the recorded tambor×ClojureScript experiments (EVALUATION.md
#   R1-R4) at the pinned versions (squint-cljs 0.15.212, cherry-cljs 0.6.38,
#   shadow-cljs 3.5.7) and capture logs as evidence.
# Responsibilities: build the real library (dist/ via tsconfig.build.json at
#   the repo root, needed by every probe), then run R1-R4 in order, teeing
#   each transcript into logs/.
# Rationale: the evidence for a PASS claim is a committed log of the actual
#   commands and outputs, so a reviewer can diff behavior across pins.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p logs

echo "== R1: squint probe (real library)"
npx squint compile real-squint-probe.cljs | tee logs/r1-squint-compile.log
node real-squint-probe.mjs | tee logs/r1-squint-probe.log

echo "== R2: cherry probe (real library, seam)"
npx cherry compile real-cherry-probe.cljs | tee logs/r2-cherry-compile.log
node real-cherry-probe.mjs | tee logs/r2-cherry-probe.log

echo "== R3: macro path-walker probe (real library, squint defmacro)"
npx squint compile real-macro-probe.cljs | tee logs/r3-macro-compile.log
node real-macro-probe.mjs | tee logs/r3-macro-probe.log

echo "== R4: shadow-cljs :advanced probe (real library)"
# :node-script releases leave the dist JS requires external — dist must be
# on NODE_PATH for the bare 'interop/paths.js' require to resolve
npx shadow-cljs release probe | tee logs/r4-shadow-release.log
NODE_PATH="$PWD/../../dist" node probe-advanced.cjs | tee logs/r4-shadow-probe.log

echo "rerun ok"
