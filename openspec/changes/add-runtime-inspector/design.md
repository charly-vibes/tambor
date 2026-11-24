# Design: add-runtime-inspector

## Ground truth (verified at the landed tree)

- `publish()` in `src/effects/dispatch.ts` builds ONE frozen
  `DispatchCommit` (`previousState`, `state`, `changes`, `sequence`
  from 1) for every top-level dispatch CONTAINING a state effect, and
  delivers it to the snapshot of subscribers in registration order
  BEFORE the repaint is scheduled; a lane-only batch (no state effect)
  also publishes a commit — carrying the lane-only unknown ChangeSet
  (reason `lane-only batch`) — and schedules NO repaint. Note: the
  landed tree briefly diverged (lane-only batches not publishing);
  the deployed `commits_published` invariant is the authority and
  the code is being brought back in line with it — this summary
  describes the POST-FIX behavior.
  A throwing
  listener is isolated (first error re-thrown after the pass);
  reentrant dispatch queues as its own later commit; the dispatcher
  retains no commit history (bounded-memory pin, review round 1).
- `App.subscribe` lands on the app handle; the commit types re-export
  through `src/core.ts` (add-runtime-invalidation, landed).
- `src/events/phase-timers.ts`: `enable()`/`disable()` (disable clears
  the buffer), `count(name)` no-ops when disabled (no clock reads, no
  allocation in the hot path), `counters()` returns a frozen
  cumulative snapshot (zeros while off), `drain()` is a destructive
  frozen read — "a meter must drain; the buffer is bounded only by
  that contract". The counters (invalidation task 4.0) are
  module-global cumulative since enable, bumped at the derive spans
  and the DOM draw/rebuild sites, and are also exposed on the mount
  handle next to drawCount.
- add-render-scheduler (AUTHORED, not executed — cited from its spec
  delta): `App.installScheduler(schedule)`, the mount installs ONE
  authority (request/paint/paintNow over the landed coalescer;
  absorbing in immediate mode and on no-rAF hosts), exactly one
  repaint request per top-level state-effect dispatch, at most one
  queued animation-frame callback per frame.
- jsdom ships an async rAF; every fake-frame test stubs rAF
  explicitly (the `stubFrames`/`pump` pattern,
  tests/spa-mount-coalesce.test.ts). Spy backends count draws and
  rebuilds separately (drawCount vs rebuildCount, the invalidation
  suite pattern).
- The gallery (`src/spa/gallery.ts`) mounts ONE demo app at a time
  through `mountDemo`; the demo switcher swaps apps on navigation.

## Decisions

1. **Opt-in is a runtime module instance — not a mount option, not a
   build flag, not App API.** `createInspector({ app, ... })` binds
   one App and REQUIRES a subscribe-capable one: construction throws
   a clear error naming the requirement when `app.subscribe` is
   absent — apps wired on other seams publish no commits, so the
   inspector's commit recording would be meaningless there (fail
   fast, not silently record nothing). `enable()` subscribes and
   starts recording; `disable()`
   tears down. A mount option is rejected: add-render-scheduler pins
   "no new mount options", and bare makeApp / headless-wire consumers
   could not enable. A build flag is rejected: enabling becomes a
   deploy-time decision, the debug UI could not toggle at runtime, and
   the test matrix splits by bundler configuration. New App members
   are rejected: the App interface growing for every consumer
   (including corpus scaffolds that must stay unchanged) violates
   no-surface-change-when-disabled; `App.subscribe` is already THE
   app-side seam. Instance-scoped rather than module-global (the
   phase-timers precedent is enable()-gated but global): the gallery
   switches demo apps, and a global recorder would leak recording
   across switches.
2. **Zero-cost-when-disabled means zero contact, not merely cheap.**
   Never constructed or never enabled: no `subscribe` call, no clock
   reads, no rAF anchor, no timers, counters stay at their disabled
   zeros, drains return empty. This mirrors the landed phase-timers
   contract verbatim (every seam function returns immediately when
   disabled; enabling is an explicit call at the meter, never
   env-polling per dispatch). The enabled cost is the recording
   itself: ring pushes, clock stamps, one rAF anchor and one trailing
   macrotask per frame — a debug meter's cost, paid only while
   enabled.
