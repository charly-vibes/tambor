# Add Bombadil exploration

## Why

The browser lane is strong on enumerated scenarios but thin on action
*sequences*: `gallery.spec.ts` is deliberately outside the CI gate, the
known risks are recorded as `test.fail`, and the host/SPA layer — real
pointer routing, redraw identity, windowing under scroll, model-vs-DOM
agreement — has no randomized exploration. The `62e83d393323` evaluation
ran Bombadil 0.7.10 against the sandbox build and found a real crash in
the plots demo (Pan/Zoom naive before Load) that the current suite never
exercises. That defect is still present at HEAD: `plotState()` starts
with `points: []`, both naive ops call `bandsFor`, and every test and e2e
scenario warms up with `loadOp` first (`tambor-yew`).

Bombadil is a property-based explorer for web UIs: TypeScript specs export
temporal properties and action generators; the CLI captures state, checks
properties, picks an action and repeats, then writes a trace that can be
inspected, shrunk and reproduced. It complements fast-check (pure
functions) and Playwright (scripted paths) rather than replacing either.

## What Changes

- New `exploratory-verification` capability: a pinned Bombadil suite
  under `bombadil/`, outside the vitest include, root tsconfig and the
  type-aware eslint override, with its own DOM-enabled TypeScript config
  and an explicit `bombadil/` eslint ignore.
- Per-demo top-level specs (`counter`, `todo`, `select`, `plots`) that
  re-export the browser default properties and export only stage-scoped
  action generators, so a run never navigates between demos. The default
  action generators are never exported.
- A mounted-readiness gate: action generators return no actions while
  the selected demo is still loading, so the first actionable state is
  the mounted demo.
- Shared spec helpers: the stage geometry/mounted extractors, surface
  click/drag/scroll/key generators, and the `__tambor` state extractor
  supplied by `add-spa-test-seams`.
- Baseline properties: the default safety properties plus counter ±1,
  todo model/DOM rows, select open-flag agreement, and a dedicated plots
  property (both charts draw the same band count, 0..BAND_COUNT, and zero
  bands coincide with the `no data` summary).
- A local runner (`tools/bombadil-run.sh`, exposed as `just bombadil
  <demo>`) that builds the SPA, starts the fixture server on a dedicated
  port, runs the pinned CLI with a bounded time limit, always stops the
  server, cleans or overwrites the per-demo trace directory, and writes
  the trace under the gitignored `target/bombadil/<demo>/`.
- A scheduled non-blocking workflow that runs the suite per demo, uploads
  the trace artifact on every outcome (warning, not failure, when no
  trace exists), and never participates in pre-commit, pre-push, PR
  required checks or `ah check --run-tests`.
- A triage contract: a violation is reproduced from the retained trace
  with the printed `--reproduce` command (which omits the mutually
  exclusive time-limit/exit-on-violation flags), filed with the trace
  path and that command, then either fixed or removed until its
  precondition holds. No expected-fail allowlist in v1 — only properties
  expected to pass ship.
- Prerequisite fix: `tambor-yew` (plots ops total over the empty state).

Sections 1-5 (suite + baseline properties) are the approval scope.
Sections 6-8 (runner, nightly, triage) land after the baseline suite is
green. If no finding is triaged within eight weeks of the nightly
landing, remove the workflow and suite in a follow-up change.

## Impact

- Affected specs: `exploratory-verification` (new capability, all
  requirements ADDED). No corpus requirement edits.
- Affected code: new `bombadil/` tree (tsconfig, specs, helpers);
  `tools/bombadil-run.sh`; `justfile`; `eslint.config.js` (ignore
  `bombadil/`); `tests/e2e/gallery.html` (favicon so the default console
  property is not tripped); new `.github/workflows/bombadil-nightly.yml`;
  `package.json` gains an exact `@antithesishq/bombadil` devDependency.
- Depends on `add-spa-test-seams` for `?demo=` and `?debug=1`; the suite
  consumes both and assumes they are inert when absent.
- Affected tests: no existing suite changes; the exploratory suite is a
  new, separate signal with its own trace artifacts.
- Non-goals: native touch gesture fuzzing (Bombadil 0.7.10 has no touch
  action; Playwright's CDP touch lane stays authoritative); binding
  properties into espectacular contracts; a `spk compile --target
  bombadil` generator; replacing Playwright or vitest; making Bombadil a
  merge gate.