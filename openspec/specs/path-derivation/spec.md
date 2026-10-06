---
id: spec
kind: intent
statement: "WHEN a component binds a name from a prop through destructuring, iteration or a supported call THE path deriver SHALL give the matching dollar name a path that selects and updates that exact location in the state."
---

# path.derivation

This is the heart of `defui`, and it is exactly what `test/membrane/component_test.clj` and `test/membrane/defui_test.clj` test. Inside a component body every bound name `x` has a sibling `$x` that is a path from the app state to `x`. Membrane derives it at macro-expansion time by walking `let`, `when-let`, `if-let`, `for` and function calls with a table of known functions (`nth`, `get`, `get-in`, keyword call, `filter`, `take`, `drop`, `or`, `assoc`, `select-one`). **Porting note:** TypeScript has no macros and types are erased, so derivation cannot read types. The primary strategy is a **typed runtime ref**: props arrive as `Ref<T>` values carrying value and path, with `ref.get("a")`, `ref.nth(i)`, `ref.filter(fn)` and `ref.each()` returning `Ref` of the narrowed type, and the type checker verifies the navigation. The alternatives are a **TypeScript compiler transformer** and, for squint and ClojureScript, an optional **macro** (see interop.model). A third, macro-free tier is the explicit API (path concatenation, a filter navigator, `each(xs, $xs, fn)`), which already passes the filtered-todo scenario. All are held to the same vectors below. Component_test property-tests this with generated destructuring forms. The three generative laws are *compiles*, *updates* (set the path, re-destructure, get the value back) and *extracts* (select by path equals the bound value).

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| every_binding_has_path | invariant | every name bound by destructuring, let, when-let, if-let or for has a dollar path | [[spec]] |
| extract_law | invariant | for every bound name x, select(state, path of x) equals the value x had at render time | [[spec]] |
| update_law | invariant | for every bound name x and value v, destructuring the structure after set(path of x, v) binds x to v | [[spec]] |
| transform_law | invariant | transform(path of x, f) changes only x so that the new x equals f applied to the old x | [[spec]] |
| any_binding_form_compiles | invariant | any combination of positional, nested, rest, as, keys, strs, syms, or-defaults and explicit key bindings yields paths without error | [[spec]] |
| rest_binding_path | invariant | a rest binding takes the path of the remaining sequence, and a rest map binding uses restArgsMap | [[spec]] |
| map_iteration_seq_nth | invariant | iterating a map with for and destructuring [k v] binds dollar v to a seq-nth(i) then nth(1) path, so writing it changes the i-th value of the map | [[spec]] |
| key_paths_read_only | invariant | a path ending at a map key is readable but writing it is unsupported and must raise or be refused | [[spec]] |
| vector_of_pairs_destructure | invariant | destructuring [[k1 v1] [k2 v2] & more] over a map binds dollar k1, v1, k2, v2 to the first two entries in order | [[spec]] |
| when_let_guards_body | invariant | when-let with a nil or false value renders nothing and so produces no handlers, otherwise the body sees paths into the bound value | [[spec]] |
| if_let_branches | invariant | in if-let the then branch sees the new bindings and the else branch sees only the outer ones | [[spec]] |
| shadowing_uses_binding_time | invariant | a path is computed from the dependencies at the time of binding, so a later rebinding of a name does not change an earlier derived path | [[spec]] |
| fn_params_shadow | invariant | a nested function parameter with the same name as a bound name hides its path inside the function body | [[spec]] |
| known_call_table | invariant | derivation understands nth, get, get-in, keyword call, filter, take, drop, or, assoc, select-one and root-deref, and these map to the navigators nth, keypath, keypathList, keypath, filter, take, drop, nilToVal, identity, path and rawPath | [[spec]] |
| get_with_default | invariant | get with a default value adds a nilToVal step | [[spec]] |
| assoc_transparent | invariant | assoc onto a map does not change the path of that map | [[spec]] |
| literal_is_constant | invariant | a literal value has a constant segment that cannot be written | [[spec]] |
| unknown_call_opaque | invariant | the result of an unrecognised function call has an opaque path that is readable as a value but never writable | [[spec]] |
| filter_path_composes | invariant | iterating over (filter pred xs) gives each item the path of xs followed by filter(pred) then seq-nth(i), so the item edits the underlying list | [[spec]] |
| unsupported_loops_throw | invariant | the removed forms fori, for-kv and for-with-last raise an error saying they are no longer supported | [[spec]] |
| unbound_dollar_literal | invariant | a dollar name with no bound base name is left as a plain symbol and is never replaced | [[spec]] |
| strategy_agnostic | extension_point | the typed runtime ref strategy and the compiler transformer strategy are interchangeable and must pass identical vectors | [[spec]] |

