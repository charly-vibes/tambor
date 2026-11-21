# Design: add-resource-scopes

## Ground truth (verified against the worktree)

- The worker-effect client's only stop is the OPTIONAL terminate:
  interface doc `src/components/worker_effect/client.ts:55-58`
  ("in-flight runs resolve as the typed terminated failure and the
  NEXT run respawns a fresh worker. A no-op on the in-thread
  fallback."); implementation `client.ts:225-231` — `live.terminate()`,
  `pending.failAll(TERMINATED_MESSAGE)`, `w = null`.
- Lazy respawn is deliberate: the closure at `client.ts:211-216` carries
  the comment "a terminated worker respawns lazily: the boundary stays
  usable", and run() takes `w ?? respawn()` at `client.ts:221`.
  Terminate is a mid-life stop — usability is its feature and the
  wrong shape for teardown.
- The `dead` flag (load failure) routes run() to the IN-THREAD
  fallback: `client.ts:220` `if (dead) return fallback.run(...)`.
  Degrading to the fallback runs the compute — the opposite of
  cancellation — so `dead` cannot serve disposal.
- The pending queue answers every in-flight request as a typed failure
  and clears itself (`failAll`, `client.ts:169-172`); the same
  mechanism already serves terminate and load failure. Disposal reuses
  it.
- Unroutable async answers are dropped inertly: reply guard
  `client.ts:77-78` ("a reply with NO numeric id (nothing to route by)
  is dropped inertly"), id check `client.ts:84`, drop at the delivery
  site `client.ts:99`. Ownership has no representation anywhere in the
  module — nothing tracks who a run belongs to or when it should stop.
- No scope/lifecycle module exists under `src/`. The mount
  (`src/spa/mount.ts`) owns wiring and already exposes a teardown
  seam: `unmount()` (`mount.ts:89`, implemented at `mount.ts:524-530`)
  removes the root element, clears the focus surface, and clears the
  debug handle; its callers are the demo switcher
  (`src/spa/main.ts:190`) and the docs shell
  (`src/docs/main.ts:352-358`). But unmount touches only mount
  plumbing — nothing stops scopes, callbacks, or worker boundaries an
  app started, so teardown still has no owner of last resort.

## Decisions

1. **Explicit scopes, no ambient owner.** `onCleanup(scope, fn)` takes
   the scope as an argument. Alternative: Solid's `getOwner()`
   current-owner stack — rejected: that is exactly the global mutable
   registry the NOT-copy list forbids, and it makes a callback's
   lifetime depend on call-time context instead of a visible
   registration site. Explicit scope arguments keep the plain-data
   discipline and make the registration site own the lifetime choice.
2. **Creator owns disposal; the mount owns the root.** Whoever creates
   a scope disposes it or hands it to exactly one owner.
   Nesting (`createScope(parent)`) registers the child on the parent;
   dispose is depth-first — children before the parent's own
   callbacks, LIFO within each scope — so a callback never runs after
   a resource it depends on is gone. The root scope: `mountDemo`
   (`src/spa/mount.ts`) creates one per mount and exposes `dispose()`
   additively on the handle, the owner of last resort; the existing
   `unmount()` composes by disposing the root scope children-first, so
   its existing call sites (the demo switcher at `src/spa/main.ts:190`
   and the docs shell at `src/docs/main.ts:352-358`) stop everything
   the mount started. (`mountSpa` in `src/spa/todo-spa.ts` inherits
   the seam via delegation to the shared mount plumbing.) Alternatives: GC/finalizers — rejected,
   disposal must be deterministic; a centralized finalizer registry —
   rejected (global mutable registry).
3. **Disposal is one synchronous pass with isolated failures.**
   Callbacks run inside the dispose call (no microtask deferral —
   determinism over scheduling cleverness). A throwing callback does
   not stop the pass: remaining callbacks run, the first error is
   re-thrown after the pass completes — the same isolation shape
   add-runtime-invalidation pins for subscriber delivery. Dispose is
   idempotent; registering on an already-disposed scope invokes the
   callback immediately, because the alternative (silently keep the
   registration) leaks the resource — the exact failure this
   capability exists to prevent.
4. **Worker-boundary disposal is a new `dispose()`, not terminate
   reuse.** Two reasons grounded in the file. (a) Terminate's contract
   IS lazy respawn (`client.ts:55-58`, `211-216`, `230`): after
   dispose, a stale spawn effect taking `w ?? respawn()`
   (`client.ts:221`) would silently bring a worker back — finality
   cannot ride a mechanism whose spec'd behavior is resurrection. (b)
   The `dead` flag cannot be reused either: dead degrades to the
   in-thread fallback (`client.ts:220`), which would RUN the compute
   on the host thread — the opposite of cancellation. So `dispose()` =
   terminate's mechanics plus a distinct permanently-closed state:
   in-flight runs answered with the typed `disposed` failure (the
   `failAll` precedent, `client.ts:169-172`), later runs resolve the
   same typed failure — no respawn, no fallback. Additive on the same
   closure in `liveClient`; terminate untouched. The in-thread
   fallback client's dispose is a no-op (nothing is left running —
   mirroring terminate's no-op there, `client.ts:55-58`).
5. **The async envelope is a computation view, not new transport.**
   `AsyncResult` discriminates on `status`:
   `{ status: "pending" } | { status: "ready", value } |
   { status: "error", error }` — the createResource shape, plain and
   frozen on settle. The transport envelope
   (`{id, ok, value | message}`, the typed_envelope invariant) is
   unchanged; ok:true maps to ready, ok:false to error, no settle yet
   to pending. `error` is a string: every typed failure today is a
   string message (TERMINATED/LOAD/MALFORMED,
   `client.ts:62/65/70`). Alternatives: resolve-only promises —
   rejected, a disposed run would have no observable view (stuck
   pending is the leak this change removes); Solid's resource object —
   rejected, a reactive cell implies signals underneath, on the
   NOT-copy list; we adopt the data shape only.
6. **Composition without dependency.** The roadmap gives this change
   no depends-on (workstreams table, T4 row: `—`), so the design must
   not require add-frame-coalescing or add-runtime-invalidation.
   Scopes never schedule repaints and never touch the DOM backend: the
   observable effect of disposal on app state arrives as ordinary
   dispatch — the envelope settles, the app merges it through the
   existing typed reply-effect flow (components.worker_effect
   spawn_reply_effects). If add-frame-coalescing lands, a disposal
   mid-frame is just another dispatch in the batch. If
   add-runtime-invalidation lands, disposal-triggered commits ride the
   ChangeSet and identity checks like any commit, and an
   unknown-ChangeSet frame still forces the conservative full rebuild.
   Neither capability is referenced by this change's spec.
7. **Typed test seam.** The fake WorkerLike the worker_effect tests
   already use records spawn/terminate counts; scope tests add a leak
   probe (settled promises, pending-queue size, live worker count).
   Bench B4 rides the same probes under load instead of inventing a
   second instrumentation.

## Pins

- `dispose()` on an already-disposed client resolves further runs with
  the typed `disposed` failure via a stable message constant
  (TERMINATED_MESSAGE precedent, `client.ts:62`).
- Callbacks registered on a disposed scope run synchronously at
  registration.
- An onCleanup callback may dispose a child scope (nested pass); a
  callback disposing its own still-running scope is a pin violation
  caught by test, not undefined behavior to exploit.
- Bounded memory: dispose clears the callback arrays; a disposed scope
  retains nothing.
- The mount handle's `dispose()` is idempotent, and `unmount()`
  composes by disposing the root scope children-first — a handle
  dispose followed by unmount (or two unmounts) never re-runs a
  callback.
- The pending envelope is created per run and owned by the caller once
  settled — the helper retains nothing.

## Test shape (inputs/outputs pinned first)

- Input: fake WorkerLike recording spawn/terminate counts; one scoped
  run disposed mid-flight. Output: the run's promise settles
  `{status: "error", error: "disposed"}`; a run after dispose settles
  the same way with the spawn count unchanged and no in-thread handler
  evaluation.
- Input: nested scopes a→b→c, callbacks recording their order, first
  callback throws. Output: c's callbacks, then b's, then a's, LIFO
  within each scope; the second callback still runs; the first error
  re-thrown after the pass.
- Input: the envelope mapping table over the three transport reply
  shapes. Output: ready/error/pending mapping; settled envelopes are
  frozen.

## Alternatives rejected

- Ambient owner stack (Solid getOwner): a global mutable registry —
  NOT-copy list; cleanup would depend on call-time context.
- Dispose via terminate alone: the respawn hazard (`client.ts:221`) —
  terminate's spec'd contract (lazy respawn, stays usable) contradicts
  finality.
- Dispose via the `dead` flag: dead degrades to the in-thread fallback
  (`client.ts:220`) and would run the disposed work on the host thread.
- AbortController-style per-run signals: couples every caller to
  cancellation plumbing for what is one owned boundary; the scope
  already answers "who stops this".
