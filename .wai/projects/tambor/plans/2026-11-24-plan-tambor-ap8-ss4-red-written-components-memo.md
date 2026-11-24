---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss4-createselector-pattern-components-memo, pipeline-step:plan]
---

PLAN tambor-ap8 §4: RED (written): components-memo.test.ts §4 describe — 4 tests (identity-unchanged slice build-once; changed slice rebuild-once + cached; non-object/null slice memo TypeError with message; build receives slice+state context). Then 4.2 render-level in keyed-reconciliation-render.test.ts (1,000-row keyed list, selection slice via module selector: build once per frame, keyed rows keep element identity). GREEN: createSelector in src/components/memo/memo.ts (WeakMap on picked slice, memo TypeError verbatim), export { createSelector } from interop/index.ts barrel. NARROW: npx vitest run tests/components-memo.test.ts; FULL: just test-full. FILES: memo.ts, interop/index.ts, the two test files. COMMIT: §4 feature commit.