## Model

### States

- `bound`
- `derived`
- `opaque`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_derive | bound | derived | [[spec.every_binding_has_path]] |
| t_opaque | bound | opaque | [[spec.unknown_call_opaque]] |
| t_rebind | derived | bound | [[spec.shadowing_uses_binding_time]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_every_binding | unit | [[spec.every_binding_has_path]] | generated binding forms | every bound name has a dollar path |
| p_extract | unit | [[spec.extract_law]] | generated binding forms with test data | select by path equals the destructured value |
| p_update | unit | [[spec.update_law]] | generated binding forms and the test value [a, 42] | after set the destructured name equals the test value |
| p_transform | unit | [[spec.transform_law]] | obj a 1 and b 2 with inc | the selected value is one more and nothing else changes |
| p_compiles | unit | [[spec.any_binding_form_compiles]] | generated forms from the component_test grammar | derivation never throws |
| p_rest | unit | [[spec.rest_binding_path]] | forms with rest and rest map | paths cover the remaining items |
| p_map_iter | unit | [[spec.map_iteration_seq_nth]] | arg obj a 1 and b 2 iterating for [k v] | the three laws hold and selected values are the set 1 and 2 |
| p_key_ro | unit | [[spec.key_paths_read_only]] | write through a key path | writing is refused |
| p_pairs | unit | [[spec.vector_of_pairs_destructure]] | arg obj a 1, b 2, c 3 | selected values are the set a, 1, b, 2 |
| p_when_let | unit | [[spec.when_let_guards_body]] | obj a 1 then obj nil | the first selects 1 and sets to obj a 2, the second yields no intents |
| p_if_let | unit | [[spec.if_let_branches]] | obj a 1, obj nil, not-obj 1 | then path selects 1, nil yields no then handlers, else path selects 1 on not-obj and sets to not-obj 2 |
| p_shadow | unit | [[spec.shadowing_uses_binding_time]] | let a, then b from a, then a rebound | dollar b still points into the first a |
| p_fn_shadow | unit | [[spec.fn_params_shadow]] | inner fn with parameter named like a binding | the inner name is not replaced |
| p_call_table | unit | [[spec.known_call_table]] | each known call | the navigator list matches the table |
| p_get_default | unit | [[spec.get_with_default]] | get with default 42 | reading an absent key gives 42 |
| p_assoc | unit | [[spec.assoc_transparent]] | assoc onto a prop map | path equals the original map path |
| p_literal | unit | [[spec.literal_is_constant]] | literal arguments | path reads the literal and refuses writes |
| p_opaque | unit | [[spec.unknown_call_opaque]] | result of a custom function | value readable and path write refused |
| p_filter_path | unit | [[spec.filter_path_composes]] | todos first second third and active filter | the item path of the second visible todo selects second, set and delete change only the original index 1 |
| p_unsupported | unit | [[spec.unsupported_loops_throw]] | fori, for-kv, for-with-last | each raises the documented error |
| p_unbound | unit | [[spec.unbound_dollar_literal]] | dollar name with no base | the symbol is left alone |
| p_strategy | unit | [[spec.strategy_agnostic]] | both strategies on one vector set, with refs typed Ref<T> | outputs are deep-equal |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_every_binding

- **WHEN** generated binding forms
- **THEN** every bound name has a dollar path
- **VERIFIES** [[spec.p_every_binding]]

#### Scenario: p_extract

- **WHEN** generated binding forms with test data
- **THEN** select by path equals the destructured value
- **VERIFIES** [[spec.p_extract]]

#### Scenario: p_update

- **WHEN** generated binding forms and the test value [a, 42]
- **THEN** after set the destructured name equals the test value
- **VERIFIES** [[spec.p_update]]

#### Scenario: p_transform

- **WHEN** obj a 1 and b 2 with inc
- **THEN** the selected value is one more and nothing else changes
- **VERIFIES** [[spec.p_transform]]

#### Scenario: p_compiles

- **WHEN** generated forms from the component_test grammar
- **THEN** derivation never throws
- **VERIFIES** [[spec.p_compiles]]

#### Scenario: p_rest

- **WHEN** forms with rest and rest map
- **THEN** paths cover the remaining items
- **VERIFIES** [[spec.p_rest]]

#### Scenario: p_map_iter

- **WHEN** arg obj a 1 and b 2 iterating for [k v]
- **THEN** the three laws hold and selected values are the set 1 and 2
- **VERIFIES** [[spec.p_map_iter]]

#### Scenario: p_key_ro

- **WHEN** write through a key path
- **THEN** writing is refused
- **VERIFIES** [[spec.p_key_ro]]

#### Scenario: p_pairs

- **WHEN** arg obj a 1, b 2, c 3
- **THEN** selected values are the set a, 1, b, 2
- **VERIFIES** [[spec.p_pairs]]

#### Scenario: p_when_let

- **WHEN** obj a 1 then obj nil
- **THEN** the first selects 1 and sets to obj a 2, the second yields no intents
- **VERIFIES** [[spec.p_when_let]]

#### Scenario: p_if_let

- **WHEN** obj a 1, obj nil, not-obj 1
- **THEN** then path selects 1, nil yields no then handlers, else path selects 1 on not-obj and sets to not-obj 2
- **VERIFIES** [[spec.p_if_let]]

#### Scenario: p_shadow

- **WHEN** let a, then b from a, then a rebound
- **THEN** dollar b still points into the first a
- **VERIFIES** [[spec.p_shadow]]

#### Scenario: p_fn_shadow

- **WHEN** inner fn with parameter named like a binding
- **THEN** the inner name is not replaced
- **VERIFIES** [[spec.p_fn_shadow]]

#### Scenario: p_call_table

- **WHEN** each known call
- **THEN** the navigator list matches the table
- **VERIFIES** [[spec.p_call_table]]

#### Scenario: p_get_default

- **WHEN** get with default 42
- **THEN** reading an absent key gives 42
- **VERIFIES** [[spec.p_get_default]]

#### Scenario: p_assoc

- **WHEN** assoc onto a prop map
- **THEN** path equals the original map path
- **VERIFIES** [[spec.p_assoc]]

#### Scenario: p_literal

- **WHEN** literal arguments
- **THEN** path reads the literal and refuses writes
- **VERIFIES** [[spec.p_literal]]

#### Scenario: p_opaque

- **WHEN** result of a custom function
- **THEN** value readable and path write refused
- **VERIFIES** [[spec.p_opaque]]

#### Scenario: p_filter_path

- **WHEN** todos first second third and active filter
- **THEN** the item path of the second visible todo selects second, set and delete change only the original index 1
- **VERIFIES** [[spec.p_filter_path]]

#### Scenario: p_unsupported

- **WHEN** fori, for-kv, for-with-last
- **THEN** each raises the documented error
- **VERIFIES** [[spec.p_unsupported]]

#### Scenario: p_unbound

- **WHEN** dollar name with no base
- **THEN** the symbol is left alone
- **VERIFIES** [[spec.p_unbound]]

#### Scenario: p_strategy

- **WHEN** both strategies on one vector set, with refs typed Ref<T>
- **THEN** outputs are deep-equal
- **VERIFIES** [[spec.p_strategy]]

