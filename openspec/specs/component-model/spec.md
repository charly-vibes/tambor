---
id: spec
kind: intent
statement: "THE component system SHALL let a component declare props through one map argument and give every prop a value, a path, an optional default and an optional contextual source."
---

# component.model

Port of `defui` (`component.cljc`) as exercised by `defui_test.clj`. A component takes exactly one argument, a symbol or a map with `:keys`, `:or` and `:as`. In TypeScript that is one props object whose type is inferred (typing.model component_generic and dollar_keys_derived). Every declared key `k` has a value `k` and a path `$k`. Two keys are implicit: `extra` (per-call-site scratch state such as hover flags and scroll offsets, stored under `::extra` of the parent) and `context` (state shared down the whole tree, such as `focus`). A key tagged `contextual` takes its value from `context[k]` and its path from `[$context, keypath k]`; textarea uses it for `focus`. In `defui_test`, `child` has props `a`, `b`, `c` with `a` defaulting to 42 and `c` contextual; `parent` calls `(child m)` with a non-literal map.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| single_map_arg | invariant | a component declaration has exactly one parameter, either a symbol or a map pattern, and anything else is rejected at definition time | [[spec]] |
| prop_has_path | invariant | for every declared prop p the component receives both p and dollar p | [[spec]] |
| path_resolves | invariant | select(state, dollar p) deep-equals p at render time | [[spec]] |
| implicit_extra_context | invariant | every component also receives extra and context with their paths, even when not declared | [[spec]] |
| defaults_applied | invariant | when a prop is absent or nil and a default is declared the default is the value, and the path carries a nilToVal step | [[spec]] |
| contextual_source | invariant | a contextual prop reads its value from context[p] and its path is the context path plus keypath p, and the call site cannot override it | [[spec]] |
| as_binding_whole_map | invariant | an as name is bound to the complete props map including filled-in defaults | [[spec]] |
| literal_call_paths | invariant | when called with a literal map, each key's path is the path expression written for it, and an explicit dollar key in the map wins | [[spec]] |
| nonliteral_call_fill | invariant | when called with a non-literal map value m, each missing dollar key is filled from m when m contains the key and from the call site extra otherwise | [[spec]] |
| nonliteral_missing_vals | invariant | for a non-literal call, missing values are filled from extra, then from the default, and contextual values from context | [[spec]] |
| call_site_identity | invariant | the extra of a child is addressed by a key derived from the sorted explicit prop paths, so the same call site keeps the same extra across renders and different call sites get different extra | [[spec]] |
| render_pure | invariant | render depends only on props, path values, extra and context | [[spec]] |
| render_cached | advisory | an equal props map yields a cached render keyed by component name plus props, and the cache is reset when any component is redefined | [[spec]] |
| event_forwarding | invariant | a component forwards pointer, key, key-event and global-move events to its rendered view, and answers the has-* queries from it | [[spec]] |
| clipboard_forwarding | advisory | the original leaves clipboard events unforwarded by default and the port forwards them so that textarea copy and paste work | [[spec]] |
| sizing_props | invariant | a component declaring width or height as props supports setWidth and setHeight by assoc, and stretch flags are read from its stretch props | [[spec]] |
| recursive_components | invariant | a component may call itself and the derivation treats the recursive call as a component call | [[spec]] |

## Model

### States

