# Tasks: add-spa-test-seams

## 1. Boot selection parser

- [x] 1.1 Red: `tests/spa-boot-selection.test.ts` — known id selects its
      index, unknown id and empty search select 0, the first `demo`
      occurrence wins, ids match exactly, `debug` is true only for
      `debug=1`, and the parser never throws on malformed input.
- [x] 1.2 Green: add the pure `bootSelection(search, demos)` module used
      by the entry; keep it free of DOM access.
- Acceptance: the parser tests pass under `npx vitest run
      tests/spa-boot-selection.test.ts`.

## 2. Entry wiring

- [x] 2.1 Red: e2e assertion in `tests/e2e/test-seams.spec.ts` —
      `?demo=todo` mounts the todo demo and the todo nav button is
      active; `?demo=does-not-exist` mounts the first demo with no
      console error. This spec is CI-gated; `gallery.spec.ts` stays out
      of the gate.
- [x] 2.2 Green: `src/spa/main.ts` calls the parser once, selects the
      resolved demo index on boot, and keeps nav click behavior
      unchanged.
- [x] 2.3 CI: add `test-seams.spec.ts` to the `e2e-smoke` command in
      `.github/workflows/ci.yml` (next to `bench-apps-smoke`,
      `notebook` and `risks`).
- [x] 2.4 Failed chunk: catch a rejected `demo.load()` and mount the
      first demo instead; assert no unhandled rejection in
      `test-seams.spec.ts`. (Implemented as: the first DIFFERENT demo
      whose load resolves, in registry order; all-fail renders a static
      error state.)
- Acceptance: `npx playwright test --config
      tests/e2e/playwright.config.ts test-seams.spec.ts` passes, and
      the `e2e-smoke` job lists the spec.

## 3. Debug snapshot

- [x] 3.1 Red: mount test — with debug enabled the handle exposes the
      demo id, state, raw view and a draw count that advances on each
      draw (not on a no-intent event); with debug disabled the global is
      absent. Add a nav-switch test that observes the handle during the
      async import gap and after the new mount.
- [x] 3.2 Green: `src/spa/mount.ts` publishes the read-only handle after
      the mount, clears it on unmount, and replaces it after the next
      mount; no setters, no dispatch. `view()` is the raw `app.view()`;
      the cached/lane-wrapped tree stays internal.
- Acceptance: the mount test and the nav-switch test pass; the handle is
      undefined between demos and names the new demo after mount.

## 4. Inertness and composition

- [x] 4.1 Red: e2e projection test in `test-seams.spec.ts` — the drawn
      text plus element geometry are equal with debug on and off at the
      same demo; direct `?demo=todo` boot matches a nav-selected todo
      boot.
- [x] 4.2 Red: e2e composition — `?demo=todo&debug=1&sw=1` mounts todo,
      creates the handle, and takes the same service-worker registration
      attempt as `sw=1` alone. Successful registration remains covered
      by the `/demo-dist/index.html?sw=1` spec.
- [x] 4.3 Green: resolve any mismatch by fixing the seam (never by
      special-casing the assertion).
- Acceptance: both e2e tests pass in the `e2e-smoke` job.

## 5. Verification

- [x] 5.1 `just test` and the `e2e-smoke` job (including
      `test-seams.spec.ts`) are green.
- [x] 5.2 `npx tsc -p tsconfig.json --noEmit` and `npx eslint .` are
      green; the parser stays inside the existing include scope.
- [x] 5.3 `openspec validate add-spa-test-seams --strict` is green.

## Dependencies

- Blocks `add-bombadil-exploration`: its per-demo runs consume both
  flags and the mounted readiness gate.
- No production behavior changes when the flags are absent; no packaging
  or corpus changes.