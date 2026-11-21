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
3. **Identity checks in the painter, two levels, boundary-honest.**
   The backend cannot sense lane, scheme or size directly: a lane move
   or overlay arrival changes identity at the mount's `wrap()` boundary
   (the wrap carries the offset — `src/spa/mount.ts`), and size/scheme
   changes make the viewCache re-derive into a fresh tree. So both
   checks key on identity alone: (i) whole-view — when the derived view
   is identity-equal to the last drawn view, `draw()` is a no-op; (ii)
   per-child — when building, a child Elem identity-equal to the child
   built at the same position in the previous frame reuses that frame's
   DOM subtree. Any mismatch, `unknown` ChangeSet, or unseen Elem
   rebuilds conservatively.
4. **Commit is immutable and shared.** Listeners, devtools, and future
   scheduler/inspector capabilities all read the same frozen commit
   object; no per-listener copies.
5. **Typed test seam.** Fake-frame tests (pattern from
   add-frame-coalescing tasks) drive dispatch → flush → assert draws;
   a spy backend counts `draw()` calls and rebuilds separately
   (drawCount vs rebuildCount) so the short-circuit is observable.
6. **Reuse map is weak and positional.** A `WeakMap<Elem, BuiltRange>`
   recorded during build maps each built Elem to its element range.
   Reuse fires only on identity match at the same child position;
   reorder/insert/remove fall back to rebuild — keyed matching is
   tambor-ap8's scope (add-keyed-dom-reconciliation), deliberately not
   this change's. The map holds built ranges, never commits.

## Pins (review round 1)

- `sequence` starts at 1 and increments per top-level dispatch;
  overflow beyond `Number.MAX_SAFE_INTEGER` is out of scope.
- Coalescing merges paints, never commits: N dispatches in one frame
  publish N commits and exactly one build-or-skip decision.
- A throwing subscriber is isolated: remaining listeners still receive
  the commit; the first error is re-thrown after the delivery pass
  completes (never swallowed).
- The listener list is snapshotted at dispatch start; unsubscribes
  during delivery take effect from the next commit.
- Memory: the dispatcher retains no commit history (last commit only,
  for diagnostics); listeners own any retention beyond the delivery
  pass and must not hold commits past the frame (bounded-memory gate).

## Test shape (inputs/outputs pinned first)

- Input: streaming appends into a 1,000-row log state with memo-stable
  rows; output: DOM mutations touch only the changed tail rows (same
  element references reused for unchanged rows), derive count equals
  dispatch count, and the whole-view short-circuit fires on no-op
  frames (dispatch changing an undrawn slice).
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