- `declared`
- `rendered`
- `cached`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_render | declared | rendered | [[spec.render_pure]] |
| t_cache | rendered | cached | [[spec.path_resolves]] |
| t_redefine | cached | declared | [[spec.single_map_arg]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_single_arg | unit | [[spec.single_map_arg]] | two-parameter and zero-parameter declarations | both are rejected |
| p_prop_path | unit | [[spec.prop_has_path]] | random prop sets | every prop has a path counterpart |
| p_path_get | unit | [[spec.path_resolves]] | random state and paths | select equals the prop value |
| p_implicit | unit | [[spec.implicit_extra_context]] | a component that declares neither | extra, context and their paths are present |
| p_defaults | unit | [[spec.defaults_applied]] | child with a defaulting to 42 and parent m empty | mouse-down returns data with a equal 42 and b nil |
| p_contextual | unit | [[spec.contextual_source]] | context focus 42 with parent m empty | c is nil because context has no c, and with context c 13 it reads 13 with path context then c |
| p_as_map | unit | [[spec.as_binding_whole_map]] | child called with b 42 | the as map contains a 42, b 42 and extra |
| p_literal_call | unit | [[spec.literal_call_paths]] | literal map with explicit dollar key | the explicit path wins |
| p_nonliteral | unit | [[spec.nonliteral_call_fill]] | m a 12 and has-default 4 | a has path m then a and b falls back to extra |
| p_nonliteral_vals | unit | [[spec.nonliteral_missing_vals]] | m with missing keys and context is-context 13 | has-default is 42 when absent, is-context is 13, all from the right source |
| p_identity | unit | [[spec.call_site_identity]] | two call sites with different args | extra keys differ and are stable across renders |
| p_render_pure | unit | [[spec.render_pure]] | same inputs twice | outputs deep-equal |
| p_cache | unit | [[spec.render_cached]] | repeat render then redefine | second render reuses the first, and redefinition clears the cache |
| p_forward | unit | [[spec.event_forwarding]] | events at a component | the rendered view's handlers receive them |
| p_clipboard | unit | [[spec.clipboard_forwarding]] | copy event at a textarea component | the selected text effect is emitted |
| p_sizing | unit | [[spec.sizing_props]] | component with width prop | setWidth returns a component with the new width prop |
| p_recursive | unit | [[spec.recursive_components]] | a tree component | the recursion renders to the data depth |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_single_arg

- **WHEN** two-parameter and zero-parameter declarations
- **THEN** both are rejected
- **VERIFIES** [[spec.p_single_arg]]

#### Scenario: p_prop_path

- **WHEN** random prop sets
- **THEN** every prop has a path counterpart
- **VERIFIES** [[spec.p_prop_path]]

#### Scenario: p_path_get

- **WHEN** random state and paths
- **THEN** select equals the prop value
- **VERIFIES** [[spec.p_path_get]]

#### Scenario: p_implicit

- **WHEN** a component that declares neither
- **THEN** extra, context and their paths are present
- **VERIFIES** [[spec.p_implicit]]

#### Scenario: p_defaults

- **WHEN** child with a defaulting to 42 and parent m empty
- **THEN** mouse-down returns data with a equal 42 and b nil
- **VERIFIES** [[spec.p_defaults]]

#### Scenario: p_contextual

- **WHEN** context focus 42 with parent m empty
- **THEN** c is nil because context has no c, and with context c 13 it reads 13 with path context then c
- **VERIFIES** [[spec.p_contextual]]

#### Scenario: p_as_map

- **WHEN** child called with b 42
- **THEN** the as map contains a 42, b 42 and extra
- **VERIFIES** [[spec.p_as_map]]

#### Scenario: p_literal_call

- **WHEN** literal map with explicit dollar key
- **THEN** the explicit path wins
- **VERIFIES** [[spec.p_literal_call]]

#### Scenario: p_nonliteral

- **WHEN** m a 12 and has-default 4
- **THEN** a has path m then a and b falls back to extra
- **VERIFIES** [[spec.p_nonliteral]]

#### Scenario: p_nonliteral_vals

- **WHEN** m with missing keys and context is-context 13
- **THEN** has-default is 42 when absent, is-context is 13, all from the right source
- **VERIFIES** [[spec.p_nonliteral_vals]]

#### Scenario: p_identity

- **WHEN** two call sites with different args
- **THEN** extra keys differ and are stable across renders
- **VERIFIES** [[spec.p_identity]]

#### Scenario: p_render_pure

- **WHEN** same inputs twice
- **THEN** outputs deep-equal
- **VERIFIES** [[spec.p_render_pure]]

#### Scenario: p_cache

- **WHEN** repeat render then redefine
- **THEN** second render reuses the first, and redefinition clears the cache
- **VERIFIES** [[spec.p_cache]]

#### Scenario: p_forward

- **WHEN** events at a component
- **THEN** the rendered view's handlers receive them
- **VERIFIES** [[spec.p_forward]]

#### Scenario: p_clipboard

- **WHEN** copy event at a textarea component
- **THEN** the selected text effect is emitted
- **VERIFIES** [[spec.p_clipboard]]

#### Scenario: p_sizing

- **WHEN** component with width prop
- **THEN** setWidth returns a component with the new width prop
- **VERIFIES** [[spec.p_sizing]]

#### Scenario: p_recursive

- **WHEN** a tree component
- **THEN** the recursion renders to the data depth
- **VERIFIES** [[spec.p_recursive]]

