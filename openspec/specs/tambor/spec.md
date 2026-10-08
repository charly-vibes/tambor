---
id: tambor
kind: intent
statement: "THE tambor library SHALL render a UI as a pure function of application state, where views are plain values, event handlers are pure functions that return effects, and a component edits parent state only through derived paths, all checked by strict TypeScript."
---

# tambor

Root spec for tambor, the strict-TypeScript, mobile-first port of the Clojure Membrane UI library (phronmophobic/membrane). Each child spec cites the Membrane source, test or example it was modelled from in its prose. The acceptance bar is the repo's own corpus: `test/membrane/component_test.clj`, `test/membrane/defui_test.clj`, and the `counter`, `todo`, `file_selector` and `kitchen_sink` examples. Reading order: typing.model, interop.model, view.model, view.layout, event.model, event.bubble, state.paths, path.derivation, component.model, effect.dispatch, app.toplevel, components.*, example.*, backend.render, ui.mobile.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| views_are_values | invariant | a view is a plain serialisable value; building one performs no I/O and no mutation | [[tambor]] |
| handlers_are_pure | invariant | an event handler returns a list of effects and never mutates state directly | [[tambor]] |
| backend_optional | invariant | the core (view, layout, events, paths, components) has zero DOM dependencies; only backends touch the DOM | [[tambor]] |
| paths_not_callbacks | invariant | children change parent state by returning effects that carry paths, never by calling parent callbacks | [[tambor]] |
| examples_are_acceptance | invariant | the counter and todo examples run unchanged against every backend and pass their scenarios in example.counter and example.todo | [[tambor]] |
| typescript_strict | invariant | the whole library is strict TypeScript and ships declaration files, as specified in typing.model | [[tambor]] |
| host_agnostic | invariant | ClojureScript programs use the library with no adapter layer beyond an optional five-function data-ops object, as specified in interop.model | [[tambor]] |
| mobile_first | invariant | every interaction reachable by mouse is reachable by touch with targets of at least 44 CSS px | [[tambor]] |

## Model

### States

- `draft`
- `specified`
- `conformant`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_specify | draft | specified | [[tambor.views_are_values]] |
| t_conform | specified | conformant | [[tambor.examples_are_acceptance]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_values | unit | [[tambor.views_are_values]] | random view trees | JSON round-trip of a view deep-equals the original, and its type is a member of the View union |
| p_pure | unit | [[tambor.handlers_are_pure]] | random state and event | state is deep-equal before and after calling a handler |
| p_headless | unit | [[tambor.backend_optional]] | import the core with no DOM | import succeeds and bounds of a label tree is computed |
| p_no_callbacks | unit | [[tambor.paths_not_callbacks]] | scan component handlers | every state change appears as an effect in a returned list |
| p_examples | unit | [[tambor.examples_are_acceptance]] | the scenario lists of both examples | every scenario passes on each backend |
| p_typescript | unit | [[tambor.typescript_strict]] | build the package | tsc strict passes and declarations are emitted |
| p_host | unit | [[tambor.host_agnostic]] | the todo example from TypeScript and ClojureScript | the same effects result with no conversion calls |
| p_touch | unit | [[tambor.mobile_first]] | all interactive nodes | every hit target is at least 44 by 44 |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_values

- **WHEN** random view trees
- **THEN** JSON round-trip of a view deep-equals the original, and its type is a member of the View union
- **VERIFIES** [[tambor.p_values]]

#### Scenario: p_pure

- **WHEN** random state and event
- **THEN** state is deep-equal before and after calling a handler
- **VERIFIES** [[tambor.p_pure]]

#### Scenario: p_headless

- **WHEN** import the core with no DOM
- **THEN** import succeeds and bounds of a label tree is computed
- **VERIFIES** [[tambor.p_headless]]

#### Scenario: p_no_callbacks

- **WHEN** scan component handlers
- **THEN** every state change appears as an effect in a returned list
- **VERIFIES** [[tambor.p_no_callbacks]]

#### Scenario: p_examples

- **WHEN** the scenario lists of both examples
- **THEN** every scenario passes on each backend
- **VERIFIES** [[tambor.p_examples]]

#### Scenario: p_typescript

- **WHEN** build the package
- **THEN** tsc strict passes and declarations are emitted
- **VERIFIES** [[tambor.p_typescript]]

#### Scenario: p_host

- **WHEN** the todo example from TypeScript and ClojureScript
- **THEN** the same effects result with no conversion calls
- **VERIFIES** [[tambor.p_host]]

#### Scenario: p_touch

- **WHEN** all interactive nodes
- **THEN** every hit target is at least 44 by 44
- **VERIFIES** [[tambor.p_touch]]

