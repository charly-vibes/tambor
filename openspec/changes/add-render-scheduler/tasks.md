# Tasks: add-render-scheduler

## 1. Scheduling seam (src/effects/dispatch.ts)

- [ ] 1.0 Red: tests/render-scheduler.test.ts (fake-frame pump, the
      stubFrames/pump pattern from tests/spa-mount-coalesce.test.ts) —
      a bare makeApp queues exactly one rAF callback per top-level
      state-effect dispatch (pump → one `appView` re-derivation), zero
      callbacks on a no-rAF host with state still applied, and none
      for empty or lane-only batches.
- [ ] 1.1 Green: make the dispatch tail's scheduler installable —
      `App.installScheduler(schedule)` with an additive seam type;
      absent installation the default stays byte-identical
      (`scheduleRepaint(() => appView(options, () => box.state))` when
      rAF exists, nothing otherwise).
- [ ] 1.2 Red→Green: an installed scheduler receives exactly one
      request per state dispatch and makeApp queues NO rAF of its own
      (the frame stub's queue stays empty); a null/absent host rAF
      with a scheduler installed still delivers requests.
- [ ] 1.3 Red→Green: export the seam type from src/index.ts +
      src/interop/index.ts barrels (src/core.ts re-exports only) —
      the pinned effect-dispatch suite (tests/effect-dispatch.test.ts,
      p_repaint) stays green unchanged.

## 2. Mount installs the authority (src/spa/mount.ts)

- [ ] 2.0 Red: the coalesced mount, 80 routed dispatches inside one
      fake frame → the rAF stub's queue holds exactly ONE callback
      (today: one coalesced paint + N bare makeApp rebuilds) and the
      backend draws exactly once after the pump, state equal to 80
      sequential applications.
- [ ] 2.1 Green: build the authority over the existing frameCoalescer
      (request = standard drawWire closure into the pending slot;
      paint = today's tail; flush/drop reused verbatim) and install it
      after create() — no second pending mechanism, no second rAF call
      site.
- [ ] 2.2 Red→Green: request/tail dedupe — the frame runs one draw
      closure (the wire's tail supersedes the request's standard
      closure); a lane-only batch emits no request while the wire's
      lane draw still paints the cached tree under the transform.
- [ ] 2.3 Red→Green: "immediate" mode — 80 dispatches → 80 synchronous
      draws, zero queued callbacks, flush() a no-op (the existing
      add-frame-coalescing opt-out suite stays green unchanged). A
      comment-only touch-up of tests/spa-mount-coalesce.test.ts:212-215
      is permitted (the "still queues callbacks in immediate mode"
      comment goes stale under absorption); assertions untouched.
- [ ] 2.4 Red→Green: no-rAF host — red side pins the installation
      shape (the absorbing authority is installed instead of the
      coalescer), flush() as a no-op, and the synchronous draw timing;
      synchronous draws, never a never-flush state (D2 rule preserved).
- [ ] 2.5 Red→Green: createLogoApp
      (src/examples/logo/logo.ts) gains an absorbing installScheduler
      — the logo demo mounts its hand-built App and its worker replies
      dispatch outside the wire, so like immediate mode the requests
      are no-ops (every dispatch already paints synchronously) and the
      outside-the-wire dispatches stop re-deriving on a later frame.

## 3. Rerender drain + flush/unmount determinism

- [ ] 3.0 Red: a non-routed app.dispatch under the coalesced mount →
      drawCount 1 synchronously at dispatch time, the queued callback
      performs no draw after the pump (today: a synchronous draw PLUS
      a wasted bare re-derivation next frame).
- [ ] 3.1 Green: wireRerender drains the authority — paintNow (paint
      into the slot + immediate flush) replaces the direct drawWire
      call; the landed synchronous rerender timing is pinned by
      tests/spa-mount-coalesce.test.ts staying green.
- [ ] 3.2 Red→Green: flush determinism — a frame dirtied by request +
      tail drains exactly one draw on flush and the pumped callback
      no-ops; flush after a drain is a no-op (idempotent).
- [ ] 3.3 Red→Green: unmount with a request-dirtied pending frame —
      drop() discards it; pumping afterwards derives and draws nothing
      into the detached tree.

## 4. Headless adoption + bench

- [ ] 4.0 Red→Green: makeHeadlessApp installs its span-closing repaint
      as the scheduler and routes raw mode through it — one callback
      per send in both the framework and raw paths, the phase record
      closes on the framework path's repaint (finishDraw), and no
      wiring queues two rAFs per event (fake-frame test, phase timers
      on).
- [ ] 4.1 Re-run the BZ1 stream scenarios: the naive arm's
      per-dispatch bare re-derivations are gone under the coalesced
      mount; record honest numbers and append the second follow-up
      note to the H2 verdict in benchmarks/findings-bz.md; the pinned
      state-equivalence contract (tests/bench-stream-dashboard.test.ts)
      stays green in both modes.

## 5. Gates

- [ ] 5.1 Full suite green (`just test-full`); `ah check --run-tests`
      green; e2e bench smoke green in a real browser.
- [ ] 5.2 Spec delta deployed to openspec/specs/app-render-scheduler/
      with every scenario mapped to a contract test (the fake-frame
      scheduler tests); `ah check` clean;
      `openspec validate add-render-scheduler --strict` before
      approval.
