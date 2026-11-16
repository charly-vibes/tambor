# Tasks: add-bombadil-exploration

Sections 0-5 are the approval scope (suite + baseline properties).
Sections 6-8 land after the baseline suite is green.

## 0. Prerequisites

- [x] 0.1 Fix `tambor-yew`: `panNaiveOp` and `zoomNaiveOp` are total over
      the empty plots state; add direct empty-state regression tests and
      confirm the gallery demo no longer raises when Pan/Zoom precedes
      Load.
- [x] 0.2 `add-spa-test-seams` is deployed: `?demo=<id>` and `?debug=1`
      work on the e2e fixture, the handle has a mount/unmount lifecycle,
      and both flags are inert when absent.
- Acceptance: the plots regression tests pass; a direct `?demo=plots`
      load exposes `__tambor` after mount.

## 1. Suite scaffold

- [x] 1.1 Add the exact `@antithesishq/bombadil` devDependency,
      `bombadil/tsconfig.json` (DOM lib, no emit, strict flags inherited
      where they apply), a typecheck script, and `bombadil/` in
      `eslint.config.js` ignores.
- [x] 1.2 Red: a suite-scope test asserts `bombadil/` is absent from the
      root tsconfig include and vitest include, is listed in the eslint
      ignores, and that the dependency version is exact.
- [x] 1.3 Green: place the suite and helpers under `bombadil/`; write
      `bombadil/README.md` with a minimal spec skeleton, the exact run
      command, and the trace/triage workflow.
- Acceptance: `npx tsc -p bombadil/tsconfig.json --noEmit` passes,
      `npx eslint .` passes, and the suite-scope test passes.

## 2. Shared spec helpers

- [x] 2.1 `bombadil/lib/stage.ts`: extract `#demo > div` geometry and a
      `mounted` cell; reject points outside the stage or viewport.
- [x] 2.2 `bombadil/lib/actions.ts`: stage-scoped click, drag, scroll and
      key generators; every Click/DoubleClick target goes through
      `getFingerprint`; export the default properties, never the default
      action generators.
- [x] 2.3 `bombadil/lib/model.ts`: read `globalThis.__tambor` and return
      JSON-serializable derived values; never return `view()` itself;
      return `null` safely when the handle is absent.
- [x] 2.4 Readiness gate: every action generator returns `[]` while
      `mounted.current` is false.
- [x] 2.5 Fixture hygiene: add `<link rel="icon" href="data:,">` to
      `tests/e2e/gallery.html` so default console checks are not tripped.
- [x] 2.6 Smoke: a defaults-only spec runs for 30 s against `counter`
      and exits 0.
- Acceptance: the smoke run exits 0, no action is generated before
      mount, and the trace shows the counter demo as the first mounted
      state.

## 3. Counter property

- [x] 3.1 Red: run the spec and confirm the property reports a violation
      when the counter cell is deliberately perturbed by a test hook.
- [x] 3.2 Green: use the closure form
      `now(() => { const prev = counter.current;
      return next(() => counter.current === prev - 1 ||
      counter.current === prev || counter.current === prev + 1); })`
      with the stage actions; the live run exits 0.
- Acceptance: the live counter run exits 0 and the trace contains at
      least one counter transition.

## 4. Todo property

- [x] 4.1 Red: model/DOM agreement property fails when the visible row
      count is hard-coded to the unfiltered length.
- [x] 4.2 Green: derive the expected visible count from
      `__tambor.state()` and the selected filter; count drawn rows as
      delete-X pairs divided by two (two red rectangles per row); the
      live run exits 0.
- Acceptance: the todo run exits 0 across filter changes and add/delete
      actions.

## 5. Select and plots properties

- [x] 5.1 Select: count option labels inside the open list (not the
      header) and assert they exist exactly when the model's open flag is
      true; the live run exits 0.
- [x] 5.2 Plots: add a dedicated property over `__tambor.state()` —
      `drawA.length === drawB.length`, the count is within
      `0..BAND_COUNT`, and zero bands coincide with the `no data`
      summary; run op orderings including Pan/Zoom before Load after task
      0.1; the live run exits 0.
- Acceptance: both live runs exit 0; the plots trace includes an op
      before Load.

## 6. Local runner

- [x] 6.1 `tools/bombadil-run.sh <demo>`: build the SPA; set a dedicated
      `PORT`; start `tests/e2e/serve.mjs`; wait for readiness; remove or
      overwrite `target/bombadil/<demo>/`; run the pinned CLI with a
      quoted URL such as `"http://localhost:$PORT/?demo=$demo&debug=1"`;
      trap cleanup; honor `CHROME`; write `target/bombadil/<demo>/`.
- [x] 6.2 Add `just bombadil <demo>` and document the default time limit;
      two consecutive `just bombadil plots` runs produce traces with no
      manual cleanup.
- Acceptance: two consecutive runs exit 0; interrupting a run leaves no
      server on the port.

## 7. Nightly workflow

- [x] 7.1 Add `.github/workflows/bombadil-nightly.yml`: schedule plus
      `workflow_dispatch` with a demo input, per-demo matrix, pinned
      action and version, bounded `time-limit`, and
      `output-path: bombadil-output`.
- [x] 7.2 Upload the output directory with `if: always()` and
      `if-no-files-found: warn`; set retention to 14 days; confirm the
      workflow is not referenced by `lefthook.yml`, `ci.yml` required
      checks or `ah check --run-tests`.
- [ ] 7.3 Run the action once on a manual dispatch before trusting the
      schedule; if Chrome managed mode hangs, document the `CHROME` +
      external-attach fallback from the sandbox run.
- [ ] 7.4 A manual dispatch for one demo completes and the artifact is
      downloadable.
- Acceptance: a manual dispatch produces a downloadable artifact; a
      second dispatch with no trace warns without masking the job status.

## 8. Verification and handoff

- [x] 8.1 Every demo spec runs locally and exits 0; `tambor-yew` is
      closed.
- [x] 8.2 `just test-full`, `npx tsc -p tsconfig.json --noEmit`,
      `npx eslint .`, `ah check` and `openspec validate
      add-bombadil-exploration --strict` are green.
- [x] 8.3 Triage documentation lands in `bombadil/README.md`: inspect,
      shrink, reproduce (printed command omits `--time-limit` and
      `--exit-on-violation`), file a bd issue, then fix or remove the
      property.
- [x] 8.4 Upgrade/rollback: a version bump requires a full local run and
      trace review; if no finding is triaged within eight weeks of the
      nightly landing, remove the workflow and suite in a follow-up
      change.
- Acceptance: the documented commands reproduce a violation end to end,
      and the upgrade/rollback policy is on record.

## Dependencies

- Blocked by `add-spa-test-seams` and task 0.1 (`tambor-yew`).
- Follow-ups (separate changes): leak extras, viewport sweeps,
  pure-function-of-state projection, optional per-property trace report.