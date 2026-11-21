# Design: add-runtime-invalidation

## Ground truth (verified at 85d46ae)

- `draw(view)` zeroes and rebuilds the whole element tree
  (`src/render/dom.ts` — `this.root.children.length = 0`).
- The route-time view cache keys on state identity + container size +
  ambient scheme (`src/spa/mount.ts` viewCache) — whole-state
  granularity only; any state change misses.
- `memo` is identity-keyed (~0.1 µs WeakMap hit) and the component
  render cache pays 4.6–5.1 µs canonical serialization — both rest on
  "changed slice ⇒ new identity, unchanged slice ⇒ same identity"
  (guaranteed by the dispatch/paths model).
- Dispatch applies effects in order, publishes exactly one repaint per
  top-level dispatch, skips it for lane-only batches
  (`src/effects/dispatch.ts`).
- Phase timers (opt-in) already span derive/reconcile/paint
  (`src/events/phase-timers.ts`) — instrumentation extends this seam.

## Decisions

1. **Commit publication lives in the app, not the backend.** The
   dispatcher assembles the `DispatchCommit` after effects apply and
   before repaint scheduling; `subscribe` listeners run in commit
   order, may not dispatch reentrantly (queued like effects — a
   listener dispatch is a new commit, sequence incremented).
2. **ChangeSet from paths, not tracking.** Built-in effect kinds
   (`u`, `batch`, lane ops) report affected paths mechanically. A
   custom handler effect returns `unknown` unless it opts in by
   returning path annotations. Rationale: requiring annotations on
   every handler is a new state-management discipline; the conservative
   fallback keeps today's correctness with today's cost.
3. **Identity short-circuit in the painter, guarded.** `draw()` compares
   the incoming view identity against the last drawn view identity AND
   requires: no overlay, no lane offset movement, scheme unchanged,
   container size unchanged. Otherwise full rebuild. The guard set
   mirrors the viewCache key so the short-circuit can never fire when
   the cache would have re-derived for a visible reason.
4. **Commit is immutable and shared.** Listeners, devtools, and future
   scheduler/inspector capabilities all read the same frozen commit
   object; no per-listener copies.
5. **Typed test seam.** Fake-frame tests (pattern from
   add-frame-coalescing tasks) drive dispatch → flush → assert draws;
   a spy backend counts `draw()` calls and rebuilds separately
   (drawCount vs rebuildCount) so the short-circuit is observable.

## Test shape (inputs/outputs pinned first)

- Input: N dispatches over a 1,000-row log state where dispatch i
  touches 1 row; output: rebuildCount stays flat while derive count
  equals dispatch count (memo hit → same view identity).
- Input: dispatch returning an unannotated custom handler effect;
  output: `changes.kind === "unknown"`, full rebuild happens, view is
  correct (never stale).
- Input: two subscribers + one listener that dispatches; output:
  sequences strictly increase, reentrant dispatch lands on the next
  commit, no deadlock.

## Alternatives rejected

- Painter-internal diffing of derived trees (VDOM-lite): rejected —
  public-abstraction creep; keyed reconciliation is the sequenced home
  for structural diffing.
- Deep-equality view comparison: rejected — O(view) per frame and
  philosophically alien (identity is the sanctioned change signal).
