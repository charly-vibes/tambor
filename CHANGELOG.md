# Changelog

All notable changes to `@charly-vibes/tambor` are documented here.
The package is 0.x: minor bumps may ship features and adjustments;
breaking renames would call a minor bump too (0.x semver convention).

## [0.2.0] — 2026-11-24

Five weeks of corpus work since 0.1.0: keyed DOM reconciliation, the
runtime invalidation stream, the docs site, and the first outside bug
report (GH#1) fixed.

### Added

- **Keyed DOM reconciliation** (add-keyed-dom-reconciliation): the
  `keyed()` declaration, a pure reconcile plan consumed by the render
  backend, splice ordering across positions, `createSelector` keyed on
  the picked slice, and the by-key state-path navigator with
  exactly-one loud addressing.
- **Runtime invalidation stream** (add-runtime-invalidation): a
  `ChangeSet`/`DispatchCommit` publication per dispatch, `App.subscribe`
  with unsubscribe and same-frozen-commit delivery order, painter
  identity short-circuit and per-child DOM reuse, lane-aware draw
  boundary (lane-only batches transform-draw the cached tree).
- **Gallery inspector** (`?debug=1`): a read-only host-DOM panel with
  the live JSON-safe state and a bounded log of every dispatched
  commit — sequence, intents, ChangeSet kind.
- **Mount-boundary frame coalescing** with mode opt-out and flush
  (tambor-bva).
- **`cellScale` option on the real-DOM path** (GH#1 — first external
  report).
- **New components**: canvas layer (data by reference, identity-keyed
  raster cache), virtual list (pure offsets geometry, windowed draw),
  bounded-series ring buffer, identity-keyed subtree memo, worker-effect
  (typed envelope, `WorkerLike` client, validated replies), spatial
  hit-test index, interaction-lane drag overlay.
- **Textarea editing model**: pure buffer state with cluster
  moves/deletes, selection extend/collapse/select-all, word rules,
  vertical movement, multi-line hit-test, undo/redo timeline, mobile
  bridge keys and forward delete.
- **Notebook example app**: core model, worker evaluator with kill
  switch, gallery registration.
- **Docs site** at `/docs/` on Pages: corpus-generated reference pages,
  curated guides with compiled samples, live demo embeds, scrollytelling
  showcase, keyboard-operable responsive nav.
- **SPA delivery**: minified chunked demo build, PWA shell, `?demo` boot
  selection, `?debug` snapshot seams.
- **Bench suite**: playwright harness with raw-JSON results and bench
  apps B1–B8 (keyed-table, TodoMVC, 200-field form, turtle-20k,
  time-travel-10k, save-restore-5k, dashboards, review-faults) plus
  streaming variants, with scenario floors.
- **Bombadil exploration suite**: pinned properties with visual
  invariant audits (contrast floors, clipping) on a nightly lane.
- **CI gates**: full-strict `tsc` typecheck and a playwright e2e smoke
  gate on pinned Chromium.

### Changed

- **Light-scheme accent darkened `[0, 0.48, 1]` → `[0, 0.42, 1]`**: the
  white selected-row label now meets the WCAG AA 4.5:1 text floor
  (was 4.02:1). The dark-scheme accent was deepened earlier for the
  same reason. (tambor-bc2)
- Inactive toggle options and the select no-selection ink moved to the
  accessible muted gray (tambor-71u).
- Buttons floor at 44 px per axis on touch devices (tambor-8cu).
- The render cache evicts FIFO instead of LRU bump-on-hit.
- The DOM backend threads text ink and fill color to spans, and the
  drawn root is sized to the drawn extent per draw.

### Fixed

- Input hardening: modifier keys, `preventDefault`, pointer
  capture/cancel, drag-vs-hover disambiguation, IME text; wheel events
  forward to the corpus router; input events listen on the drawn root so
  real buttons receive events.
- The service worker's install-time cache prune is scoped to
  `CACHE_PREFIX` (tambor-ilc).
- Keyed array index-paths carry their full structural chain through
  wrapper painters (tambor-4ny).
- The logo worker is emitted as a bundled asset (Pages 404) and the
  interpreter guards loop budget, non-finite coords and unspaced
  operators; re-render after async applies (logo Run stuck at 0/0).
- Demo embeds draw over the drawn slot (not the mount surface) and the
  docs entry self-boots (the live page was blank chrome).
- The `request-focus` effect is registered and focus state is exposed
  in the view ctx.
- Opening the package no longer emits the docs site into the npm
  tarball.

[0.2.0]: https://github.com/charly-vibes/tambor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/charly-vibes/tambor/releases/tag/v0.1.0
