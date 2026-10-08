---
id: effect.dispatch
kind: intent
statement: "WHEN a handler returns effects THE dispatcher SHALL apply them in order against the state and then trigger exactly one repaint."
---

# effect.dispatch

Port of `defeffect`, `dispatch!`, `default-handler` and `make-app`. Effects are typed data: `["update", path, fn, ...args]`, a member of the Effect union in typing.model. A registered effect is a function whose first parameter is `dispatch`, so effects compose (`counter-increment` is `dispatch(update, $num, inc)`). `dispatch` is overloaded in the original: a bare keyword is a single effect, a sequence of effects is a batch, and `type, ...args` is one effect. An unknown type is logged through `tap>` and returns nil, and it never throws. `make-app` accepts an initial state or an atom and an optional handler, wraps the handler to skip empty or nil batches, and returns a view function.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| effects_are_data | invariant | an effect is a plain array whose first element is its type, and its arguments are JSON-serialisable except update functions | [[effect.dispatch]] |
| ordered_application | invariant | effects in a batch are applied strictly in order | [[effect.dispatch]] |
| builtin_update | invariant | update(path, f, ...args) replaces the value at path with f(old, ...args) | [[effect.dispatch]] |
| builtin_set_get_delete | invariant | set stores a value at path, get returns the value at path, and delete removes it | [[effect.dispatch]] |
| dispatch_overloads | invariant | dispatch accepts a single effect type, a single effect with args, or a sequence of effect vectors | [[effect.dispatch]] |
| unknown_effect_skipped | invariant | an unknown type is reported and skipped, returns nil, and the rest of the batch still runs | [[effect.dispatch]] |
| compose_via_dispatch | invariant | a registered effect receives dispatch first and any effect it dispatches is applied before it returns | [[effect.dispatch]] |
| registry_global | invariant | defeffect registers the handler in a global registry under its namespaced type and also exposes the function by name for isolated tests | [[effect.dispatch]] |
| args_captured_at_render | invariant | effect arguments are values captured when the handler returned, so add-todo then set next-todo-text to empty adds the text that was there at click time | [[effect.dispatch]] |
| empty_batch_noop | invariant | an empty or nil batch calls no handler and triggers no repaint | [[effect.dispatch]] |
| single_repaint | invariant | a batch triggers one repaint, scheduled on the next animation frame | [[effect.dispatch]] |
| handler_overridable | extension_point | an app may supply its own dispatch function for tests, undo history or an external store | [[effect.dispatch]] |
| make_app_state_forms | invariant | make-app accepts either a plain initial state or an atom-like cell, and uses the cell as given when it is one | [[effect.dispatch]] |
| container_size_injected | invariant | when the backend gives a container size it is placed in the context under the stretch container-size key before render | [[effect.dispatch]] |
| counter_effects | invariant | counter-increment updates a path with inc, and add-counter updates a path with conj of 0 | [[effect.dispatch]] |
| clipboard_effects | invariant | clipboard-copy and clipboard-cut write the string to the system clipboard through the backend | [[effect.dispatch]] |

## Model

### States

