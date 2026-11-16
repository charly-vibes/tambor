# Tasks: add-spa-test-seams

## 1. Boot selection parser

- [ ] 1.1 Red: `tests/spa-boot-selection.test.ts` — known id selects its
      index, unknown id and empty search select 0, `debug` is true only
      for `debug=1`, and the parser never throws on malformed input.
- [ ] 1.2 Green: add the pure `bootSelection(search, demos)` module used
      by the entry; keep it free of DOM access.

## 2. Entry wiring

- [ ] 2.1 Red: e2e assertion — `?demo=todo` mounts the todo demo and the
      todo nav button is active; `?demo=does-not-exist` mounts the first
      demo with no console error. tests/e2e/gallery.spec.ts.
- [ ] 2.2 Green: `src/spa/main.ts` calls the parser once, selects the
      resolved demo index on boot, and keeps nav click behavior unchanged.

## 3. Debug snapshot

- [ ] 3.1 Red: mount test — with debug enabled the handle exposes the
      demo id, state, view and a draw count that advances with dispatches;
      with debug disabled the global is absent.
- [ ] 3.2 Green: `src/spa/mount.ts` publishes the read-only handle around
      the existing `app.getState()` / `app.view()` derivations and the
      draw loop; no setters, no dispatch.

## 4. Inertness and composition

- [ ] 4.1 Red: e2e projection test — the drawn text plus element geometry
      are equal with debug on and off at the same demo; direct `?demo=todo`
      boot matches a nav-selected todo boot.
- [ ] 4.2 Red: e2e composition — `?demo=todo&debug=1&sw=1` mounts todo,
      creates the handle, and takes the service-worker path.
- [ ] 4.3 Green: resolve any mismatch by fixing the seam (never by
      special-casing the assertion).

## 5. Verification

- [ ] 5.1 `just test` and the e2e smoke lane are green.
- [ ] 5.2 `npx tsc -p tsconfig.json --noEmit` and `npx eslint .` are green;
      the parser stays inside the existing include scope.
- [ ] 5.3 `openspec validate add-spa-test-seams --strict` is green.

## Dependencies

- Blocks `add-bombadil-exploration`: its per-demo runs consume both flags.
- No production behavior changes when the flags are absent; no packaging
  or corpus changes.