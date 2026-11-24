# Design: add-gallery-inspector

## Context

The `?debug=1` `__tambor` handle (add-spa-test-seams) is the only debug
window into a mounted demo: read-only accessors, published after the
initial draw, no dispatch. The gallery (src/spa/main.ts) mounts one demo
at a time through `mountDemo` and owns the `App` object in `landDemo`.
`App.subscribe` delivers every `DispatchCommit` (sequence from 1,
frozen, previousState + state + ChangeSet) — tambor-1cr's commit stream.
`components.ring_buffer`'s `boundedSeries` is the corpus bounded-log
utility. add-demo-visual-polish phase 2 landed the layout; its phase 3
(theme) comes after this change per tambor-90p's anchoring.

## Goals / Non-Goals

- Goals: live state pane; bounded transition log; six pinned properties;
  demo-switch rewiring; zero drawn-output impact.
- Non-Goals (the NOT-copy list): no editing/dispatching from the panel
  (read-only by API, like the seam); no undo/time-travel; no diff
  algorithm — the log entry carries sequence + intents + change kind,
  and the live pane shows current state, not per-entry state snapshots;
  no virtualized scrolling; no persistence.

## Decisions

### D1. Subscribe, don't intercept

The panel consumes `App.subscribe` — the commit stream already pins
every-applied-dispatch-published-exactly-once, monotonic sequence, and
throw isolation. No new publish path, no dispatch wrapping, no
`__tambor` changes. This also honors tambor-90p's co-modification note:
the only dispatch-side change is the additive `intents` read below.

### D2. Intents ride the commit as frozen plain data

`DispatchCommit` gains `intents?: readonly Effect[]` — the normalized
batch `makeAppDispatch` applied, copied and frozen in `buildCommit`
alongside the ChangeSet. Optional: custom-dispatch apps and structural
implementers publish commits without it and stay valid (p_ops_noop
surface unchanged). Effect vectors are plain `[type, ...args]` data;
non-JSON-safe args (filter predicates) are sanitized at RENDER time by
the inspector, never at publish time — the commit stays the raw truth.

### D3. The log stores references, not snapshots

A log entry is `{ sequence, intents, changes, state }` where `state` is
the commit's live reference (the corpus model: states are immutable
plain data, so holding the reference IS the snapshot — a JSON copy would
allocate a whole tree per dispatch on the 1,000-row keyed-table demo).
The bounded ring (capacity 50, `boundedSeries`) bounds memory by
entries, not bytes. json_safe pins the RENDERED projection (intents
stringified with function args marked, paths, kind, sequence), not the
stored references.

### D4. Host DOM, wired from the gallery shell

`src/spa/inspector.ts` exports `wireGalleryInspector(d, app, opts)` →
`{ unmount() }`. main.ts calls it in `landDemo` when `selection.debug`
is set, appending the panel after the drawn root; `select()` unmounts it
with the demo. The panel is host DOM (jsdom-testable through the
structural adapter, like gallery.test.ts), never canvas — it must not
enter the drawn root or the a11y mirror of drawn output.

### D5. fresh_after_draw is commit-driven

Each commit listener append triggers a panel re-render: the log pane
grows and the live pane re-reads `app.getState()` (identity-stable
between commits). After a dispatch's repaint the panel already shows the
new state — no rAF coupling, no polling, no draw hook.

## Risks / Trade-offs

- [medium] `intents` on the commit grows commit objects by one frozen
  array per dispatch — bounded by batch size, negligible; the alternative
  (side channel) would break the every-intent-logged property's single
  source of truth.
- [low] Ring capacity 50 is arbitrary until a bench says otherwise; the
  property pins the bound, not the number.
- [ coordination ] commits.ts/dispatch.ts are tambor-1cr-owned: the
  additive field is backward-compatible (optional, frozen copy); noted
  on tambor-1cr.

## Migration Plan

Purely additive: without `?debug=1` the gallery renders exactly as
today; with it, the panel appears and nothing drawn changes. No data
migration.

## Open Questions

- None blocking; panel styling is add-demo-visual-polish phase 3's
  (theme tokens), deliberately out of scope here.

## Property index (VERIFIES targets)

- `gallery.inspector.p_consumes_never_mutates` — wiring, reads, renders
  cause no mutation, no dispatch, no extra draws.
- `gallery.inspector.p_every_intent_logged` — every top-level dispatch
  lands exactly one log entry with the applied intents.
- `gallery.inspector.p_monotonic_sequence` — strictly increasing
  sequences from 1.
- `gallery.inspector.p_ring_bounded` — at most capacity (50), oldest
  evicted first.
- `gallery.inspector.p_json_safe` — every rendered field serializes.
- `gallery.inspector.p_fresh_after_draw` — after a commit, the live pane
  reads the new state reference.
- `app.runtime.invalidation.p_commit_intents` — makeApp commits carry
  the normalized applied batch as frozen plain data; absence is valid
  only outside makeApp's publish path.
