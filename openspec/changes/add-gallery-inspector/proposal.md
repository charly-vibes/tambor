# Proposal: add-gallery-inspector

## Why

The gallery needs a visible debug surface: a panel showing the mounted
demo's plain-data state live and logging every dispatched transition —
the visible sibling of the `?debug=1` `__tambor` seam (add-spa-test-seams).
Today the only window into a running demo is that headless handle; charly
requested a showcase panel so visitors (and sessions) can watch the
pure-data model work. tambor-90p.

## What Changes

- New capability `gallery-inspector`: a strictly read-only, host-DOM
  panel wired from the gallery shell under the same `?debug=1` opt-in.
  Two panes: a live state read of the mounted demo's app, and a bounded
  transition log (sequence, applied intents, change kind/reason) driven
  by `App.subscribe` — the existing per-app commit stream, no new
  publish path.
- Additive commit field: `DispatchCommit.intents` — the normalized batch
  of Effect vectors the dispatch applied, published as frozen plain
  data. Optional field; structural implementers and custom-dispatch apps
  that publish their own commits are unaffected.
- Demo switching rewires the panel to the freshly mounted app; unmount
  cleans up the subscription and the panel.

## Capabilities

### New: gallery-inspector

Read-only gallery debug panel: live state pane, bounded transition log,
six pinned properties (consumes-never-mutates, every-intent-logged,
monotonic-sequence, ring-bounded, json-safe, fresh-after-draw).

### Modified: app-runtime-invalidation (authored-directly)

`Dispatch commits are published` gains the additive `intents` exposure.

## Impact

- `src/effects/commits.ts`, `src/effects/dispatch.ts`: additive optional
  `intents` on the commit (co-owned with tambor-1cr — additive and
  frozen, no publish-path change; coordination noted on that ticket).
- `src/spa/inspector.ts` (new), `src/spa/main.ts` (wiring under the
  existing `selection.debug` flag).
- No drawn-output change anywhere: the panel is host DOM outside the
  drawn root, and off by default without `?debug=1`.
