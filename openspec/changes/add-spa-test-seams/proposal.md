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

- New `spa-testability` capability: the SPA entry accepts `?demo=<id>` and
  mounts that gallery demo on boot; absent or unknown values keep the
  current first-demo behavior. Nav selection and active-button state
  follow the chosen demo.
- `?debug=1` exposes a read-only `globalThis.__tambor` handle with the
  active demo id, `state()`, `view()` and `drawCount()`. The handle is
  absent when the flag is absent and has no write path.
- Both flags are behavior-inert: the drawn tree, event routing and
  dispatch semantics are unchanged; debug on/off produces an equivalent
  drawn projection at the same demo and state.
- The existing `?sw=1` service-worker opt-in composes with the new
  parameters on the e2e fixture page.

## Impact

- Affected specs: `spa-testability` (new capability, all requirements
  ADDED). No existing capability requirements change.
- Affected code: `src/spa/main.ts` (query parsing, boot selection, nav
  active state), `src/spa/mount.ts` (optional snapshot handle around the
  existing app/view/draw loop), a small pure parser module.
- Affected tests: parser unit tests; SPA bundle/e2e assertions for
  `?demo`, `?debug`, fallback, inertness and flag composition.
- Non-goals: URL routing or deep links to demo state; a production debug
  UI; always-on debug exposure; state mutation through the handle;
  changing the gallery registry or demo semantics.