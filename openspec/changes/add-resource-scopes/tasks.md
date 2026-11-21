# Tasks: add-resource-scopes

## 1. Scope core

- [ ] 1.0 Red: unit test — `createScope()` + explicit
      `onCleanup(scope, fn)` + `dispose(scope)`: three callbacks run
      LIFO inside one synchronous dispose pass, each exactly once; a
      second dispose is a no-op.
- [ ] 1.1 Green: implement the scope core in a new `src/scopes/scope.ts`
      (plain-data scope, callback arrays, LIFO pass, idempotent).
- [ ] 1.2 Red→Green: nesting — `createScope(parent)`: parent dispose
      runs the child's callbacks depth-first before its own; a child
      disposes independently without affecting parent or siblings.
- [ ] 1.3 Red→Green: the first of two callbacks throws — the second
      still runs and the first error is re-thrown after the pass
      completes (isolation, never swallowed).
- [ ] 1.4 Red→Green: `onCleanup` on an already-disposed scope invokes
      the callback immediately (fail-safe registration, no silent
      leak).

## 2. Worker-boundary dispose (additive on client.ts)

- [ ] 2.0 Red: fake-WorkerLike test (spawn/terminate-counting seam
      from the worker_effect tests) — `dispose()` mid-flight resolves
      the in-flight run with the typed disposed failure; no stuck
      promise.
- [ ] 2.1 Green: implement additive `dispose()` in
      `src/components/worker_effect/client.ts` `liveClient` —
      terminate mechanics plus a permanent closed state and a stable
      `DISPOSED_MESSAGE` constant (TERMINATED_MESSAGE precedent,
      client.ts:62); the in-thread fallback's dispose is a no-op.
      (5.0's baseline MUST be recorded before this task starts.)
- [ ] 2.2 Red→Green: `run()` after dispose resolves the typed disposed
      failure with the spawn count unchanged (never respawns —
      contrast terminate's `w ?? respawn()` path, client.ts:221) and
      the handler never evaluated in-thread (contrast the
      load-failure degrade at client.ts:220).
- [ ] 2.3 Red→Green: terminate's contract unchanged — the existing
      components-worker_effect contract tests (lazy respawn, typed
      terminated failure, degrade_typed) stay green, plus an explicit
      assertion that dispose-then-run differs from terminate-then-run.
- [ ] 2.4 Red→Green: `dispose()` idempotency — a second dispose on an
      already-disposed Worker-backed client is a no-op (no worker
      action, later runs still resolve the typed disposed failure).
- [ ] 2.5 Red→Green: fallback carve-out — `dispose()` on the in-thread
      fallback client (`worker: false`) is a no-op and a later run
      still evaluates the handler in-thread (mirroring terminate's
      fallback contract).

## 3. Async envelope

- [ ] 3.0 Red: envelope mapping tests — transport
      `{id, ok: true, value}` → `{status: "ready", value}`;
      `{id, ok: false, message}` → `{status: "error", error}`;
      unsettled → `{status: "pending"}`; settled envelopes are frozen.
- [ ] 3.1 Green: implement the `AsyncResult` type + the scoped run
      helper (`runScoped`) in `src/scopes/` — consumes the existing
      WorkerEffectClient promise contract; the transport envelope in
      `src/components/worker_effect/envelope.ts` is untouched.
- [ ] 3.2 Red→Green: scope disposal before settle →
      `{status: "error", error: "disposed"}`; the helper retains
      nothing after settle.
- [ ] 3.3 Red→Green: a settled envelope reaches app state only through
      the existing dispatch (typed reply-effect flow) —
      effect-dispatch ordering tests stay green with a no-op scope
      attached.

## 4. Mount root scope (additive)

- [ ] 4.0 Red: `mountDemo` (`src/spa/mount.ts`) exposes the root scope
      and an additive `dispose()` on the handle; disposing the handle
      runs app-scoped registrations; mount behavior is otherwise
      unchanged.
- [ ] 4.1 Green: wire the root scope in `src/spa/mount.ts`; export from
      `src/index.ts` + `src/interop/index.ts` barrels (`src/core.ts`
      re-exports only).
- [ ] 4.2 Red→Green: double `dispose()` on the handle is a no-op,
      composes with prior explicit child-scope disposal (children-first
      ordering holds across the root), and the existing `unmount()`
      composes by disposing the root scope children-first — the demo
      switcher (`src/spa/main.ts:190`) and docs shell
      (`src/docs/main.ts:352-358`) call sites stop everything the
      mount started, with unmount's own teardown (root removed, focus
      surface cleared, debug handle cleared) unchanged.

## 5. Bench B4 — lifecycle stress

- [ ] 5.0 Register the B4 baseline scenario in the bench registry
      (tests/e2e/bench-scenarios-* pattern) and record the BASELINE
      before the mechanism lands — this task completes BEFORE task
      2.1. The baseline is the pre-mechanism terminate-churn/
      abandonment analogue on TODAY'S client: spawn/terminate churn
      plus abandoned never-stopped runs (no dispose exists yet), and
      the observations are the failure modes — stuck promises, live
      worker growth, pending-queue size. Record in
      `benchmarks/findings-b4.md` with findings-bz.md conventions
      (environment table, medians/p25/p75/p90, pinned commit + browser,
      raw JSON kept).
- [ ] 5.1 After §2–4 land: re-run B4 with the scoped-churn shape —
      N concurrent scoped worker runs, dispose mid-flight in waves,
      respawn churn — as the post-mechanism counterpart to 5.0's
      baseline. Hard gates: zero stuck promises, live worker count
      back to baseline after the final dispose, pending-queue size
      bounded during churn; informational (reported, not gated, per
      the regression policy): GC/memory timings. Honest verdict
      section comparing against 5.0's recorded baseline; the pinned
      state-equivalence contract green in both runs.

## 6. Gates

- [ ] 6.1 Full suite green (`just test-full`); `ah check --run-tests`
      green.
- [ ] 6.2 `openspec validate add-resource-scopes --strict` exits 0
      (both deltas).
- [ ] 6.3 On approval, spec deltas deployed:
      `app-resource-scopes` to `openspec/specs/app-resource-scopes/`
      with every scenario mapped to a contract test, and the
      components-worker_effect ADDED requirement appended per the
      corpus's authored-directly convention (tambor-41q); `ah check`
      clean.
