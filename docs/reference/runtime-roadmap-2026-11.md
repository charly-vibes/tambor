# Runtime & rendering roadmap — SolidJS lessons, distilled (2026-11)

Committed source-of-truth for the runtime improvement workstream. Distilled
from the 2026-11-20 external evaluation (corpus transcripts
`claude/a87f80ee` "Evaluating AI chat interface tools" + `chatgpt/6b00b858`
"Compare Chat Interfaces", incl. its change proposal), grounded and verified
against tambor @ `85d46ae` and amended by the rule-of-5 review round 1
(2026-11-21). The corpus transcripts are external evidence; this document is
the actionable artifact — tickets link here.

## Guiding verdicts (from the evaluation, repo-verified)

- Tambor is not a production chat UI today: no IME/soft-wrap, fixed-height
  virtual list, whole-tree rebuild per draw, a11y gaps. Strong: state/event
  model, verification infrastructure, identity-based caching.
- Adopt SolidJS's *payoffs* (work proportional to what changed, identity
  stability, batching, keyed lists, lifecycle ownership) **without its
  mechanisms** (signals, proxies, auto dep-tracking, VDOM, JSX). Ideas
  only, never a dependency.
- NOT-copy list (every capability proposal must restate as non-goals):
  signals as state model; automatic dependency tracking; mutable reactive
  state; virtual DOM as public abstraction; JSX requirement; implicit
  effects; Solid dependency.

## Workstreams → capabilities → tickets

| WS | Capability (openspec change) | Ticket | Lane | Depends on |
|----|------------------------------|--------|------|-----------|
| T1+T3 | `add-runtime-invalidation` (ChangeSet, App.subscribe, per-child identity reuse, whole-view short-circuit) | tambor-1cr | afk/L | tambor-bva |
| T3 | `add-frame-coalescing` (existing, 0/12) | tambor-bva | afk/M | — |
| T3 | `add-render-scheduler` | tambor-ry3 | design/M | tambor-bva |
| T2 | `add-keyed-dom-reconciliation` | tambor-ap8 | design/L | tambor-1cr |
| T4 | `add-resource-scopes` | tambor-9qo | design/M | — |
| T5 | `add-host-interoperability` | tambor-8yl | design/M | tambor-9qo |
| T5 | `add-runtime-inspector` | tambor-3mf | design/M | tambor-1cr, tambor-ry3 |

Boundary pinned by review round 1: M1 delivers **positional** identity
reuse (same position + same identity ⇒ splice DOM); keyed matching for
reorder/insert/remove is M2 (ap8) territory.

## Milestones & release gates

- **Milestone 1 — incremental rendering foundation**: frame coalescing
  (bva) + ChangeSet/conservative fallback + subscriptions + two-level
  identity checks + instrumentation. Acceptance: B0 passes, dispatch
  semantics intact, runtime can explain why a render was scheduled.
- **Milestone 2 — keyed DOM reconciliation** (ap8): only after M1.
- **Gate A** runtime reliability (scheduler, subscriptions, ChangeSet,
  effect ordering) — before integration.
- **Gate B** rendering reliability (keyed identity, focus preservation,
  DOM reconciliation, B3) — before chat adoption.
- **Gate C** lifecycle reliability (resource scopes, cancellation, B4) —
  before multi-workspace use.
- **Gate D** general integration readiness (DOM islands, docs, inspector,
  a11y) — before wider adoption.

## Benchmarks B0–B4 (conventions: benchmarks/findings-bz.md)

Environment: production bundle, pinned Chromium, CPU throttled ×4 primary,
15 runs × 12 ops + untimed warmup, medians/p25/p75/p90, provenance
(git commit + browser), raw JSON kept. Baseline recorded BEFORE
optimization lands.

- **B0 — dispatch & scheduling**: existing BZ1 harness + draw/derive
  counters; the state-equivalence contract is the correctness anchor.
- **B1 — ChangeSet & incremental invalidation**: known-path commits skip
  rebuilds; unknown falls back full.
- **B2 — DOM reconciliation**: keyed node identity, focus/selection
  preservation (M2).
- **B3 — large chat workload**: 1 streaming message in a 1,000-message
  history; DOM-mutation count must drop to the changed rows, not only
  wall-clock (M1 §3 evidence + BZ1 re-run).
- **B4 — lifecycle stress**: cancellation/disposal under load; no leaks
  (resource scopes).

Regression policy: hard correctness gates (contract tests, state
equivalence, no stale async commits, no DOM identity loss) never yield to
performance gates; improvements must reproduce; informational metrics (GC,
paint timing) reported, not gated, until stable.

## Grounding evidence (repo-verified @ 85d46ae)

- `src/render/dom.ts` draw(): `root.children.length = 0` then rebuild.
- viewCache (src/spa/mount.ts): state identity + container + scheme;
  whole-state granularity.
- memo ~0.1 µs identity hit vs 4.6–5.1 µs serialization key
  (src/components/memo/memo.ts).
- findings-bz.md: flat 83 ms/op re-derive+paint @ CPU×4; ≈98 ms unbatched
  vs 4.8 ms batched (≈20.4×).
- makeApp: one repaint per dispatch, lane-only batches skip
  (src/effects/dispatch.ts); phase-timers seam exists (tambor-54j.1).
- `add-frame-coalescing`: 12 unchecked tasks (tambor-bva).
