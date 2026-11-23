# Design: add-render-scheduler

## Ground truth (verified at e12a2f0)

- `makeAppDispatch` ends every top-level state-effect dispatch with
  `scheduleRepaint(() => appView(options, () => box.state))` — one rAF
  per dispatch in EVERY mode; empty batches return early, lane-only
  batches skip (interaction-lane lane_batch_no_repaint), internal
  dispatches never schedule (`src/effects/dispatch.ts`). In the SPA
  wiring the callback's derived Elem has no consumer: the mount draws
  through `wireDrawTail`/`wireRerender` from its own cached `viewFor`
  under `laneWrap`, so the per-dispatch derivation is discarded work.
- The landed `frameCoalescer` (`src/spa/mount.ts`) owns one pending
  draw closure and one `scheduled` flag: `paint` keeps only the latest
  closure, `flush` drains synchronously (the later frame callback sees
  the cleared flag and no-ops), `drop` kills post-unmount frames.
- `wireSurface`'s paint seam is `(paint ?? sync)(tail)` — the
  "immediate" mode and no-rAF hosts pass no painter and draw
  synchronously; `wireRerender` draws synchronously on every non-routed
  dispatch in BOTH modes (tests/spa-mount-coalesce.test.ts pins the
  "synchronous rerender draw stays out of every count" timing).
- The headless wire (`src/app/app.ts`) adds its own rAF on top of
  makeApp's default: the framework path rides makeApp's span-less
  default derivation, raw mode queues a second rAF whose derive span
  closes the phase record (`finishDraw`).
- jsdom ships an async rAF (pretendToBeVisual) — every fake-frame test
  stubs rAF explicitly (the `stubFrames`/`pump` pattern in
  tests/spa-mount-coalesce.test.ts).

## Goals / Non-Goals

- Goals: one animation-frame callback owner per wiring; makeApp's
  repaint contract preserved as a *request*; the landed coalescer
  extended, not re-wrapped; per-mode draw timelines unchanged;
  the discarded bare re-derivations gone from the mounted path.
- Non-Goals: no signals or dependency tracking; no cross-frame work
  splitting, priorities, or scheduler loops competing with the frame
  budget; no worker scheduling; no change to effect application
  semantics, ordering, or commit shape; no new mount options.

## Decisions

1. **The host owns the frame decision; makeApp emits requests.**
   `makeApp` keeps emitting exactly one repaint per top-level
   state-effect dispatch (the effect-dispatch `single_repaint` shape,
   lane-only and empty batches excluded) but delivers it through an
   installable scheduler instead of hard-wiring `globalThis.rAF`. The
   scheduler change does not touch the effect-dispatch corpus spec:
   the invariant that survives is "exactly one repaint request per
   dispatch"; what a request *does* — and when it fires — is the
   installing host's decision. The frame decision belongs where the
   draw lives (the same reasoning as add-frame-coalescing D1, one
   layer up): the mount knows the lane wrap, the view cache, the
   backend; makeApp is DOM-free and cannot know what a repaint costs.

2. **One seam: `App.installScheduler(schedule)` post-construction.**
   The mount receives `create: () => App` — the app object is built by
   the caller, so the host can only install after construction. The
   handle gains an additive `installScheduler(schedule)` making the
   dispatch tail call `schedule(closure)`; absent installation the
   default is today's exact behavior (rAF the bare `appView`
   re-derivation when rAF exists, nothing otherwise). Precedent:
   `wireRerender` already replaces `app.dispatch` on the handle
   post-construction. No `AppOptions.schedule` is added — one
   mechanism, not two.

   *Alternative:* dedupe rAF callbacks inside makeApp's own
   `scheduleRepaint`. Rejected: it recreates a second scheduling
   authority one layer below the mount's (the duplication this change
   removes), with no opt-out granularity and no knowledge of the
   draw-side cost.

3. **The authority extends the landed coalescer — same instance, same
   slot, no wrapper.** The mount builds one authority object over the
   existing `frameCoalescer` with three verbs, and installs itself via
   the seam:
   - `request()` — makeApp's signal. Paints the authority's standard
     closure (`drawWire(backend, app, wrap, viewFor())`) into the
     coalescer's pending slot: the state is marked dirty and the frame
     is scheduled if none is. The request carries the makeApp closure
     but the authority owns the work — the bare `appView` derivation
     bypasses the view cache and the lane wrap, content the mount must
     control.
   - `paint(draw)` — the routed event wire's tail (today's `paint`
     seam parameter): latest-wins into the same slot, left to the
     frame. Ordering is already correct: the request lands inside
     `app.dispatch`, the wire's tail lands after the dispatch returns,
     so the tail closure supersedes and one frame runs one draw.
   - `paintNow(draw)` — `paint` followed immediately by `flush`: the
     slot drains synchronously and the queued callback later no-ops
     (the landed flush contract).
   No second pending mechanism, no second rAF call site: the coalescer
   remains the single owner of animation-frame callbacks, its
   `flush`/`drop` semantics reused verbatim.

