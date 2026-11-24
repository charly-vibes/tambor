# Add runtime inspector

## Why

The runtime is opaque to its own consumers. add-runtime-invalidation
LANDED the commit stream — one frozen `DispatchCommit` per top-level
dispatch, delivered through `App.subscribe` in registration order —
but a stream is not an explanation: nothing retains it (the dispatcher
keeps no history, by the landed bounded-memory pin), nothing groups it
into frames, and nothing says why a frame drew once for eighty
dispatches or skipped entirely. The render decisions live only in code
paths: the mount's pending frame slot, the whole-view short-circuit in
`draw()`, the derive/rebuild/draw counters behind the opt-in
phase-timers seam. The roadmap pins this gap twice — M1's acceptance is
"runtime can explain why a render was scheduled" (tambor-1cr landed the
mechanics; the explainer is this change, WS T5, tambor-3mf), and Gate D
lists the inspector before wider adoption. The first consumer is
already sequenced: tambor-90p's gallery debugger/inspector UI needs a
data/recording seam to read — without one it would hand-roll subscribe
listeners, counter reads and frame sampling per panel, which is the
duplication this change owns once.

## What Changes

- A new opt-in module `src/inspect/inspector.ts`:
  `createInspector({ app, retention?, commitLimit?, frameLimit? })`
  returns a `RuntimeInspector` handle with `enable()` / `disable()` /
  `enabled()` and pull reads `drainCommits()` / `drainFrames()` /
  `counters()`. An inspector that is never constructed or never
  enabled has ZERO contact with the app — no subscription, no clock
  reads, no timers, counters stay off — the landed phase-timers
  counters pattern (zero cost when off, explicit enable at the meter)
  is the precedent.
- **Commit records**: while enabled, every landed `DispatchCommit` is
  recorded as frozen plain data (sequence, ChangeSet kind with the
  known path count or the unknown reason, a clock stamp) into a
  bounded ring (512, overwrite-oldest). Per the deployed
  `commits_published` invariant, every top-level dispatch CONTAINING
  a state effect publishes a commit before repaint scheduling; a
  lane-only batch publishes a commit carrying the lane-only unknown
  ChangeSet (reason `lane-only batch`) and schedules no repaint.
  State identities are NOT
  retained by default (`retention: "changes"`), honoring the landed
  pin that listeners must not hold commits past the frame;
  `retention: "states"` opts into bounded reference retention for
  diff-style UIs.
- **Frame ledger**: one record per non-idle animation frame, grouping
  the commits published in the frame with the phase-timer counter
  deltas across it, classified `drew` (draw delta ≥ 1) or
  `skipped` (derive delta ≥ 1, rebuild and draw deltas 0) — the
  classification is BY THE COUNTER PREDICATE alone (attribution, not
  causation), plus the drained per-dispatch timing records.
  Sampling anchors on rAF and each record CLOSES after the frame's
  callbacks, so "80 commits → one draw" lands in one record instead of
  splitting across two. The sampler schedules no app work and installs
  no scheduler.
- **Consumption is pull-shaped**: destructive drains of frozen plain
  data (the phase-timers `drain()` precedent — a meter must drain).
  `App.subscribe` remains the only push channel; the inspector adds no
  second one.
- add-render-scheduler (AUTHORED, not yet executed) is the dependency
  whose decisions the ledger explains: its spec'd request-per-dispatch
  shape and one-authority invariant are what "eighty commits, one
  draw" means. The inspector reads outcomes; it never hooks, wraps or
  replaces the authority.

## Non-goals

- No signals, no automatic dependency tracking, no mutable reactive
  state, no virtual DOM as a public abstraction, no JSX requirement,
  no implicit effects, no Solid dependency — the roadmap NOT-copy list,
  restated in full.
- No UI: the inspector is the data/recording seam; the debugger UI is
  tambor-90p's (gallery debugger/inspector), sequenced as the first
  consumer. This change ships no panel, no toggle in any shell.
- No always-on overhead: nothing records, ticks, or allocates unless
  an inspector handle is constructed AND enabled.
- No scheduling authority, no wrapping of `installScheduler`, no new
  repaint path — one authority per wiring stays the invariant
  (add-render-scheduler's pin).
- No keyed DOM reconciliation (tambor-ap8's territory), no scheduler
  ownership changes, no commit semantics changes (commits are landed
  add-runtime-invalidation shape, consumed verbatim).
- No undo/time-travel and no computed state diffs: records carry
  ChangeSet plain data and, under explicit `states` retention, state
  references — diffing, replay and undo are consumer concerns this
  change does not own.
- No new App, mount, or dispatch API surface: the App interface is
  untouched (subscribe is landed; the scheduler seam is the scheduler
  change's), and no mount option is added.
- No new benchmark: B0-style attribution keeps reading the landed
  counters; the ledger is a debug artifact, not a bench registry
  entry.

## Impact

- Affected specs: `app-runtime-inspector` (new capability spec).
- Affected code: new `src/inspect/inspector.ts`; export from
  `src/index.ts` only (`src/core.ts` re-exports nothing new — the
  DOM-free core stays unchanged). Read-only dependencies, untouched:
  `src/effects/dispatch.ts` (commit stream + `App.subscribe`, landed),
  `src/events/phase-timers.ts` (counters + timing records, landed;
  enable/disable/drain consumed, not modified), `src/spa/mount.ts`.
- Dependencies: add-runtime-invalidation — LANDED (commit stream,
  subscribe delivery with throw isolation, sequence from 1; counters
  via its task 4.0 extension of the phase-timers seam).
  add-render-scheduler — AUTHORED, not executed
  (`openspec/changes/add-render-scheduler/`): the ledger explains the
  decisions its spec delta defines; if it lands with a different seam
  shape, the ledger's wording follows the landed spec, not this
  document — no inspector task depends on unlanded code.
- First consumer: tambor-90p (gallery debugger/inspector UI),
  evaluated as such in design.md (data needs, pull cadence, retention
  flag, demo-switch lifecycle, and the one identified gap:
  request-level authority verdicts are outcome-derived only).
- Risk: retention growth — bounded rings with overwrite-oldest and a
  changes-only default. Recording altering semantics — the recording
  listener never dispatches and never throws, and draw/rebuild counts
  are pinned equal with recording on versus off. Attribution at frame
  boundaries — sampling is exact within a frame, approximate across
  one, pinned in design.md.
- Bundle: the module rides the main barrel; when 90p's UI imports it,
  that landing re-records the spa gzip seam constant
  (tests/spa-delivery.test.ts) per the zero-headroom budget rule — not
  this change's gate, since this change lands no UI.
