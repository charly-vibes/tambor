# RO5U Review — tambor-ap8 §1 execution diff (keyed declaration + reconcile plan)

**Work reviewed:** code — keyed(key, drawable) in src/views/nodes.ts, reconcile(prev,next,key) in src/render/dom-reuse.ts, re-export surface in src/render/dom-painters.ts + src/views/model.ts, tests/keyed-reconciliation.test.ts, budget re-record in tests/helpers/docs-delivery-budget.ts.
**Convergence:** reached at Stage 4 (no new CRITICALs after Stage 2).
**Verdict:** NEEDS_REVISION — CORR-001 blocks §2 wiring.

## STAGE 1: DRAFT

Shape GOOD: pure plan function next to the reuse machinery; wrapper as renderer
metadata (no draw type, no backend parity burden); tests pin tasks 1.0–1.4
verbatim; static titles.

## STAGE 2: CORRECTNESS

### [CORR-001] CRITICAL — keyed() is unusable inside app views

- **Location:** src/views/nodes.ts:53 (Elem union), src/effects/dispatch.ts:185
  (App.view(): Elem), src/views/geometry.ts:61,131,218,247.
- **Evidence:** `KeyedDraw` is not in `Elem = Node | readonly Elem[] | null |
  undefined`, so `view(): Elem` rejects keyed rows type-wise. At runtime every
  per-type geometry table lacks a `"keyed"` entry, so `origin`, `computeBounds`,
  `children` and `makeNode` throw `unreachable node type: keyed` the moment a
  tree containing a keyed wrapper reaches them (scrollview/group layout,
  bounds-based components). `isElemNode` is SIZES-driven, so `isElem(keyedView)`
  is false — a cellScale≠1 DOM backend treats the keyed view as a foreign node
  and keeps the container extent.
- **Why it matters:** the spec requires keyed rows INSIDE drawn lists
  (app-keyed-dom-reconciliation: "an app wraps a row as keyed("m-7",
  rowOf(item)) and the list is drawn twice"). §2's mount-based spy tests need
  keyed rows inside Elem views. The authored docs under-plan this: proposal
  Impact and tasks.md list no geometry work, and no view-model delta exists.
- **Fix:** admit `KeyedDraw` into the Elem union; add read-through entries to
  ORIGINS/SIZES/CHILDREN/REBUILDERS (transparent wrapper: origin/bounds ==
  inner's, children == `[inner]`, rebuild == `keyed(e.key, cs[0])`; setSize
  keeps the default throw — a wrapper is not sizeable); geometry-equality test
  (keyed wrapper bounds/origin/children == inner's, makeNode roundtrip); pin
  the transparency as an ADDED requirement in the keyed capability spec; add a
  §1 task for the wiring; verify the text backend's unknown-type traversal.

### [CORR-002] HIGH — a11y works only via the drawables tuple shape

- **Location:** src/render/a11y.ts:51-54.
- **Evidence:** the walk reads `node.drawable` then `node.drawables ?? []`;
  KeyedDraw renders correct a11y because the wrapper carries `drawables:
  [inner]` — undocumented, unasserted.
- **Fix:** once Elem admits keyed, add an a11y assertion (keyed row exposes the
  inner node's a11y facts).

### [CORR-003] MEDIUM — KeyFn extractor param untested

- **Location:** src/render/dom-reuse.ts reconcile signature; tests file.
- **Evidence:** the default extractor is exercised; the explicit `key` param
  has zero coverage.
- **Fix:** add an explicit-extractor test (e.g. extracting keys from plain
  object rows).

Correctness Quality: FAIR (plan function itself sound; the declaration is not
usable end-to-end yet).

## STAGE 3: CLARITY

### [CLAR-001] LOW — keyed() comment borrows memo's phrase

- **Location:** src/views/nodes.ts keyed() doc comment.
- **Fix:** reword "(identity is the invalidation signal; here the key is the
  lookup domain)" to keyed's own terms only.

Clarity Quality: GOOD.

## STAGE 4: EDGE CASES

### [EDGE-001] MEDIUM — nested keyed accepted silently

- **Location:** src/views/nodes.ts keyed(); src/render/dom-reuse.ts keyedInner.
- **Scenario:** `keyed(k, keyed(k2, x))` — the nested wrapper is fresh per
  call, so it never identity-matches; the row silently always-builds.
- **Fix:** reject nested keyed loudly at construction (`isKeyed(drawable)` →
  TypeError), mirroring the group rejection.

### [EDGE-002] LOW — key -0 vs 0 distinct under Object.is — consistent with
the Object.is pin; note only.

### [EDGE-003] LOW — keyed(k, null) accepted, draws nothing — consistent with
the pins (only groups rejected); note only.

Edge Case Coverage: GOOD.

## STAGE 5: EXCELLENCE

Allocation fine (steps array + two sets per container build); worst-case
O(n·m) on duplicate keys acceptable (no LCS machinery per design). Static
titles boundable for §6.3 TOMLs.

Excellence Assessment: Structure GOOD / Correctness FAIR / Clarity GOOD /
Edge Cases GOOD / Overall GOOD. **Production Ready: WITH_NOTES** — fix
CORR-001 (+EDGE-001, CORR-003) before §2.

## Convergence checks

- After Stage 2: new CRITICAL 1, total new 3 → CONTINUE.
- After Stage 3: new CRITICAL 0, new-issue rate < 10% → CONVERGED-trending.
- After Stage 4: new CRITICAL 0 → CONVERGED.

## Recommended actions (fix phase order)

1. CORR-001: Elem union + geometry read-through + test + spec pin + task.
2. EDGE-001: reject nested keyed at construction.
3. CORR-003: explicit KeyFn extractor test.
4. CLAR-001: reword keyed() comment; CORR-002: a11y assertion with the §2 spy tests.
