## ADDED Requirements

### Requirement: Isolated exploratory specification suite

The repository SHALL keep Bombadil specifications under `bombadil/` with
their own DOM-enabled TypeScript configuration, outside the vitest
include, the root tsconfig include and eslint's source scope, and SHALL
pin the Bombadil package to an exact version. `bombadil/` SHALL be listed
in `eslint.config.js` ignores so `npx eslint .` does not process it.

#### Scenario: suite typechecks independently

- **WHEN** the suite's own TypeScript config runs
- **THEN** every specification and helper typechecks with the DOM library,
  and the root `tsc` and `eslint` runs do not include `bombadil/`

#### Scenario: version is explicit

- **WHEN** dependencies and workflow inputs are inspected
- **THEN** `package.json` names an exact `@antithesishq/bombadil` version
  and the workflow names both the action major and an exact Bombadil
  version

### Requirement: Per-demo exploratory runs

Each exploratory run SHALL start at the e2e fixture with a single demo
selected through the `demo` query parameter. Action generators SHALL
return no actions until the selected demo's drawn root exists, so the
first actionable state is the mounted demo. Exported action generators
SHALL keep actions inside the demo stage, and the default action
generators SHALL NOT be exported.

#### Scenario: run starts on the selected demo

- **WHEN** a run starts with `?demo=plots`
- **THEN** no action is generated while the loading placeholder is the
  only stage content, and the first generated action occurs after the
  plots demo is mounted

#### Scenario: actions stay in the stage

- **WHEN** a run's action generators are evaluated
- **THEN** generated clicks and drags target `#demo > div` and no
  generated action targets a nav button

#### Scenario: default actions are not re-exported

- **WHEN** the top-level spec's exports are inspected
- **THEN** the default `clicks`, `inputs`, `scroll` and navigation
  generators are absent and only stage-scoped generators are present

### Requirement: Baseline property suite

The suite SHALL export the browser default safety properties and
dedicated counter, todo, select and plots properties, each expected to
pass at HEAD. A violation of any exported property SHALL produce exit
code 2 and a trace.

#### Scenario: default safety properties are active

- **WHEN** a demo run executes
- **THEN** uncaught exceptions, unhandled promise rejections, console
  errors and the initial navigation response status are checked on every
  captured state

#### Scenario: counter changes by at most one

- **WHEN** any stage action runs on the counter demo
- **THEN** the next counter value is the previous value, the previous
  value plus one, or the previous value minus one

#### Scenario: todo rows agree with model state

- **WHEN** the todo demo is in any filter state
- **THEN** the number of drawn todo rows (delete-X pairs divided by two)
  equals the number of todos the model's selected filter keeps

#### Scenario: select list follows the open flag

- **WHEN** the select demo is captured in any state
- **THEN** option labels inside the open list are drawn exactly when the
  model's open flag is true

#### Scenario: plots charts stay consistent

- **WHEN** the plots demo receives any op ordering, including Pan or Zoom
  before Load
- **THEN** both charts draw the same band count, that count is between 0
  and BAND_COUNT, and zero bands coincide with the `no data` summary

### Requirement: Local exploratory runner

A single documented command SHALL accept a demo name, build the SPA,
start the static fixture server on a dedicated port, run the pinned CLI
against exactly that demo with a bounded time limit, stop the server on
every exit path, and write the trace to a gitignored per-demo path.
Repeated runs SHALL succeed without manual cleanup.

#### Scenario: runner preserves the CLI status

- **WHEN** a run ends with a property violation
- **THEN** the command exits non-zero and prints the trace path and the
  inspect/reproduce commands

#### Scenario: repeated runs succeed

- **WHEN** the same demo runs twice in a row
- **THEN** both runs write a trace without an output-path collision

#### Scenario: server cleanup and port isolation

- **WHEN** the run completes, fails or is interrupted
- **THEN** the fixture server process is stopped, and the run does not
  reuse another server's port or bundle

#### Scenario: fixture has no console noise

- **WHEN** the default specification runs against the fixture
- **THEN** no favicon or static-resource 404 appears as a console error

### Requirement: Non-blocking nightly workflow

A scheduled workflow SHALL run the suite per demo with the pinned action
and version, upload the trace artifact on every outcome (warning, not
failure, when no trace exists), support manual dispatch for one demo,
and SHALL NOT be part of pre-commit, pre-push, PR required checks or
`ah check --run-tests`.

#### Scenario: scheduled run publishes evidence

- **WHEN** the nightly workflow completes with a violation
- **THEN** the job reports failure, the trace artifact is downloadable,
  and required merge gates are unaffected

#### Scenario: a failed run without a trace does not hide the failure

- **WHEN** the run fails before writing `trace.jsonl`
- **THEN** the artifact step warns instead of masking the job failure and
  the job log remains available

#### Scenario: manual single-demo dispatch

- **WHEN** the workflow is dispatched with a demo name
- **THEN** only that demo runs

### Requirement: Violation triage loop

A violation SHALL be reproducible from the retained trace, and the
finding SHALL be filed with the demo, property, trace path and the
printed `--reproduce` command. That command omits the mutually exclusive
`--time-limit` and `--exit-on-violation` flags. The property SHALL then
be fixed, or removed from the suite until its precondition holds.

#### Scenario: trace reproduces the violation

- **WHEN** a retained trace is downloaded and replayed with the printed
  command
- **THEN** the same property violation is reported

#### Scenario: finding is recorded

- **WHEN** a new violation is triaged
- **THEN** a bd issue names the demo, property, trace path and reproduce
  command