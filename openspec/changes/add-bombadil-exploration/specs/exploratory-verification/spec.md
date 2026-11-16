## ADDED Requirements

### Requirement: Isolated exploratory specification suite

The repository SHALL keep Bombadil specifications under `bombadil/` with
their own DOM-enabled TypeScript configuration, outside the vitest
include, the root tsconfig include and the eslint source scope, and SHALL
pin the Bombadil package to an exact version.

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
selected through the `demo` query parameter, and its exported action
generators SHALL keep actions inside the demo stage so no run switches
demos.

#### Scenario: run starts on the selected demo

- **WHEN** a run starts with `?demo=virtual-list`
- **THEN** the first captured state is the mounted virtual-list demo and
  no nav click is required

#### Scenario: actions stay in the stage

- **WHEN** a run's action generators are evaluated
- **THEN** generated clicks and drags target `#demo > div` and no
  generated action targets a nav button

### Requirement: Baseline property suite

The suite SHALL export the browser default safety properties and at least
the counter, todo, select and plots properties, each expected to pass at
HEAD. A violation of any exported property SHALL produce exit code 2 and
a trace.

#### Scenario: default safety properties are active

- **WHEN** a demo run executes
- **THEN** uncaught exceptions, unhandled promise rejections, console
  errors and HTTP 4xx/5xx responses are checked on every captured state

#### Scenario: counter changes by at most one

- **WHEN** any stage action runs on the counter demo
- **THEN** the next counter value is the previous value, the previous
  value plus one, or the previous value minus one

#### Scenario: todo rows agree with model state

- **WHEN** the todo demo is in any filter state
- **THEN** the number of drawn todo rows equals the number of todos the
  model's selected filter keeps

#### Scenario: select list follows the open flag

- **WHEN** the select demo is captured in any state
- **THEN** option rows are drawn exactly when the model's open flag is
  true

#### Scenario: plots ops never raise

- **WHEN** the plots demo receives any op ordering, including Pan or Zoom
  before Load
- **THEN** no uncaught exception or unhandled rejection is recorded

### Requirement: Local exploratory runner

A single documented command SHALL build the SPA, start the static fixture
server, run the pinned CLI against a named demo with a bounded time
limit, stop the server on every exit path, and write the trace to a
gitignored path.

#### Scenario: runner preserves the CLI status

- **WHEN** a run ends with a property violation
- **THEN** the command exits non-zero and prints the trace path and the
  inspect/reproduce commands

#### Scenario: server cleanup

- **WHEN** the run completes, fails or is interrupted
- **THEN** the fixture server process is stopped

### Requirement: Non-blocking nightly workflow

A scheduled workflow SHALL run the suite per demo with the pinned action
and version, upload the trace artifact on every outcome, support manual
dispatch for one demo, and SHALL NOT be part of pre-commit, pre-push, PR
required checks or `ah check --run-tests`.

#### Scenario: scheduled run publishes evidence

- **WHEN** the nightly workflow completes with a violation
- **THEN** the job reports failure, the trace artifact is downloadable,
  and required merge gates are unaffected

#### Scenario: manual single-demo dispatch

- **WHEN** the workflow is dispatched with a demo name
- **THEN** only that demo runs

### Requirement: Violation triage loop

A violation SHALL be reproducible from the retained trace, and the
finding SHALL be filed with the demo, property, trace path and reproduce
command. The property SHALL then be fixed, or removed from the suite
until its precondition holds.

#### Scenario: trace reproduces the violation

- **WHEN** a retained trace is downloaded and replayed with the same
  options
- **THEN** the same property violation is reported

#### Scenario: finding is recorded

- **WHEN** a new violation is triaged
- **THEN** a bd issue names the demo, property, trace path and reproduce
  command