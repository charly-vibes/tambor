# RO5U Review — tambor-ap8 §2 execution diff (painter wiring)

**Work reviewed:** code — keyed records through BuildCtx (dom-reuse.ts:
ReuseCtx keyed fields, KeyedRecord, buildChildWithReuse keyed splice,
spliceKeyed/recordRange helpers, buildArrayChildren), dom.ts (keyed swap,
array-branch delegation, keyed unwrap before dispatch), keyed-table demo
insertFirst, bench-scenarios-b2 registration, keyed-reconciliation-render
tests (2.0 + 2.2).
**Convergence:** Stage 4 (no new CRITICAL/HIGH after Stage 2).
**Verdict:** READY — no correctness findings above MEDIUM; risks noted.

## STAGE 1: DRAFT

Shape GOOD: records swap whole-structure per build mirroring the reuse maps;
the array branch owns keyed planning; buildWith unwraps keyed before
dispatch (output-equality with unkeyed, no wrapper element); range
machinery stays M1's (reusePrev/reuseUsed) — keyed matching only extends
the lookup domain. Files under caps (dom.ts exactly 400, dom-reuse 291).

## STAGE 2: CORRECTNESS

### [CORR-001] MEDIUM — reconcile's O(n·m) scan may regress wall-clock on 1k-row churn

- **Location:** dom-reuse.ts reconcile (scan per next child over previous
  children), consumed per container in buildArrayChildren.
- **Evidence:** the B2 baseline (benchmarks/findings-b2.md) recorded
  mutations ~3 021/op — the invariant keyed matching must drop — but
  wall-clock (median 259 ms/op) now additionally pays the plan scan per
  frame. Distinct keys scan to their match (expected n/2 per child).
- **Impact:** possible wall-clock regression on large lists even as
  mutations collapse.
- **Fix (process, not code):** task 5.1's honest verdict MUST compare
  wall-clock against 5.0's baseline alongside mutations; a real regression
  gets a beads ticket (byKey map in KeyedRecord — design already rejected
  LCS/diff machinery; the map preserves first-match-wins only if
  duplicate-scan order is kept).

### [CORR-002] LOW — keyed rows inside non-array containers rebuild per frame

- **Location:** buildChildrenOf loop (named-wrapper children) passes no
  plan — positional only; a keyed wrapper's fresh object never positionally
  matches.
- **Evidence:** design decision 4 pins keyed containers to the ARRAY build
  branch (index-path stack pushed/popped there); handler/with-color child
  lists are not keyed containers.
- **Impact:** none for the spec's scenarios (list rows are array elements);
  a keyed row inside `on(...)` drawables rebuilds its span per frame.
- **Fix:** none — documented scope pin; revisit only if an app shape needs
  it.

Correctness Quality: GOOD.

## STAGE 3: CLARITY

### [CLAR-001] LOW — recordRange/spliceKeyed doc comments carry the
cross-frame contract; buildChildWithReuse's own doc covers the splice
order. No action. Clarity Quality: GOOD.

## STAGE 4: EDGE CASES

### [EDGE-001] MEDIUM→verified — keyed(k, null) soundness

- **Location:** buildArrayChildren prevInner normalization (null →
  undefined → positional/fresh), recordRange child guard.
- **Evidence:** null inner never recorded (child guard records the wrapper
  only); keyed lookups normalize null prevInner — no WeakMap(null) throw
  reachable.
- **Fix:** none required; a render-level null-inner test would pin it —
  deferred as LOW.

### [EDGE-002] LOW — structurally shared array in two positions gets two
records; donation-once keeps the second container's matches to
positional/build. Sound. Note only.

### [EDGE-003] LOW — short-circuit frames skip build() so keyedPrev retains
the last DRAWN frame's records — sound (the skip draws no new tree).

Edge Case Coverage: GOOD.

## STAGE 5: EXCELLENCE

Allocation per container build: steps + prevInners arrays + two sets —
acceptable at the pinned scale; test quality: refs+shape (2.0), all four
spec boundary scenarios (2.2), M1 suites unmodified (2.3).

**Production Ready: YES** — proceed to ship; 5.1's verdict carries the
wall-clock comparison.

## Convergence checks

- After Stage 2: new CRITICAL 0, HIGH 0 → CONVERGED-trending.
- After Stage 4: no new findings above LOW → CONVERGED.