3. **Commit records are plain data; states only on explicit
   retention.** A record is `{ sequence, changes: { kind: "known",
   pathCount } | { kind: "unknown", reason }, at }`, frozen on drain.
   Default `retention: "changes"` holds NO state identity past the
   delivery pass — the landed bounded-memory pin honored by
   construction. `retention: "states"` adds `previousState`/`state`
   references for diff-style UIs; retention is then bounded by the
   commit ring and the consumer owns the semantics. Rings are named
   constants (512 commit records, 128 frame records),
   overwrite-oldest; a drain empties.
4. **The frame ledger closes after the frame's callbacks.** A commit
   publishes BEFORE its repaint is queued, and rAF callbacks run in
   registration order — an anchor registered at the previous tick runs
   AHEAD of the app's draw callback queued at dispatch time, so an
   rAF-only tick would snapshot pre-draw counters and split one
   frame's commits from its draw across two records. The ledger
   therefore anchors a tick on rAF and closes each record in a
   trailing macrotask (setTimeout 0), which the event loop runs after
   the frame's rendering steps complete: the record for frame k
   carries frame k's commits AND frame k's draw. Without rAF (node,
   plain vitest), there is no ledger — commit records still flow and
   `counters()` stays readable; the ledger requires a frame source,
   mirroring the scheduler's no-rAF honesty. Idle frames (no commits,
   zero deltas, no timing records) record nothing, so a 60 Hz idle
   page does not churn the ring.
5. **The ledger explains scheduling outcomes; it never becomes an
   authority.** Outcomes are derived from the landed counters:
   `drew` (draw delta ≥ 1), `skipped` (derive delta ≥ 1, rebuild and
   draw deltas 0). The classification is defined BY THE COUNTER
   PREDICATE alone — it is attribution, not causation: the counters
   say the frame did no draw work; they do not say why.
   "Eighty commits, one draw" is the scheduling authority's decision,
   explained from its spec'd shape (request-per-dispatch, at most one
   queued callback per frame) plus the counter deltas — the inspector
   installs nothing and wraps nothing. *Alternative rejected:*
   interposing a recording scheduler via `installScheduler` — the
   authored seam REPLACES the slot; a wrapper installed before the
   mount's authority is silently clobbered, one installed after
   strands the authority, and either way the inspector would become a
   second scheduling authority, violating the one-authority invariant.
   A direct request tap, if ever needed, belongs to the scheduler
   capability's own evolution.
6. **Consumption is pull; `App.subscribe` stays the only push.**
   `drainCommits()` / `drainFrames()` are destructive frozen reads
   (the phase-timers `drain()` precedent), `counters()` a
   non-destructive snapshot. Recording is continuous while enabled
   (a poll-based recorder would miss commits between polls); only the
   CONSUMPTION polls, at the UI's own cadence. *Alternative rejected:*
   a second push API — it duplicates the landed subscribe, re-answers
   delivery-order and retention questions for no new capability, and
   invites unbounded listener fan-out.
7. **The recorder is inert: it never dispatches and never throws.**
   The landed delivery re-throws the first listener error after the
   pass, so an inspector bug would surface as app breakage. The
   recording listener only writes preallocated ring slots (index
   arithmetic on overwrite; freeze happens on drain, not in the
   listener) and performs no dispatch, so dispatch semantics, draw
   counts and the pinned state-equivalence contract are identical
   with recording on versus off.
8. **First consumer: tambor-90p (gallery debugger/inspector UI) —
   evaluated.** (a) Transition panel: `drainCommits()` gives
   sequence + ChangeSet per dispatch — enough to list what changed at
   the ChangeSet level (kinds, path counts, unknown reasons) without
   reading live state. (b) Render panel: `drainFrames()`
   gives per-frame drew/skipped plus counter deltas — "why did it
   render / why didn't it", the M1 acceptance question. (c)
   Attribution strip: `counters()` cumulative derive/rebuild/draw.
   (d) State-diff view: `retention: "states"`, bounded refs. (e)
   Lifecycle: the demo switcher calls `disable()` (or discards the
   handle) on unmount and enables on the next mount — rings clear,
   app sequences continue. (f) Cadence: a per-frame poll of the
   drains fits a debug panel; no push wiring needed. (g) Known gap,
   stated rather than papered over: the authority's internal verdicts
   (absorbed vs deferred per request) are not directly recorded —
   they are outcome-derived (Decision 5). If 90p needs request-level
   verdicts, that is a scheduler-capability evolution, not an
   inspector API change. Second gap, same stance: the landed stream
   carries no intent list — the panel logs transitions by sequence +
   ChangeSet summary, not by which intent produced them. Intent-level
   logging would be a consumer-side `App.subscribe` listener or an
   explicit future record extension, not something this seam
   fabricates. Verdict: the seam as specified covers the
   debugger's data needs with zero new app-side API.

