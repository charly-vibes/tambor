# Add runtime invalidation

## Why

The DOM backend rebuilds its entire element tree on every draw
(`src/render/dom.ts` `draw()`: `this.root.children.length = 0`), and the
route-time view cache (`src/spa/mount.ts`) only short-circuits at
whole-state granularity. Benchmarks/findings-bz.md pinned the cost: a
bounded log window re-derives + repaints at a flat 83 ms per cycle under
CPU ×4 regardless of how little changed, and unbatched dispatch costs
≈20.4× the batched shape. An external evaluation (2026-11-20, corpus
conversations claude/a87f80ee + chatgpt/6b00b858, grounded against
snapshot 85d46ae) identified identity-based invalidation as the
highest-payoff lesson from SolidJS that tambor can adopt without
signals, proxies, or mutable state: identity already changes exactly
when a slice changes (the memo boundary and render cache both rest on
it), so "what changed" can be known without dependency tracking.

## What Changes

- `App` gains an additive `subscribe(listener)` delivering an immutable
  `DispatchCommit { previousState, state, changes, sequence }` after
  each top-level dispatch; existing call sites compile unchanged.
- A `ChangeSet` type — `{ kind: "known", paths, changedIds }` or
  `{ kind: "unknown", reason }` — published on every commit. Built-in
  path edits report their paths; arbitrary handler functions report
  `unknown`. A ChangeSet is a rendering hint, never state authority;
  `unknown` triggers the conservative full derive (today's behavior).
- The DOM painter gains an identity short-circuit: when a derive yields
  a view identity-equal to the last drawn view, `draw()` skips the
  rebuild (`children.length = 0` + rebuild becomes a no-op for that
  frame). This is Solid's "work proportional to what changed", paid in
  identity, not signals.
- The mount's `wireDrawTail`/`wireRerender` paths consume the identity
  short-circuit so coalesced frames that derive to an unchanged view do
  not repaint at all.
- Opt-in draw/derive counters extend the existing phase-timers seam
  (tambor-54j.1) so B0-style benchmarks can attribute wins.

## Non-goals

- No signals, no automatic dependency tracking, no mutable reactive
  state, no virtual DOM as a public abstraction, no JSX requirement, no
  SolidJS dependency. Ideas only, per the 2026-11-20 evaluation.
- No keyed DOM reconciliation (separate capability, sequenced after
  this one — it consumes the ChangeSet contract).
- No scheduler ownership changes (add-render-scheduler, after
  add-frame-coalescing lands).

## Impact

- Affected specs: `app-runtime-invalidation` (new capability spec).
- Affected code: `src/core.ts` + `src/effects/dispatch.ts` (commit
  publication, subscribe), `src/render/dom.ts` (identity short-circuit),
  `src/spa/mount.ts` (view cache + wire paths), `src/interop/index.ts`
  (barrel export).
- Risk: a wrong identity short-circuit silently shows stale UI. The
  conservative rule is that ANY `unknown` ChangeSet, lane change, or
  overlay change forces a full rebuild; the short-circuit fires only on
  identity-equal derived views with no overlay and no lane movement.
- Benchmarks: extend findings-bz.md §BZ1 with a "1 streaming message in
  a 1,000-message history" scenario; acceptance requires the flat
  83 ms/op to drop measurably while the BZ1 state-equivalence contract
  stays green.
