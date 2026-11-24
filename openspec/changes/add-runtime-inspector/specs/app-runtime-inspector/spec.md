## ADDED Requirements

### Requirement: Disabled inspector is unobservable

The inspector SHALL be a runtime module that contacts an app only
while enabled: constructing it without enabling SHALL NOT subscribe to
the app, SHALL NOT read the clock, SHALL NOT queue any callback or
timer, and SHALL leave the phase-timer counters at their disabled
defaults, so a run with an unenabled inspector is observationally
identical to a run without one and the App interface gains no members.

#### Scenario: unenabled factory has zero app contact

- **WHEN** `createInspector({ app })` is constructed and never enabled
- **THEN** the app's subscribe was never called by the inspector, the
  animation-frame stub's queue stays empty, `counters()` reads the
  disabled zeros, and both drains return empty

#### Scenario: imported but disabled changes no behavior

- **WHEN** an app built exactly as before the change runs with the
  inspector module imported but never enabled
- **THEN** its dispatch and draw behavior is unchanged — the same
  scripted dispatch set produces the same backend draw and rebuild
  counts as a run without the module

### Requirement: Enabled inspector records every commit as plain data

While enabled, the inspector SHALL record one frozen plain-data commit
record per delivered `DispatchCommit` — sequence, ChangeSet kind with
the known path count or the unknown reason, and a clock stamp — into a
bounded ring (512 records, overwrite-oldest), SHALL NOT retain state
identities unless retention is explicitly `"states"`, and SHALL hand
records out only through destructive drains of frozen data.

#### Scenario: burst records one commit record per dispatch

- **WHEN** 80 state-effect dispatches run while the inspector is
  enabled
- **THEN** the drain returns 80 frozen commit records with strictly
  increasing sequences matching the app's 1..80, each carrying a clock
  stamp, and the app's own sequence behavior is unperturbed

#### Scenario: unknown changes record the reason

- **WHEN** a custom unannotated handler effect dispatches while
  enabled
- **THEN** its commit record carries `kind: "unknown"` with the
  handler reason, exactly as the landed ChangeSet reported it

#### Scenario: default retention holds no states

- **WHEN** retention is the default and commits are recorded
- **THEN** the drained records expose no `previousState`/`state`
  fields

#### Scenario: states retention exposes both references

- **WHEN** retention is `"states"` and commits are recorded
- **THEN** the drained records expose both `previousState` and
  `state` references, bounded by the ring

#### Scenario: ring bound overwrites oldest

- **WHEN** 600 dispatches run while enabled
- **THEN** the drain returns at most the last 512 commit records in
  sequence order and the dispatch pass completes unbroken

### Requirement: Enabled inspector records a per-frame ledger

While enabled on a host with animation frames, the inspector SHALL
produce one ledger record per non-idle frame grouping that frame's
commits with the phase-timer counter deltas across it, and SHALL close
each record after the frame's callbacks; hosts without animation
frames SHALL record commits only; idle frames SHALL record nothing.

#### Scenario: burst explains one draw

- **WHEN** 80 routed dispatches land inside one fake frame under the
  coalesced mount and the frame pumps
- **THEN** exactly one ledger record exists for the frame, carrying
  all 80 commit records, a draw delta of 1, and the `drew`
  classification — the record closed after the frame's callbacks, so
  the frame's draw did not land in the next frame's record

### Requirement: Ledger records classify by the counter predicate

Each ledger record SHALL carry a classification defined BY THE COUNTER
PREDICATE alone: `drew` when the draw delta ≥ 1; `skipped` when the
derive delta ≥ 1 and the rebuild and draw deltas are both 0. There is
no third classification.

#### Scenario: skip is explained

- **WHEN** a dispatch changes only an undrawn memo-stable slice and
  the frame pumps
- **THEN** the ledger classifies that frame `skipped` — derive delta
  at least 1, rebuild and draw deltas 0

#### Scenario: no-rAF host records commits only

- **WHEN** the inspector is enabled on a host without
  `requestAnimationFrame`
- **THEN** commit records still flow and no ledger record is ever
  produced, while `counters()` remains readable

#### Scenario: idle frames are silent

- **WHEN** frames pass with no commits, zero counter deltas and no
  timing records
- **THEN** no ledger records are added and the frame ring length is
  unchanged

#### Scenario: commit without counter deltas records nothing

- **WHEN** a frame carries published commits but zero counter deltas
  across it
- **THEN** no ledger record is added — idle silence wins over commit
  presence, and no third classification is introduced

### Requirement: Construction requires a subscribe-capable app

`createInspector({ app })` SHALL require a subscribe-capable app and
SHALL throw a clear error naming that requirement at construction
when `app.subscribe` is absent.

#### Scenario: construction without subscribe throws

- **WHEN** `createInspector({ app })` is given an app that omits
  `subscribe`
- **THEN** construction throws with an error naming the
  subscribe-capable-app requirement, before any subscription or
  recording state exists

### Requirement: Enable and disable lifecycle is clean and resets nothing on the app

`enable()` SHALL subscribe through the landed `App.subscribe`, start
the frame sampling, and turn the phase timers on (recording their
prior state); `disable()` SHALL unsubscribe, stop sampling, clear the
inspector's rings, and restore the prior timer state; the app SHALL
keep its sequence, its subscribers and its semantics across the whole
lifecycle.

#### Scenario: construction without subscribe throws

- **WHEN** `createInspector({ app })` is given an app that omits
  `subscribe`
- **THEN** construction throws with an error naming the
  subscribe-capable-app requirement, before any subscription or
  recording state exists

#### Scenario: disable stops and clears

- **WHEN** `disable()` runs after recording
- **THEN** the app's unsubscribe is invoked, both drains return empty,
  a subsequent dispatch records nothing, and the app's commit sequence
  continues increasing

#### Scenario: re-enable resumes fresh

- **WHEN** `enable()` runs again after a disable
- **THEN** recording resumes with empty rings while the app's
  sequence continues from where it left off — nothing on the app is
  reset

#### Scenario: enable over enabled timers restores enabled

- **WHEN** the inspector enables over already-enabled phase timers and
  then disables
- **THEN** the timers remain enabled for their prior owner

#### Scenario: enable over disabled timers restores disabled

- **WHEN** the inspector enables over disabled phase timers and then
  disables
- **THEN** the timers remain disabled

### Requirement: Recording never alters app semantics

The inspector's recording listener SHALL NOT dispatch, SHALL NOT
schedule work, and SHALL NOT throw, so dispatch semantics, draw and
rebuild counts, and the pinned state-equivalence contract are identical
with the inspector attached and enabled versus absent.

#### Scenario: draw counts identical with recording on

- **WHEN** the same scripted dispatch set runs on a spy backend with
  the inspector enabled versus with no inspector at all
- **THEN** the backend draw and rebuild counts are equal in both runs

#### Scenario: state equivalence stays green

- **WHEN** the pinned stream-dashboard state-equivalence contract runs
  with the inspector attached and enabled
- **THEN** it passes unchanged

#### Scenario: ring pressure cannot break a delivery pass

- **WHEN** the commit ring overflows during a dispatch burst
- **THEN** the dispatch completes normally, the delivery pass surfaces
  no error, and the oldest records are simply overwritten
