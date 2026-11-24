# Tasks: add-gallery-inspector

## 1. Commit intents (additive)

- [x] 1.0 Red: unit test — a dispatch of a two-effect batch publishes a
      commit whose `intents` deep-equals the normalized batch (frozen,
      plain data, same order); a single-effect string form normalizes to
      a one-element array; a lane-only batch still carries its lane
      intent; the array is frozen (mutation attempt throws in strict
      mode); custom-dispatch apps' commits keep `intents` undefined.
- [x] 1.1 Green: `ChangeCollector` carries the batch; `buildCommit`
      publishes `intents` as a frozen shallow copy; `makeAppDispatch`
      fills it at collection start. No other commit field changes.

## 2. Inspector panel

- [x] 2.0 Red: `wireGalleryInspector(d, app, opts)` — subscribes to the
      app, renders a host-DOM panel (live state pane + log pane), and
      returns `{ unmount() }` that unsubscribes and removes the panel;
      without unmount, a dispatch appends exactly one log entry with the
      commit's sequence, sanitized intents and change kind/reason.
- [x] 2.1 Green: implement `src/spa/inspector.ts` (boundedSeries ring,
      capacity 50; render projections per D3/D4) and wire it in
      `src/spa/main.ts` `landDemo` under `selection.debug`, unmounted in
      `select()`; without `?debug=1` the gallery DOM is byte-identical
      to today.

## 3. Pinned properties

- [x] 3.0 Red: `inspector_consumes_never_mutates` — wiring the panel,
      dispatching through it, and reading panes leaves `app.getState()`
      identity unchanged across reads and adds zero draws
      (`backend.drawCount` via the debug seam counts only the dispatch's
      own repaint).
- [x] 3.1 Red: `every_applied_intent_logged` — N dispatches land exactly
      N entries, entry i's intents deep-equal dispatch i's batch,
      including reentrant listener dispatches (each is its own entry).
- [x] 3.2 Red: `monotonic_sequence` + `ring_bounded` — entries carry
      strictly increasing sequences from 1; after capacity+k dispatches
      the log holds exactly capacity entries with the oldest evicted.
- [x] 3.3 Red: `json_safe` + `fresh_after_draw` — every rendered log
      field and the live-state projection survive `JSON.stringify` even
      with a filter-predicate intent and a function-valued state field
      (marked, not thrown); after a dispatch's commit, reading the live
      pane yields the new state reference.
- [x] 3.4 Green: hold (implementation from 2.1 satisfies all four; any
      red becomes a targeted fix, never a test weakening).

## 4. Gates

- [x] 4.1 Full suite green (`just test-full`); `ah check --run-tests`
      green; `?debug=1` gallery E2E smoke: panel renders, dispatching a
      counter increment appends one entry.
- [x] 4.2 Priority-family contract TOMLs under
      `.espectacular/changes/add-gallery-inspector/` bound to landed test
      titles; remaining scenarios tracked via ah check no-toml findings
      per repo precedent.
- [x] 4.3 On approval, spec deltas deployed per the authored-directly
      corpus convention (tambor-41q).