4. **Flush semantics stay owned by the coalescer; `wireRerender`
   becomes a drain of the authority.** Today a non-routed dispatch
   draws synchronously via `wireRerender` AND makeApp queues a wasted
   bare derivation. Under the authority: the request marks the slot
   during dispatch, `wireRerender` calls `paintNow(tail closure)` —
   one synchronous draw, exactly today's timing and content — and the
   frame callback finds the slot empty. Without this, a naive "request
   becomes a draw" would double-draw every non-routed dispatch.
   `handle.flush()` keeps its landed meaning (drain the pending
   frame; no-op in immediate mode and the no-rAF fallback).

   *Alternative:* stop drawing synchronously on non-routed dispatches
   and let them ride the frame. Rejected: it changes landed
   read-your-writes timing the e2e rig relies on
   (tests/spa-mount-coalesce.test.ts), outside this ticket's scope.

5. **"immediate" mode and the no-rAF fallback get an absorbing
   authority.** In "immediate" mode every dispatch already paints
   synchronously by construction (routed → the sync paint seam,
   non-routed → the drain), so the mounted authority absorbs
   `request()` as a no-op and runs `paint`/`paintNow` synchronously;
   `flush()` is a no-op. The absorbed requests delete today's wasted
   rAF view-rebuilds while the observable draw timeline is unchanged —
   the bare derivation was never observable in output, only in cost.
   Where rAF is missing, the coalescer is not constructed (landed
   rule) and the absorbing authority is installed instead: synchronous
   draws, never a never-flush state (add-frame-coalescing D2
   preserved). The mount installs exactly one authority per mount,
   always — `installScheduler` is a REQUIRED App interface member, so
   every app carries the seam and the authority shape, not the mode
   branch, is the seam.

6. **The headless wire adopts the same seam.** `makeHeadlessApp`
   installs its span-closing repaint as the scheduler and routes raw
   mode through the same authority, so the framework path's phase
   record closes on the one repaint instead of makeApp's span-less
   default derivation (today the record-closing `finishDraw` runs only
   on the raw path) and no wiring queues two rAFs per event. One
   authority per wiring is the invariant; the headless body of the
   request (derive span + `finishDraw`) is its own.

7. **Requests are signals, never work contracts.** The installed
   scheduler may ignore the makeApp closure (the mount's authority
   does). The default keeps using it so DOM-less consumers — bare
   makeApp in unit tests, corpus scaffolds — are byte-identical to
   today. This keeps the effect-dispatch spec's `p_repaint`
   observation ("exactly one repaint is scheduled") true at the app
   level in every wiring.

## Pins (review round 1)

- At most one queued animation-frame callback exists per frame per
  mount: requests, wire tails, and rerender drains all land in the
  coalescer's single pending slot; a test counts the host rAF stub's
  queue, not just draws.
- The per-mode draw timeline is pinned, never widened: coalesced
  routed burst = one draw per frame; immediate = one synchronous draw
  per dispatch; non-routed dispatch = exactly one synchronous draw in
  both modes with the later frame callback no-oping.
- Empty batches, lane-only batches, and internal dispatches emit no
  repaint request — the existing skips happen before the seam.
- `flush` is idempotent and drains exactly once; a flush racing a
  fresh dispatch never double-draws (the landed D2 risk pin, inherited
  verbatim).
- Unmount drops pending work: post-unmount frames never re-derive into
  the detached tree (the landed `drop` contract, now covering
  request-dirtied frames too).
- Paints and requests only — never commits: N dispatches in one frame
  produce N dispatch applications; commit publication is
  add-runtime-invalidation's territory and composes with this change's
  one-build-or-skip-per-frame unchanged.
- The default path (no installed scheduler) is frozen: one rAF bare
  `appView` re-derivation per state dispatch when rAF exists, nothing
  when it does not — any observable change there is a bug.

## Test shape (inputs/outputs pinned first)

- Fake-frame scheduler tests throughout (the
  `stubFrames`/`pump` pattern from tests/spa-mount-coalesce.test.ts):
  the rAF stub queues callbacks, the test pumps exactly one frame
  between dispatch and assertion, and the assertion counts BOTH the
  queued callback list length and the backend `drawCount`.
- Input: 80 routed dispatches inside one fake frame under the
  coalesced mount; output: queue length 1, one draw after the pump,
  state equal to 80 sequential applications.
- Input: a non-routed `app.dispatch` under the coalesced mount;
  output: `drawCount` 1 immediately, queue length 1, still 1 after the
  pump (the callback no-ops on the empty slot).
- Input: 80 dispatches in "immediate" mode; output: 80 synchronous
  draws, queue length 0, `flush()` a no-op.
- Input: bare makeApp with no installation (rAF stubbed and not);
  output: one queued callback per state dispatch deriving `appView`
  once when pumped; zero callbacks and applied state without rAF.

## Alternatives rejected

- In-core rAF dedupe inside `scheduleRepaint`: rejected — a second
  authority below the mount's, no opt-out granularity (Decision 2).
- Silencing makeApp's repaint by replacing `app.dispatch` at the
  mount: rejected — dispatch-repaint is the public contract other
  consumers rely on (worker-effect replies ride "the SAME dispatch the
  effect system already repaints on"); the seam delivers the request
  instead of deleting it.
- Requests become draws without the rerender drain: rejected —
  double-draws every non-routed dispatch (Decision 4).
- Deferring non-routed dispatches to the frame in coalesced mode:
  rejected — changes landed read-your-writes timing (Decision 4).
- Solid-style scheduler loop (microtask batching, priority lanes,
  cross-frame work splitting) or worker scheduling: rejected —
  NOT-copy list; the state-equivalence contract rests on synchronous
  in-order application, and the frame budget stays owned by the one
  frame callback.
