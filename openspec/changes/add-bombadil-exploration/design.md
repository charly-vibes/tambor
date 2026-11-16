# Design: add-bombadil-exploration

## Context

Bombadil 0.7.10 (latest npm release, 2026-11-04) drives a real browser,
captures states, evaluates temporal formulas (`always`, `eventually`,
`next`, `now`, logical connectives), and picks actions from weighted
generators. Its browser defaults cover uncaught exceptions, unhandled
rejections, console errors and HTTP errors. The `browser/extras/resources`
module adds sliding-window leak checks. Traces are files: `inspect` opens
an interactive view, `trace --json` is machine-readable, `--reproduce`
replays a trace, and `shrink` minimizes (experimental). Exit code 2 means
a property violation.

Tambor's e2e fixture (`tests/e2e/gallery.html`) loads the real bundle
from `demo-dist/` and pins the stage geometry; `tests/e2e/serve.mjs`
serves it. The SPA entry currently boots the first demo and exposes no
state. `add-spa-test-seams` adds `?demo=<id>` and `?debug=1`.

## Goals / Non-Goals

- Goals: find host-layer defects under action orderings the scripted
  suite misses; keep the signal reproducible through traces; keep the
  existing gates untouched; start with a small expected-pass suite.
- Non-Goals: exhaustive coverage, visual regression, trusted touch input,
  per-contract binding, corpus-generated specs, blocking merges.

## Decisions

### D1. One demo per run, selected by `?demo=`

Properties evaluated across demo switches conflate three state lifecycles
and make assertions like "row count changes by one" false on mount resets.
The sandbox run hit exactly this: a todo row-count property broke on nav
and filter actions. A run starts on one demo and exports only actions that
stay inside `#demo > div`; nav buttons are never clicked.

### D2. Expected-pass properties only, no allowlist

Bombadil has no `test.fail` equivalent; a wrapper that swallows known
violations would hide regressions in the same run. Ship properties that
pass at HEAD; known corpus facts that currently fail (380 px overflow,
44 px touch targets) remain in `risks.spec.ts` until their fixes land and
then get a property. A red suite therefore always means a new finding.

### D3. Nightly and non-blocking

Exploration is nondeterministic and time-bounded (60 s locally, minutes
in CI). It must not enter lefthook, PR required checks or
`ah check --run-tests`: the contract gate's batching budget and the flake
history make that a net loss. The scheduled job reports and uploads; a
human decides whether a failure blocks a release.

### D4. Defaults for safety properties, custom actions for reach

Import the default properties, but not the default action generators —
they click nav and navigation controls. Export curated generators: real
`<button>`/`<textarea>` clicks inside the stage (the drawn tree is real
DOM since `tambor-huu`), surface clicks by geometry for the whole stage,
drag, scroll and key presses. Re-exporting the default `clicks` alongside
a filtered copy would still allow the unfiltered actions; the manual
warns about exactly this, so the original is not exported.

### D5. Model assertions use the debug snapshot

DOM text alone cannot distinguish "filter hides rows" from "delete
removed rows". `__tambor.state()` and `__tambor.view()` let extractors
return derived numbers (visible row count, filter name, open flag) and
compare them to DOM counts. This is why `add-spa-test-seams` is a
prerequisite, not an optional nicety.

### D6. No touch fuzzing in v1

Bombadil 0.7.10's action set has no touch action. Synthetic `TouchEvent`
dispatch from a custom action is untrusted input and would test the
listeners, not the browser's touch synthesis. Playwright's CDP touch lane
stays the authority; a custom touch generator can be evaluated later.

### D7. No espectacular or `spk` integration in v1

A Bombadil run is stochastic and time-based; `[[tests.shell]]` would
replay a full run per contract inside the gate. Per-property attribution
requires parsing `trace.jsonl` into a report tool, which is worth doing
only after the suite has a history. A `spk` compile target is an upstream
specodelic change and would create a second spec source in the meantime.

### D8. Pin both versions independently

`package.json` pins the exact CLI (`0.7.10`); the workflow pins the action
major (`@v3`) and its `version` input (`0.7.10`). The action's default
version lags (0.7.3), so relying on it silently changes the tool. A bump
is a dedicated change with a full local run.

### D9. Chrome is the action's or the environment's job

CI uses the action's Chrome for Testing install (cached). Locally the
runner honors `CHROME=<path>`; the developer points it at the Playwright
cache or a system Chrome. The runner never downloads a browser itself.

## Risks / Trade-offs

- [Nondeterministic findings] → retain traces, require `--reproduce`
  before filing, and shrink when the trace is long.
- [Tool churn in a young 0.7.x] → exact pins, dedicated upgrade change,
  no reliance on defaults beyond exported names.
- [Selector drift] → geometry-based stage clicks plus fingerprints;
  adding `data-id` remains a separate recorded improvement.
- [CI cost] → per-demo matrix with short time limits and concurrency
  cancellation; nightly only.
- [Duplicate coverage] → scope properties to host/integration behavior;
  pure core stays with fast-check.
- [A green suite means little if properties are weak] → each property is
  tied to a corpus row and reviewed like a test; the plots demo exists in
  the matrix because that is where a real defect was found.
- [Trace size] → artifact retention is bounded by the workflow's
  retention policy; local traces live under gitignored `target/`.