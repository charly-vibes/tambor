# Tasks: add-keyed-dom-reconciliation

## 1. Key declaration + reconcile core (pure)

- [x] 1.0 Red: unit test — `reconcile(prev, next, key)` on keyed,
      identity-stable children: prev `[a, b, c]` (k1/k2/k3), next
      `[c, a, b]` plans reuse of previous indexes 2, 0, 1 with zero
      build steps; the key extractor defaults to reading the declared
      `key` field.
- [x] 1.1 Green: implement `keyed(key, drawable)` in
      `src/views/nodes.ts` (plain frozen data via the existing
      deepFreeze; loud TypeError on non-primitive/empty-string/
      non-finite keys and on group drawables) and the pure
      `reconcile(prev, next, key)` plan function in
      `src/render/dom-painters.ts` (per-next-child steps:
      reuse(prevIndex) or build; no DOM, no elements touched).
- [x] 1.2 Red→Green: keyed insert — prev `[a, b, c]`, next
      `[x, a, b, c]` with x fresh-keyed plans build for x only; keyed
      remove — prev `[a, b, c]`, next `[a, c]` plans reuse 0 and 2 with
      no step for b.
- [x] 1.3 Red→Green: the identity guard — a next child whose key
      matches but whose Elem is fresh plans build (never splice);
      duplicate keys plan at most one donation — the first candidate
      reuses, further same-key children fall through to the
      positional/fresh steps (the renderer never throws on key bugs).
- [x] 1.4 Red→Green: unkeyed children plan exactly M1's positional
      rule (same-index identity reuse, else build) — the plan for a
      no-key list is byte-equivalent to today's behavior, and
      `keyed(...)` drawables build identically to unkeyed ones
      (output-equality assertion).