## Pins (review-ready)

- Ring bounds are named constants: 512 commit records, 128 frame
  records; overwrite-oldest; drains empty; drains return frozen data.
- Idle frames record nothing; a ledger record exists only when ≥ 1
  commit, a nonzero counter delta, or ≥ 1 drained timing record
  belongs to it. Ledger slices reference the same frozen commit
  record objects the commit ring holds (retention applies uniformly).
- Timer ownership: `enable()` turns the phase timers on and remembers
  whether they were already enabled; `disable()` restores that prior
  state. While enabled, the inspector owns the timers' drain
  contract — drained timing records land in the closing ledger slice
  (documented single-meter assumption, the same class as the landed
  one-record-per-wire approximation).
- Counter deltas are computed across the inspector's own consecutive
  snapshots, never assumed from zero — phase-timer accumulation
  across re-enables is harmless by construction.
- Attribution is exact within a frame; a commit dispatched between the
  frame's callbacks and the slice close is attributed to the closing
  slice (sampling boundary; rare under the one-dispatch-per-frame
  corpus constraint, reported as data like the phase-timers GC field).
  The same holds for classification: a commit dispatched in that
  window may see its frame labeled `skipped` while its draw runs next
  frame — the label attributes counters to a slice, it does not claim
  causation.
- Counter deltas count DOM-backend work (the landed bump sites are the
  derive spans and the dom draw/rebuild sites) — the gallery is a DOM
  host, so the first consumer reads exact numbers; other backends see
  derive-only deltas.
- The inspector resets nothing on the app: sequences continue across
  disable/enable; `disable()` clears the inspector's rings only.
- The inspector's listener never dispatches and never throws; ring
  overflow cannot reject a delivery pass (pins tested in §4).

## Test shape (inputs/outputs pinned first)

- tests/runtime-inspector.test.ts throughout, fake-frame pump
  (stubFrames/pump), a spy-wrapped `app.subscribe` for contact
  assertions, a spy backend wrapped over the DOM backend (drawCount vs
  rebuildCount) so the landed counter bumps fire, and
  `phaseTimers.counters()` read directly (the suite restores timer
  state in afterEach — the counters are module-global).
- Input: 80 routed dispatches inside one fake frame under the
  coalesced mount, inspector enabled; output: exactly one ledger
  record — 80 commit records with sequences 1..80, draw delta 1,
  classified `drew` (the trailing close keeps the frame's draw in its
  own record).
- Input: a dispatch changing only an undrawn memo-stable slice;
  output: the ledger classifies the frame `skipped` (derive ≥ 1,
  rebuild 0, draw 0).
- Input: retention default vs `"states"`; output: the commit record
  exposes no state fields by default, both refs under `"states"`.
- Input: 600 dispatches; output: the drain returns the last 512,
  oldest overwritten, the dispatch pass unbroken.
- Input: disable after recording; output: unsubscribe invoked, drains
  empty, a later dispatch records nothing, app sequence continues.
- Input: the same scripted dispatch set on the spy backend with
  recording on versus off; output: identical draw and rebuild counts;
  the pinned state-equivalence contract
  (tests/bench-stream-dashboard.test.ts) green with the inspector
  attached and enabled.

## Alternatives rejected

- Mount option (`mountDemo({ inspector: true })`): rejected — no new
  mount options (scheduler pin), bare/headless consumers excluded.
- Build flag / dead-code elimination: rejected — deploy-time
  enablement, no runtime toggle, bundler-split test matrix.
- Always-on App-level recorder (App gains `inspector`): rejected —
  App surface grows for every consumer; violates
  no-surface-change-when-disabled.
- Push API (inspector re-emits records as events): rejected —
  `App.subscribe` is the push channel; pull keeps memory bounded by
  the ring and the meter contract.
- Interposing on `installScheduler`: rejected — replace semantics
  clobber or strand the authority; a second scheduling authority
  (Decision 5).
- rAF-only tick without the trailing close: rejected — registration
  order puts the tick ahead of the frame's draw callback, splitting
  one frame's commits from its draw across two records (Decision 4).
- Retaining states by default: rejected — contradicts the landed
  bounded-memory pin; retention is an explicit, bounded opt-in.
