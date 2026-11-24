---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss4-createselector-pattern-components-memo, pipeline-step:orient]
---

ORIENT tambor-ap8 §4 cycle: createSelector(pick, build) over memo. AC restated (spec components-memo ADDED authored): returns (state) => build(pick(state), state) memoized on the PICKED SLICE's identity — unchanged slice ⇒ cached, changed ⇒ build exactly once, non-object slice ⇒ the memo TypeError, weak retention; build pure over the slice (state is context only, pure_subtree precedent); per-row consumption O(1). Export through interop barrel (src/index.ts re-exports interop via export *). 4.2 render-composition test rides keyed-reconciliation-render.
