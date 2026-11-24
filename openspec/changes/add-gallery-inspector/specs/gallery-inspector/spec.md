# gallery.inspector Specification

## ADDED Requirements

### Requirement: The gallery renders a read-only debug panel

The gallery SHALL render, under the `?debug=1` opt-in, a host-DOM panel
showing the mounted demo's live state and a bounded log of dispatched
transitions, driven by the app's commit stream.

#### Scenario: p_live_state_pane
- **WHEN** the panel is wired to a mounted demo
- **THEN** the live pane renders the app's current plain-data state, and
  re-renders it after each dispatched commit
- **VERIFIES** [[gallery.inspector.p_fresh_after_draw]]

#### Scenario: p_log_entry_shape
- **WHEN** the app dispatches a batch
- **THEN** the log gains one entry carrying the commit's sequence, the
  applied intents, and the change kind (and reason when unknown)
- **VERIFIES** [[gallery.inspector.p_every_intent_logged]]

#### Scenario: p_demo_switch_rewires
- **WHEN** the gallery switches demos while the panel is open
- **THEN** the old subscription is dropped, the log resets, and the
  panel follows the freshly mounted app

### Requirement: The panel is strictly inert

The gallery inspector SHALL consume app state and commits without ever
mutating state, dispatching intents, or changing drawn output.

#### Scenario: p_never_mutates
- **WHEN** the panel is wired, dispatches occur, and both panes are read
- **THEN** the app state identity is unchanged by panel reads, the panel
  dispatches nothing, and drawn output (drawCount) reflects only the
  dispatch's own repaint
- **VERIFIES** [[gallery.inspector.p_consumes_never_mutates]]

### Requirement: The transition log is bounded and ordered

The gallery inspector SHALL keep at most a fixed number of log entries,
evicting the oldest first, and entries SHALL carry the commit's strictly
increasing sequence.

#### Scenario: p_ring_bound
- **WHEN** more dispatches occur than the log capacity
- **THEN** the log holds exactly capacity entries, the oldest evicted
- **VERIFIES** [[gallery.inspector.p_ring_bounded]]

#### Scenario: p_sequence_monotonic
- **WHEN** any number of dispatches occur
- **THEN** entry sequences are strictly increasing, starting at 1
- **VERIFIES** [[gallery.inspector.p_monotonic_sequence]]

### Requirement: Panel output is JSON-safe

The gallery inspector SHALL render only JSON-safe projections: every
log field and the live state projection serializes via JSON.stringify
without throwing, even for intents or state carrying function values.

#### Scenario: p_json_projection
- **WHEN** the app dispatches an intent whose args include a function,
  or the state carries a function value
- **THEN** the rendered log entry and live projection still serialize
  (marked, not thrown)
- **VERIFIES** [[gallery.inspector.p_json_safe]]
