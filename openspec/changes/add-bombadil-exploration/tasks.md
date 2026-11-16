# Tasks: add-bombadil-exploration

## 0. Prerequisites

- [ ] 0.1 Fix `tambor-yew`: `panNaiveOp` and `zoomNaiveOp` are total over
      the empty plots state; add direct empty-state regression tests and
      confirm the gallery demo no longer raises when Pan/Zoom precedes
      Load.
- [ ] 0.2 `add-spa-test-seams` is deployed: `?demo=<id>` and `?debug=1`
      work on the e2e fixture and are inert when absent.

## 1. Suite scaffold

- [ ] 1.1 Add the exact `@antithesishq/bombadil` devDependency and
      `bombadil/tsconfig.json` (DOM lib, no emit, strict flags inherited
      where they apply); add a typecheck script.
- [ ] 1.2 Red: a suite-scope test asserts `bombadil/` is absent from the
      root tsconfig include, vitest include and eslint source scope, and
      that the dependency version is exact.
- [ ] 1.3 Green: place the suite and helpers under `bombadil/`; keep
      `bombadil/README.md` to the run, trace and triage commands.

## 2. Shared spec helpers

- [ ] 2.1 `bombadil/lib/stage.ts`: extract `#demo > div` geometry and
      reject points outside the stage or outside the viewport.
- [ ] 2.2 `bombadil/lib/actions.ts`: stage-scoped click, drag, scroll and
      key generators; export the default properties, never the default
      action generators.
- [ ] 2.3 `bombadil/lib/model.ts`: read `globalThis.__tambor` and return
      JSON-serializable derived values; return `null` safely when the
      handle is absent.
- [ ] 2.4 Smoke: a defaults-only spec runs for 30 s against `counter`
      and exits 0.

## 3. Counter property

- [ ] 3.1 Red: run the spec and confirm the property reports a violation
      when the counter cell is deliberately perturbed by a test hook.
- [ ] 3.2 Green: `always(next(counter == prev or prev ± 1))` with the
      stage actions; the live run exits 0.

## 4. Todo property

- [ ] 4.1 Red: model/DOM agreement property fails when the visible row
      count is hard-coded to the unfiltered length.
- [ ] 4.2 Green: derive the expected visible count from
      `__tambor.state()` and the selected filter; the live run exits 0.

## 5. Select and plots properties

- [ ] 5.1 Select: option rows exist exactly when the model's open flag is
      true; the live run exits 0.
- [ ] 5.2 Plots: op-ordering run (including Pan/Zoom before Load) records
      no uncaught exception after task 0.1; the live run exits 0.

## 6. Local runner

- [ ] 6.1 `tools/bombadil-run.sh <demo>`: build the SPA, start
      `tests/e2e/serve.mjs`, wait for readiness, run the pinned CLI with
      `?demo=<demo>&debug=1`, trap cleanup, and write
      `target/bombadil/<demo>/`; honor `CHROME`.
- [ ] 6.2 Add `just bombadil <demo>` and document the default time limit;
      `just bombadil plots` produces a trace and a clean exit.

## 7. Nightly workflow

- [ ] 7.1 Add `.github/workflows/bombadil-nightly.yml`: schedule plus
      `workflow_dispatch` with a demo input, per-demo matrix, pinned
      action and version, bounded `time-limit`, and
      `output-path: bombadil-output`.
- [ ] 7.2 Upload the output directory with `if: always()`; confirm the
      workflow is not referenced by `lefthook.yml`, `ci.yml` required
      checks or `ah check --run-tests`.
- [ ] 7.3 A manual dispatch for one demo completes and the artifact is
      downloadable.

## 8. Verification and handoff

- [ ] 8.1 Every demo spec runs locally and exits 0; `tambor-yew` is
      closed.
- [ ] 8.2 `just test-full`, `npx tsc -p tsconfig.json --noEmit`,
      `npx eslint .`, `ah check` and `openspec validate
      add-bombadil-exploration --strict` are green.
- [ ] 8.3 Triage documentation lands in `bombadil/README.md`: inspect,
      shrink, reproduce, file a bd issue, then fix or remove the
      property.

## Dependencies

- Blocked by `add-spa-test-seams` and task 0.1 (`tambor-yew`).
- Follow-ups (separate changes): leak extras, viewport sweeps,
  pure-function-of-state projection, optional per-property trace report.