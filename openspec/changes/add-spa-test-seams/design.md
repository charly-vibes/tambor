# Design: add-spa-test-seams

## Context

`src/spa/main.ts` builds the nav, mounts `DEMOS[0]`, and switches demos
only through nav button clicks. `src/spa/mount.ts` returns a `SpaHandle`
whose app already answers `getState()` and `view()`; the route-time view
cache depends on state identity, and the draw loop is the natural place
to count draws. The e2e fixture (`tests/e2e/gallery.html`) serves the real
bundle and is the stable origin for both Playwright and Bombadil.

## Goals / Non-Goals

- Goals: deterministic demo boot, a read-only model/view snapshot for
  extractors, zero behavior change when the flags are absent, and one
  place that parses the query string.
- Non-Goals: routing, per-demo URLs in the product, debug UI, state
  mutation, exposing internals outside the query-gated handle.

## Decisions

### D1. Parse the query string in a pure module

`bootSelection(search)` returns `{ demoIndex, debug }` with the registry
as an argument, so fallback rules are unit-testable without a DOM. The
entry calls it once and passes the result to mount. Unknown ids fall back
silently — `console.error` would trip Bombadil's `noConsoleErrors`
default and make the fallback look like a failure.

### D2. Snapshot ownership stays in the mount

`mountDemo` accepts an optional `{ debug: boolean }` and, when set,
publishes `globalThis.__tambor` with `demo`, `state()`, `view()` and
`drawCount()`. The app remains the single source of truth; the handle
stores no copies. `view()` calls the same derivation the draw path uses,
so the snapshot cannot drift into a second renderer.

### D3. Opt-in, not build-flag, exposure

The flag is a runtime query parameter rather than a build-time define:
the e2e fixture and the deployed bundle are the same bytes, and a debug
build cannot accidentally ship. The branch is outside the draw hot path.

### D4. Inertness is asserted, not assumed

The change is accepted only if mounting the same demo with and without
`?debug=1` yields an equivalent drawn projection (text plus element
geometry), and direct `?demo=todo` boot matches nav-selected boot. This
is the contract that keeps the seam honest.

### D5. Compose with the existing `sw` flag

The service worker opt-in keys off `location.search.includes("sw=1")`.
The new parameters are parsed independently, so `?demo=…&debug=1&sw=1`
honors all three; no flag ordering or exclusivity rules are introduced.

## Risks / Trade-offs

- [A test seam becomes product surface] → documented as test-only,
  read-only, and absent by default; the capability spec scopes it.
- [Debug handle used for state mutation] → the handle exposes functions
  that return values only; no setters and no dispatch.
- [Snapshot drift from the real draw path] → `view()` reuses the mount's
  derivation; the inertness scenario compares drawn output.
- [Unknown demo id hides typos] → the fallback is asserted, and the pure
  parser test pins the rule; tools fail on a wrong demo through the
  snapshot's `demo` value.