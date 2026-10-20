# Design: add-frame-coalescing

## Context

`makeApp` wraps every dispatch: effects apply in order, then
`scheduleRepaint` queues one rAF callback per dispatch call
(src/effects/dispatch.ts). Under a burst (80 ws messages → 80 dispatch
calls) the rAF guard defers each repaint to a separate frame but never
dedupes, so the wire pays N full derive+draw passes. The BZ1 contract
proves burst-application and sequential application converge to the
same state, so batching the *paint* — not the state application — is
the sound boundary.

## Goals / Non-Goals

- Goals: one derive+draw per animation frame by default; state always
  applied synchronously in dispatch order; a documented opt-out.
- Non-Goals: no change to effect semantics, ordering, or the
  internal-dispatch no-repaint rule; no worker/async scheduling; no
  change to `makeApp`'s core (the coalescing lives at the SPA mount
  boundary, above the app object).

## Decisions

### D1. Coalesce at mountSpa, not in makeApp

`makeApp` is the DOM-free core and its custom `dispatch` option is a
public extension seam (tests, undo, external stores). Mounting the
coalescer in `mountSpa`'s wrapper keeps the core primitive and lets the
DOM backend decide paint policy — the same reason the canvas layer
stays a component.

*Alternative considered:* dedupe rAF callbacks inside
`scheduleRepaint`. Rejected: it would change repaint semantics for every
backend and the core's "exactly one repaint" contract, with no opt-out
granularity.

### D2. Apply-immediate, paint-deferred

Dispatches apply effects synchronously (ordering and handler
re-entrancy unchanged — pinned contract stays valid); only the
derive+draw is coalesced to the next frame. A trailing rAF flush covers
the final frame so no state change is left unpainted.

Two timing guarantees the deferral needs explicitly:

- **flush()**: the SPA handle exposes a synchronous flush of the
  pending frame. Today the mount wrapper draws synchronously per
  dispatch (BZ1's "80 synchronous full draws"), so tests and e2e
  helpers that read the DOM right after a dispatch rely on that
  timing — `clickDrawnText` already races it. Helpers get updated to
  flush or await visibility (see ticket tambor-4h6, same root cause).
- **No-rAF fallback**: where `requestAnimationFrame` is unavailable
  (jsdom, server render), the coalescer flushes synchronously instead
  of silently never painting — the current path has the same hole, but
  the coalescer must not add a never-flush state.

### D3. Opt-out shape

`mountSpa`/`mountDemo` currently take no options object — the change
adds one carrying the mode (`coalesce: false` restores today's
behavior); the SPA handle exposes the active mode for tests.
Custom `dispatch` already bypasses everything and stays untouched.

## Risks / Trade-offs

- [Coalescing hides intermediate frames] → latency-critical apps opt
  out; e2e smoke asserts no regression on interactive demos.
- [Deferred paint breaks DOM read-after-dispatch] → `flush()` on the
  handle plus e2e helper updates; pinned by a test asserting a flush
  forces the pending draw exactly once.
- [Trailing flush could double-draw with the guard's own rAF] → the
  coalescer owns the single scheduling call; unit test pins exactly one
  draw per frame even when both a flush and a fresh dispatch race.