- [x] 1.5 Red→Green (RO5U §1 review CORR-001/EDGE-001/CORR-003 fix):
      keyed wrappers are transparent to the view model — Elem admits
      KeyedDraw; geometry reads through (origin/bounds/width/height ==
      inner's, children == [inner], makeNode roundtrip, isElem true);
      nesting keyed is a loud TypeError; the a11y mirror walks through
      the wrapper; the explicit reconcile key extractor is pinned.
      Spec delta: the transparency requirement in
      app-keyed-dom-reconciliation.

## 2. Painter wiring (spy backend)

- [x] 2.0 Red: spy-backend test — keyed rows reordered
      (`[c, a, b]`) splice: the same three element references appear
      in the new order, rebuildCount unchanged vs. the unkeyed baseline
      for the same frame (row-level element identity asserted by
      reference equality); then keyed insert
      mid-list: exactly one new element range and subsequent rows keep
      element references; then keyed remove: the remaining rows keep
      element references.
- [x] 2.1 Green: wire the per-parent records through BuildCtx
      (previous children + key→prevIndex, swapped whole-structure per
      build with keyed records per container index-path) and consume the
      reconcile plan in `buildChildWithReuse` ahead of the positional
      check; splice donation still flows through reusePrev/reuseUsed.
- [x] 2.2 Red→Green: boundary gates — an unknown-ChangeSet frame with
      keyed children performs a full rebuild (no splice anywhere); a
      hintless draw never reuses; keys never enable the whole-view
      short-circuit (identity-equal view + unknown frame still
      rebuilds, M1's rule re-asserted with keys present); the same key
      under a different parent container rebuilds.
- [x] 2.3 Red→Green: M1 invariants intact — the landed
      tests/runtime-invalidation.test.ts cases stay green unmodified:
      positional reuse for unkeyed children, fresh-but-equal rebuild,
      unknown disables reuse, streaming-append tail-only mutation
      (B3's anchor scenario).

## 3. Keyed path navigator (state-paths)

- [x] 3.0 Red: unit test — select
      `["keypath", "messages"], ["by-key", "id", "m-2"],
      ["keypath", "text"]` returns the matching message's text; zero
      matches throw keyed-not-found carrying the field and value;
      duplicate matches throw keyed-ambiguous (select and write
      alike).
- [x] 3.1 Green: implement the by-key navigator — vocabulary +
      normalize support in `src/effects/paths-core.ts`, one handler in
      `src/effects/paths-walk-navigators.ts` (select/update/set/delete
      through the matched element; Object.is; exactly-one), following
      the seq-nth loud-failure precedent; `src/effects/paths.ts`
      stays a thin re-export.
- [x] 3.2 Red→Green: handler stability — insert a message above and
      re-run the SAME by-key update path: it lands on the same logical
      message at its new index, the sequence shape is preserved and
      the other messages keep their identity (structural sharing).
- [x] 3.3 Red→Green: delete through by-key splices the matched
      element; a by-key path at a REMOVED id throws keyed-not-found
      instead of writing elsewhere (the index-retarget hazard pinned
      as a loud failure); the existing state-paths contract tests
      (nth/seq-nth/filter semantics) stay green.

## 4. createSelector pattern (components-memo)

- [x] 4.0 Red: unit test — `createSelector(pick, build)`: N calls
      across derives with an identity-unchanged picked slice run build
      once and return the same derived value; a changed picked slice
      runs build exactly once; a primitive/null picked value throws
      the memo TypeError.
- [x] 4.1 Green: implement in `src/components/memo/` over the memo
      cache shape (WeakMap, weak retention); export from
      `src/index.ts` + `src/interop/index.ts` barrels (`src/core.ts`
      re-exports only).
- [x] 4.2 Red→Green: the row-selection pattern — a 1,000-row list
      re-derived with one selection change: build runs once for the
      frame and each row's selected boolean is an O(1) comparison
      against the derived selection (call-count assertions), and the
      rows keyed by id keep element identity across the selection
      change (composes with §2).

## 5. Bench B2 — DOM reconciliation (roadmap-pinned for M2)

- [ ] 5.0 Register the B2 baseline scenario in the bench registry
      (tests/e2e/bench-scenarios-* pattern) and record the BASELINE
      before the mechanism lands — this task completes BEFORE task
      2.1. The baseline is TODAY'S positional-only reuse under
      reorder/insert/remove churn on a memo-stable list: DOM-mutation
      count and wall clock under CPU×4. Record in
      `benchmarks/findings-b2.md` with findings-bz.md conventions
      (environment table, medians/p25/p75/p90, pinned commit +
      browser, raw JSON kept).
- [ ] 5.1 After §2 lands: re-run B2 — keyed rows' DOM mutations drop
      to the structural delta (moved elements moved, not rebuilt);
      focus/selection preservation verified in a REAL browser (focus
      an input inside a keyed row, insert a row above, the focused
      element keeps its DOM identity and selection). Honest verdict
      section against 5.0's baseline; the B3 streaming anchor and the
      pinned state-equivalence contract green in both runs.

## 6. Gates

- [ ] 6.1 Full suite green (`just test-full`); `ah check --run-tests`
      green.
- [ ] 6.2 `openspec validate add-keyed-dom-reconciliation --strict`
      exits 0 (all four deltas).
- [ ] 6.3 On approval, spec deltas deployed per the authored-directly
      corpus convention (tambor-41q): the new
      app-keyed-dom-reconciliation capability; the wholesale MODIFIED of
      the Property coverage mirror requirement in
      `app-runtime-invalidation` (reuse predicates rescoped to unkeyed
      children);
      the `state-paths` and `components-memo` ADDED requirements;
      priority families' contract TOMLs hand-authored under
      `.espectacular/changes/add-keyed-dom-reconciliation/` bound via
      [[tests.vitest]] --testNamePattern to the landed test titles;
      the remaining scenarios tracked via ah check no-toml findings
      per repo precedent (add-frame-coalescing and
      add-runtime-invalidation carry the same class).