- `quiescent`
- `applying`
- `repaint_pending`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_receive | quiescent | applying | [[effect.dispatch.empty_batch_noop]] |
| t_applied | applying | repaint_pending | [[effect.dispatch.ordered_application]] |
| t_painted | repaint_pending | quiescent | [[effect.dispatch.single_repaint]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_data | unit | [[effect.dispatch.effects_are_data]] | random effects | JSON round-trip preserves effects with no function argument, and an update effect keeps its function by reference |
| p_order | unit | [[effect.dispatch.ordered_application]] | random batches of sets | final state equals sequential application |
| p_update | unit | [[effect.dispatch.builtin_update]] | random paths and fns | value at path equals f(old, ...args) |
| p_set_get_delete | unit | [[effect.dispatch.builtin_set_get_delete]] | random paths | set then get returns the value and delete then get returns undefined |
| p_overloads | unit | [[effect.dispatch.dispatch_overloads]] | the three call forms | all three apply the same effect |
| p_unknown | unit | [[effect.dispatch.unknown_effect_skipped]] | batch with an unknown type | later effects still apply and nothing throws |
| p_compose | unit | [[effect.dispatch.compose_via_dispatch]] | counter-increment | dispatching it increments the number at the path |
| p_registry | unit | [[effect.dispatch.registry_global]] | defining an effect | it is both dispatchable by type and callable directly |
| p_captured | unit | [[effect.dispatch.args_captured_at_render]] | button click with next-todo-text hello | state ends with a todo hello and next-todo-text empty |
| p_empty | unit | [[effect.dispatch.empty_batch_noop]] | empty batch | no repaint and no handler call |
| p_repaint | unit | [[effect.dispatch.single_repaint]] | batch of N effects | exactly one repaint is scheduled |
| p_override | unit | [[effect.dispatch.handler_overridable]] | custom dispatch | the custom function receives every effect |
| p_state_forms | unit | [[effect.dispatch.make_app_state_forms]] | plain state and cell | both run and the cell is shared not copied |
| p_container | unit | [[effect.dispatch.container_size_injected]] | resize to 320 by 640 | context holds that size at the next render |
| p_counter_effects | unit | [[effect.dispatch.counter_effects]] | num 10 and nums 0, 1, 2 | num becomes 11 and nums becomes 0, 1, 2, 0 |
| p_clipboard_effects | unit | [[effect.dispatch.clipboard_effects]] | copy hello | the backend clipboard receives hello |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_data

- **WHEN** random effects
- **THEN** JSON round-trip preserves effects with no function argument, and an update effect keeps its function by reference
- **VERIFIES** [[effect.dispatch.p_data]]

#### Scenario: p_order

- **WHEN** random batches of sets
- **THEN** final state equals sequential application
- **VERIFIES** [[effect.dispatch.p_order]]

#### Scenario: p_update

- **WHEN** random paths and fns
- **THEN** value at path equals f(old, ...args)
- **VERIFIES** [[effect.dispatch.p_update]]

#### Scenario: p_set_get_delete

- **WHEN** random paths
- **THEN** set then get returns the value and delete then get returns undefined
- **VERIFIES** [[effect.dispatch.p_set_get_delete]]

#### Scenario: p_overloads

- **WHEN** the three call forms
- **THEN** all three apply the same effect
- **VERIFIES** [[effect.dispatch.p_overloads]]

#### Scenario: p_unknown

- **WHEN** batch with an unknown type
- **THEN** later effects still apply and nothing throws
- **VERIFIES** [[effect.dispatch.p_unknown]]

#### Scenario: p_compose

- **WHEN** counter-increment
- **THEN** dispatching it increments the number at the path
- **VERIFIES** [[effect.dispatch.p_compose]]

#### Scenario: p_registry

- **WHEN** defining an effect
- **THEN** it is both dispatchable by type and callable directly
- **VERIFIES** [[effect.dispatch.p_registry]]

#### Scenario: p_captured

- **WHEN** button click with next-todo-text hello
- **THEN** state ends with a todo hello and next-todo-text empty
- **VERIFIES** [[effect.dispatch.p_captured]]

#### Scenario: p_empty

- **WHEN** empty batch
- **THEN** no repaint and no handler call
- **VERIFIES** [[effect.dispatch.p_empty]]

#### Scenario: p_repaint

- **WHEN** batch of N effects
- **THEN** exactly one repaint is scheduled
- **VERIFIES** [[effect.dispatch.p_repaint]]

#### Scenario: p_override

- **WHEN** custom dispatch
- **THEN** the custom function receives every effect
- **VERIFIES** [[effect.dispatch.p_override]]

#### Scenario: p_state_forms

- **WHEN** plain state and cell
- **THEN** both run and the cell is shared not copied
- **VERIFIES** [[effect.dispatch.p_state_forms]]

#### Scenario: p_container

- **WHEN** resize to 320 by 640
- **THEN** context holds that size at the next render
- **VERIFIES** [[effect.dispatch.p_container]]

#### Scenario: p_counter_effects

- **WHEN** num 10 and nums 0, 1, 2
- **THEN** num becomes 11 and nums becomes 0, 1, 2, 0
- **VERIFIES** [[effect.dispatch.p_counter_effects]]

#### Scenario: p_clipboard_effects

- **WHEN** copy hello
- **THEN** the backend clipboard receives hello
- **VERIFIES** [[effect.dispatch.p_clipboard_effects]]

