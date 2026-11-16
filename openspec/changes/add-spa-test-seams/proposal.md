# Add SPA test seams

## Why

The SPA entry (`src/spa/main.ts`) always boots `DEMOS[0]` and exposes no
read-only view of the mounted app. Browser tests therefore drive demos
through nav clicks, and exploratory tools that read model state (rather
than only drawn text) have no supported seam. The sandbox Bombadil run in
the `62e83d393323` evaluation had to add a custom "switch demo by name"
action, and its todo property still broke whenever nav or filter actions
changed the row count — cross-demo navigation and hidden state made the
property fragile. A deterministic per-demo boot and an opt-in state
snapshot remove both problems and also shorten Playwright runs.

`mount.ts` already holds the two values a snapshot needs: `app.getState()`
is the cache invalidation signal and `app.view()` is the derived tree.
Exposing them read-only is a test seam, not a new architecture.

## What Changes

- New `spa-testability` capability (demo/test plumbing, not library
  API): the SPA entry accepts `?demo=<id>` and mounts that gallery demo
  on boot; absent or unknown values keep the current first-demo
  behavior. The id is matched exactly, the first occurrence wins, and a
  selected demo whose chunk fails to load falls back to the first demo
  without an unhandled rejection. Nav selection and active-button state
  follow the chosen demo.
- `?debug=1` exposes a read-only `globalThis.__tambor` handle with the
  active demo id, `state()`, raw `view()` and `drawCount()`. The handle
  is cleared when the current demo unmounts and published only after the
  next mount; it is absent when the flag is absent, has no write path,
  and is deliberately user-reachable in the deployed demo bundle.
- Both flags are behavior-inert: the drawn tree, event routing and
  dispatch semantics are unchanged; debug on/off produces an equivalent
  drawn projection at the same demo and state.
- The existing `?sw=1` parsing composes with the new parameters on the
  e2e fixture. The fixture proves the parsing path; successful service
  worker registration remains covered by the existing
  `/demo-dist/index.html?sw=1` spec, not by the fixture.

## Impact

- Affected specs: `spa-testability` (new capability, all requirements
  ADDED). No existing capability requirements change.
- Affected code: `src/spa/main.ts` (query parsing, boot selection, nav
  active state), `src/spa/mount.ts` (optional snapshot handle around the
  existing app/view/draw loop), a small pure parser module.
- Affected tests: parser unit tests; a new CI-gated
  `tests/e2e/test-seams.spec.ts` (added to the `e2e-smoke` job — the
  gallery spec remains outside the gate) for `?demo`, `?debug`,
  fallback, failed-chunk fallback, lifecycle, inertness and flag
  composition.
- Affected CI: `.github/workflows/ci.yml` `e2e-smoke` gains the seam
  spec; no existing gate changes.
- Non-goals: URL routing or deep links to demo state; a public debug API
  or production support contract for `?debug`; a production debug UI;
  build-time flag gating; state mutation through the handle; changing
  the gallery registry or demo semantics.