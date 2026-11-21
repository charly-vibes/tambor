# Add resource scopes

## Why

Lifecycle ownership is the SolidJS payoff the roadmap pins for adoption
("lifecycle ownership" without its mechanisms — runtime roadmap,
Guiding verdicts) and the one tambor has no home for: cleanup today is
by-convention only. The worker-effect boundary's only stop is the
OPTIONAL terminate (`src/components/worker_effect/client.ts:55-58`),
and it is deliberately a mid-life operation — in-flight runs resolve
typed failures and the NEXT run lazily respawns so the boundary "stays
usable" (`client.ts:211-216`, `client.ts:230`). That is the wrong
primitive for teardown: nobody owns "this feature is gone, stop
everything", so a finished view either never stops (worker keeps
running, the pending queue grows) or stops and then leaks again — any
stale spawn effect after a terminate takes `w ?? respawn()`
(`client.ts:221`) and silently brings a worker back. Unowned async
answers have no concept of an owner at all: a reply with no numeric id
is dropped inertly (`client.ts:77-78`, id check `client.ts:84`, drop
at the delivery site `client.ts:99`) — correct for transport, but the
computation level has no counterpart of "the owner went away". The
roadmap makes this Gate C (lifecycle reliability: resource scopes,
cancellation, B4) before multi-workspace use, and bench B4 pins the
concern — "cancellation/disposal under load; no leaks". No leak is
measured yet; B4's baseline-before-optimization rule exists precisely
so the cost is pinned before the mechanism lands.

## What Changes

- A `Scope`: plain-data collector of disposal callbacks with
  `createScope()`, explicit-scope `onCleanup(scope, fn)` registration,
  and an idempotent `dispose(scope)` running callbacks LIFO in one
  synchronous pass. The scope argument is explicit — no ambient
  current-owner global.
- Scope nesting: `createScope(parent)`. Disposing a parent disposes
  child scopes first (depth-first), then its own callbacks; a child
  disposes independently without touching parent or siblings;
  registering on an already-disposed scope invokes the callback
  immediately (fail-safe, never a silent leak).
- The worker-effect client gains an additive `dispose()` alongside
  `terminate()`: dispose terminates the live worker, answers in-flight
  runs with a typed `disposed` failure, and closes the boundary
  permanently — later runs resolve the same typed failure without
  respawning a worker and without degrading to the in-thread fallback.
  `terminate()` keeps its exact contract (lazy respawn, boundary stays
  usable); the existing optional_terminate invariant is untouched.
- An async computation envelope generalized to the createResource
  shape: plain data `{ status: "pending" }` until it settles to
  `{ status: "ready", value }` or `{ status: "error", error }`. It is
  the computation-level view over the existing per-request transport
  envelope (`{id, ok, value | message}`), which is unchanged. A scoped
  run helper resolves the envelope; scope disposal before completion
  settles it to `error: "disposed"` — never a stuck pending.
- `mountDemo` (`src/spa/mount.ts`) gains a root scope owned by the
  mount and an additive `dispose()` on the handle — the owner of last
  resort for app-level teardown. The existing `unmount()` composes by
  disposing the root scope children-first, so its current call sites
  (demo switcher, docs shell) stop everything the mount started.
  (`mountSpa` in `src/spa/todo-spa.ts` inherits the seam via
  delegation.)
- Bench B4 (lifecycle stress) is registered with its baseline recorded
  BEFORE the mechanism lands (findings-bz.md conventions): the
  baseline is the terminate-churn/abandonment analogue on today's
  client — spawn/terminate churn plus abandoned never-stopped runs
  (stuck promises, worker growth, pending-queue size). After landing,
  B4 re-runs with the scoped dispose-mid-flight churn: zero stuck
  promises, spawn count back to baseline, pending queues bounded.

## Non-goals

- No signals, no automatic dependency tracking, no mutable reactive
  state, no virtual DOM as a public abstraction, no JSX requirement,
  no implicit effects, no Solid dependency — the roadmap's NOT-copy
  list, restated in full. No proxies either: scopes hold plain arrays
  of callbacks, nothing is intercepted.
- No global mutable registry: scopes are passed explicitly; no ambient
  "current scope" stack (that is the mechanism side of Solid's
  ownership, not the payoff).
- No new scheduling: disposal and envelope settlement reach app state
  only through the existing dispatch; scopes never schedule repaints
  and never call the DOM backend directly.
- No host-interop content — that is tambor-8yl
  (add-host-interop), sequenced to depend on this change
  (tambor-9qo), not part of it.
- No cancellation of arbitrary host-thread work beyond owned
  worker-effect boundaries, and no timer/interval API — timers ride
  `onCleanup` generically like any callback.

## Impact

- Affected specs: `app-resource-scopes` (new capability spec);
  `components-worker_effect` (ADDED-only delta: the permanent dispose
  requirement — optional_terminate and degrade_typed are untouched and
  re-tested).
- Affected code: new `src/scopes/` module (scope core + async
  envelope); `src/components/worker_effect/client.ts` (additive
  `dispose()` and disposed routing on the existing closure — additive
  on the dead-flag/pending-queue seam, not a rewrite); `src/spa/mount.ts`
  (root scope + handle dispose, additive); barrels `src/index.ts` +
  `src/interop/index.ts` (`src/core.ts` re-exports only).
- Risk: disposal ordering bugs free resources in the wrong order —
  mitigated by children-first, LIFO, one synchronous pass, all
  contract-tested. A disposed boundary that silently resumed work
  would defeat the capability — mitigated by the typed-failure rule
  (never respawn, never in-thread; the load-failure path at
  `client.ts:220` intentionally degrades to in-thread, so disposal
  gets its own state rather than reusing `dead`).
- Benchmarks: B4 baseline first (regression policy: baseline recorded
  BEFORE optimization lands), then a post-landing verdict in
  `benchmarks/findings-b4.md` with findings-bz.md conventions.
