# Tasks: add-runtime-invalidation

## 1. ChangeSet + commit publication

- [ ] 1.0 Red: unit test — a `u`-path dispatch publishes a commit with
      `changes.kind === "known"`, the touched path, `previousState`,
      `state`, and an increasing `sequence`; a custom unannotated
      handler publishes `changes.kind === "unknown"` with a reason.
- [ ] 1.1 Green: implement `ChangeSet` + `DispatchCommit` types and
      publication in `src/effects/dispatch.ts` (frozen commit object;
      built-in kinds report paths; custom handlers default unknown).
- [ ] 1.2 Red→Green: lane-only batch publishes a commit whose changes
      carry the lane marker and still triggers NO repaint
      (interaction-lane lane_batch_no_repaint invariant preserved).
- [ ] 1.3 Red→Green: reentrant dispatch from a listener queues as a new
      commit; sequences strictly increase; no deadlock (fake-frame test).
- [ ] 1.4 Red→Green: coalescing merges paints, never commits — 80
      dispatches in one frame publish 80 commits with strictly
      increasing sequences and exactly one build-or-skip decision.

## 2. App.subscribe

- [ ] 2.0 Red: `subscribe(listener)` returns an unsubscribe; two
      listeners receive the same frozen commit in registration order;
      after unsubscribe the listener receives nothing.
- [ ] 2.1 Green: implement on the App handle in `src/core.ts`; export
      types from `src/index.ts` + `src/interop/index.ts` barrels.
- [ ] 2.2 Red→Green: subscribe does not change existing dispatch
      semantics — the pinned stream-dashboard state-equivalence
      contract stays green with a no-op listener attached.
- [ ] 2.3 Red→Green: a throwing listener is isolated — later listeners
      still receive the commit; the first error is re-thrown after the
      delivery pass completes; delivery order is otherwise unchanged.
- [ ] 2.4 Red→Green: the listener list is snapshotted at dispatch
      start — an unsubscribe made during delivery takes effect from the
      next commit, not the in-flight pass.

## 3. Painter identity short-circuit

- [ ] 3.0 Red: spy backend distinguishes `draw()` calls from actual
      rebuilds; a dispatch whose derive yields an identity-equal view
      (memo hit) performs zero rebuilds; a state-changing dispatch with
      a new view identity rebuilds exactly once.
- [ ] 3.1 Green: guard + identity check in `src/render/dom.ts` draw()
      (overlay null, lane unmoved, scheme unchanged, size unchanged —
      mirroring the viewCache key).
- [ ] 3.2 Red→Green: any `unknown` ChangeSet frame forces a full
      rebuild even when the view identity matches (conservative rule;
      never stale output).
- [ ] 3.3 Red→Green: wireDrawTail/wireRerender paths in
      `src/spa/mount.ts` skip the repaint when the derive is
      identity-equal and no overlay/lane movement occurred.
- [ ] 3.4 Red: streaming-append test — appends into a memo-stable
      1,000-row history mutate only the changed tail rows' DOM; every
      unchanged row keeps the same element references across frames
      (reuse observable), derive count still equals dispatch count.
- [ ] 3.5 Green: implement per-child reuse in `buildChildrenOf`
      (`src/render/dom-painters.ts`) — a `WeakMap<Elem, range>`
      recorded during build; an identity match at the same child
      position splices the previous frame's elements; a miss builds
      fresh and records the range.
- [ ] 3.6 Red→Green: conservative fallbacks — reorder, mid-list
      insert/remove, unknown ChangeSet, and fresh-but-structurally-equal
      children all rebuild, never splice (identity is the only reuse
      key; stale output impossible by construction).

## 4. Instrumentation + bench

- [ ] 4.0 Extend phase-timers seam with derive/rebuild/draw counters
      (opt-in, zero-cost when off); expose on the mount handle next to
      drawCount.
- [ ] 4.1 Add the "1 streaming message in a 1,000-message history"
      scenario to the bench registry (tests/e2e/bench-scenarios-*);
      record baseline BEFORE any optimization lands (per proposal PR-01
      rule) in benchmarks/findings-*.md with findings-bz.md conventions
      (environment table, medians/p90, pinned commit + browser).
- [ ] 4.2 Re-run BZ1 + the new scenario after §3; the streaming
      scenario's DOM-mutation count must drop to the changed rows (not
      only wall-clock ms) and record honest numbers + verdict section;
      the pinned state-equivalence contract must be green in both runs.

## 5. Gates

- [ ] 5.1 Full suite green (`just test-full`), `ah check --run-tests`
      green, e2e bench smoke green.
- [ ] 5.2 Spec delta deployed to openspec/specs/app-runtime-invalidation/
      with all scenarios mapped to contract tests; `ah check` clean.
