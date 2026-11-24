---
reviews: ro5u-akp.md
verdict: pass
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-akp-pretender-debt, pipeline-step:ro5u-review]
---

RO5U tambor-akp refactor (diff vs e737886, 6 files +157/-353): CLEAN, no fixes.
- Correctness: contrast.ts/backdrop.ts/todo-strokes.ts are verbatim extractions; surfaceBehind split (backdropLayers walk + compositor) preserves the early-opaque stop and bottom-up composite; collectors invert the clip test correctly (<= returns 0), cap and counter semantics identical; readVisualFacts spreads fresh collector arrays (equivalent to the old same-array mutation).
- Edge cases: ELEMENT_LIMIT slice, zero-area skip, carve-out rounded-surface compare, empty carveOuts default all preserved.
- Invariants: extractor values stay JSON (numbers, capped short samples); no DOM escapes the page path.
- Complexity: gate proves every top-level fn within floors (0 findings, both files finding-free; baseline ids dropped).
- Maintainability: module headers carry the split rationale; marker doc moved with its detector.
- Observations only: (1) compact multi-declarator/one-line-object forms in countLeafViolations would re-bloat if prettier ever formats bombadil/ (eslint+prettier ignore it today; gates never format it) - recorded, accepted; (2) bombadil/ is outside root tsc; bombadil/tsconfig.json is the covering typecheck - run manually here, CI gap noted for tambor-2xq territory.
- Verification: pretender gate 4 known/0 new; root + bombadil tsc clean; just test 972/972 exit 0; 60s headless property walk - visual-floor properties green, extractors error-free; pre-existing todoRowsMatchModel red bisected to HEAD and filed tambor-4ny (out of scope).

