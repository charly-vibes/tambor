# Add render scheduler

## Why

After add-frame-coalescing landed, the frame decision is split across two
scheduling authorities. The mount's coalescer
(`src/spa/mount.ts` `frameCoalescer`) owns the real paint — one
animation-frame callback per frame, latest draw closure wins, `flush()`,
`drop()`. But `makeApp` still runs its own scheduler
(`src/effects/dispatch.ts` `scheduleRepaint`): every top-level
state-effect dispatch — in every mode, mount or no mount — queues one
rAF callback that re-derives `appView(options, …)` in full, and no SPA
consumer reads the result (the mount draws from its own cached
`viewFor` path). A coalesced burst of N dispatches therefore pays N
discarded full derivations on the next frame plus the one coalesced
derive+draw — the bench arm built to show the naive shape
(`src/examples/bench/stream-dashboard.ts` `naivePump`: "the dispatcher
schedules its own repaint for it — one full re-derive … per message")
still measures that waste after coalescing. The headless wire
(`src/app/app.ts` `scheduleRepaint`) carries a third copy of the same
shape. Two authorities scheduling one frame is exactly the duplication
ticket tambor-ry3 (roadmap WS T3, `add-render-scheduler`, design/M,
depends on tambor-bva — complete) must reconcile: one host-owned
scheduling authority per wiring.

## What Changes

- `App` gains an additive post-construction scheduling seam —
  `installScheduler(schedule)` — through which `makeApp`'s
  exactly-one-repaint-per-dispatch contract is delivered to a host;
  absent an installation the default is byte-identical to today (rAF
  view-rebuild when `requestAnimationFrame` exists, nothing otherwise),
  so DOM-less consumers and the headless corpus stay unchanged.
- The SPA mount installs itself as the app's scheduler: its landed
  coalescer becomes the single scheduling authority — makeApp's repaint
  requests land in the SAME pending slot the routed event wire's paint
  tail uses (latest-wins), so a routed dispatch under the default
  coalesced mode queues exactly one animation-frame callback per frame
  and the N discarded bare re-derivations disappear.
- `wireRerender` becomes a drain of that authority instead of an
  independent draw site: a non-routed dispatch marks the pending frame
  (the request) and drains it synchronously — the same single
  synchronous draw as today, with the later frame callback finding the
  slot empty and no-oping (no double draw, no extra frame).
- `mode: "immediate"` keeps per-dispatch synchronous paints exactly as
  landed; the installed authority absorbs repaint requests as no-ops
  (every dispatch already painted synchronously by construction), so
  today's wasted rAF view-rebuilds disappear while the observable draw
  timeline is unchanged. The no-rAF fallback keeps the landed rule:
  synchronous draws, never a never-flush state.
- The headless wire adopts the same seam — its span-closing repaint
  becomes the installed scheduler, so the framework path's phase record
  closes on the one repaint instead of makeApp's span-less default
  derivation, and raw mode schedules through the same authority.
- The BZ1 naive arm is re-measured with the scheduler landed and
  findings-bz.md gains a follow-up note, mirroring the coalescing
  change's bench task.

## Non-goals

- No signals, no automatic dependency tracking, no mutable reactive
  state, no virtual DOM, no JSX requirement, no SolidJS dependency
  (NOT-copy list, per the 2026-11-20 evaluation).
- No scheduler loop stealing the frame budget: no cross-frame work
  splitting, priorities, or deferral of state application — effects
  keep applying synchronously in dispatch order, and the scheduler
  decides only when the paint callback runs.
- No worker scheduling, no new threading, no async repaint path.
- No change to effect semantics, ordering, the internal-dispatch
  no-repaint rule, or the lane-only no-repaint rule
  (interaction-lane lane_batch_no_repaint).
- No commit semantics: commits are add-runtime-invalidation's
  territory; this change deals in paints and repaint requests only and
  composes with that change's pins unchanged.
- No change to `mountSpa`/`mountDemo` options: the mode option and the
  custom-dispatch escape hatch from add-frame-coalescing stay as
  landed.

## Impact

- Affected specs: `app-render-scheduler` (new capability spec).
- Affected code: `src/effects/dispatch.ts` (makeApp: the installable
  scheduler slot behind `scheduleRepaint`), `src/spa/mount.ts` (the
  authority built on the landed `frameCoalescer`; `wireSurface`
  paint seam and `wireRerender` drain through it; installation after
  `create()`), `src/app/app.ts` (headless wire adopts the seam),
  `src/index.ts` + `src/interop/index.ts` (barrel export of the seam
  type; `src/core.ts` re-exports only), `src/examples/logo/logo.ts`
  (createLogoApp installs an absorbing scheduler — the logo demo's
  worker replies dispatch outside the wire).
- Affected tests: new fake-frame scheduler unit tests (the
  `stubFrames`/`pump` pattern from tests/spa-mount-coalesce.test.ts);
  the existing coalescing suite stays green unchanged; BZ1 scenarios
  re-run as regression.
- Benchmarks: `benchmarks/findings-bz.md` H2 verdict gains a second
  follow-up note recording the naive arm after the scheduler lands
  (the per-dispatch bare re-derivations are gone).
- Risk: a wrongly absorbed request leaves state unpainted. The
  conservative rules are that the request's standard closure always
  enters the pending slot (nothing is lost if no synchronous path
  follows), and `paintNow` drains synchronously exactly where today's
  code draws synchronously — the draw timeline per mode is pinned by
  tests, never widened.
