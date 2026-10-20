# Add frame coalescing

## Why

BZ1 (benchmarks/findings-bz.md) measured a ~20.4× gap between the naive
per-message wiring (80 dispatches → 80 full derive+draw passes, 7 812 ms/op
median at CPU ×4) and the frame-coalesced wiring (1 dispatch/op, 383 ms).
The existing rAF guard only defers repaints; it does not dedupe them —
80 queued repaint callbacks each re-derive (H2 verdict: "the guard defers,
it does not coalesce"). Today every app must opt in by restructuring its
own wiring; a user who does not opt in hits the 7.8 s path silently.
The measured win is dispatch-shape, not language-bound, and both modes
leave identical state (pinned contract tests/bench-stream-dashboard.test.ts),
so coalescing at the mount boundary is safe.

## What Changes

- `mountSpa` gains a default frame-coalescing dispatch layer: multiple
  dispatches arriving within one animation frame apply their effects in
  order against the state immediately, but schedule at most one
  derive+draw for that frame.
- An opt-out (`immediate` dispatch mode on the handle / mount options)
  preserves the current per-dispatch repaint for latency-critical apps,
  and the existing custom-dispatch escape hatch is untouched.
- The default flips the naive BZ1 wiring from ~7.8 s/op to ~383 ms/op
  without changing app code; the pinned BZ1 state-equivalence contract
  must stay green in both modes.

## Impact

- Affected specs: `app-frame-coalescing` (new capability spec).
- Affected code: `src/spa/mount.ts` (dispatch wrapper), `src/spa/main.ts`
  (option plumbing), `src/effects/dispatch.ts` (repaint scheduling seam,
  read-only integration).
- Affected tests: BZ1 stream scenarios re-run as regression; new unit
  tests for coalesce/dedupe/opt-out; e2e smoke stays green.
- Benchmarks: `benchmarks/findings-bz.md` H2 verdict gains a follow-up
  note when the default lands.
