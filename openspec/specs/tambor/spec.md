---
id: spec
kind: intent
statement: "THE tambor library SHALL render a UI as a pure function of application state, where views are plain values, event handlers are pure functions that return effects, and a component edits parent state only through derived paths, all checked by strict TypeScript."
---

# tambor

Root spec for tambor, the strict-TypeScript, mobile-first port of the Clojure Membrane UI library (phronmophobic/membrane). Each child spec cites the Membrane source, test or example it was modelled from in its prose. The acceptance bar is the repo's own corpus: `test/membrane/component_test.clj`, `test/membrane/defui_test.clj`, and the `counter`, `todo`, `file_selector` and `kitchen_sink` examples. Reading order: typing.model, interop.model, view.model, view.layout, event.model, event.bubble, state.paths, path.derivation, component.model, effect.dispatch, app.toplevel, components.*, example.*, backend.render, ui.mobile.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| views_are_values | invariant | a view is a plain serialisable value; building one performs no I/O and no mutation | [[spec]] |
| handlers_are_pure | invariant | an event handler returns a list of effects and never mutates state directly | [[spec]] |
| backend_optional | invariant | the core (view, layout, events, paths, components) has zero DOM dependencies; only backends touch the DOM | [[spec]] |
| paths_not_callbacks | invariant | children change parent state by returning effects that carry paths, never by calling parent callbacks | [[spec]] |
| examples_are_acceptance | invariant | the counter and todo examples run unchanged against every backend and pass their scenarios in example.counter and example.todo | [[spec]] |
| typescript_strict | invariant | the whole library is strict TypeScript and ships declaration files, as specified in typing.model | [[spec]] |
| host_agnostic | invariant | squint and ClojureScript programs use the library with no adapter layer beyond an optional five-function data-ops object, as specified in interop.model | [[spec]] |
| mobile_first | invariant | every interaction reachable by mouse is reachable by touch with targets of at least 44 CSS px | [[spec]] |

## Model

### States

- `draft`
- `specified`
- `conformant`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_specify | draft | specified | [[spec.views_are_values]] |
| t_conform | specified | conformant | [[spec.examples_are_acceptance]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_values | unit | [[spec.views_are_values]] | random view trees | JSON round-trip of a view deep-equals the original, and its type is a member of the View union |
| p_pure | unit | [[spec.handlers_are_pure]] | random state and event | state is deep-equal before and after calling a handler |
| p_headless | unit | [[spec.backend_optional]] | import the core with no DOM | import succeeds and bounds of a label tree is computed |
| p_no_callbacks | unit | [[spec.paths_not_callbacks]] | scan component handlers | every state change appears as an effect in a returned list |
| p_examples | unit | [[spec.examples_are_acceptance]] | the scenario lists of both examples | every scenario passes on each backend |
| p_typescript | unit | [[spec.typescript_strict]] | build the package | tsc strict passes and declarations are emitted |
| p_host | unit | [[spec.host_agnostic]] | the todo example from TypeScript, squint and ClojureScript | the same effects result with no conversion calls |
| p_touch | unit | [[spec.mobile_first]] | all interactive nodes | every hit target is at least 44 by 44 |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_values

- **WHEN** random view trees
- **THEN** JSON round-trip of a view deep-equals the original, and its type is a member of the View union
- **VERIFIES** [[spec.p_values]]

#### Scenario: p_pure

- **WHEN** random state and event
- **THEN** state is deep-equal before and after calling a handler
- **VERIFIES** [[spec.p_pure]]

#### Scenario: p_headless

- **WHEN** import the core with no DOM
- **THEN** import succeeds and bounds of a label tree is computed
- **VERIFIES** [[spec.p_headless]]

#### Scenario: p_no_callbacks

- **WHEN** scan component handlers
- **THEN** every state change appears as an effect in a returned list
- **VERIFIES** [[spec.p_no_callbacks]]

#### Scenario: p_examples

- **WHEN** the scenario lists of both examples
- **THEN** every scenario passes on each backend
- **VERIFIES** [[spec.p_examples]]

#### Scenario: p_typescript

- **WHEN** build the package
- **THEN** tsc strict passes and declarations are emitted
- **VERIFIES** [[spec.p_typescript]]

#### Scenario: p_host

- **WHEN** the todo example from TypeScript, squint and ClojureScript
- **THEN** the same effects result with no conversion calls
- **VERIFIES** [[spec.p_host]]

#### Scenario: p_touch

- **WHEN** all interactive nodes
- **THEN** every hit target is at least 44 by 44
- **VERIFIES** [[spec.p_touch]]

