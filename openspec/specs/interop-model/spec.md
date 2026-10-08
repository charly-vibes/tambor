---
id: interop.model
kind: intent
statement: "WHEN a squint or ClojureScript program uses the library THE library SHALL accept and return host data directly, so that no wrapper layer is needed beyond an optional five-function data-ops object."
---

# interop.model

Constraints derived from experiments (see EVALUATION.md): squint 0.14.211 emits plain JS objects, arrays and strings for maps, vectors and keywords, so it needs nothing. ClojureScript (probed with cherry 0.6.38, which has CLJS semantics) uses persistent collections and Keyword objects, and a direct call into an array-only API throws, `clj->js` loses reference identity, drops keyword namespaces (`:ui/select` becomes `"select"`) and cost about 11 ms per conversion of a 5000-item state. An injectable `DataOps` seam avoided all three at about 0.07 ms per dispatch. Everything is therefore designed as a data API with that one seam, and the macro is optional sugar.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| plain_data_api | invariant | views, effects, paths, props and events are plain objects, arrays, strings, numbers, booleans and functions, with no class instances, getters, TS enums or non-registered symbols in public data | [[interop.model]] |
| string_tags | invariant | node types and effect types are strings, namespaced tags are written as ns slash name, and the registry treats them as opaque strings | [[interop.model]] |
| punctuated_keys | invariant | state and prop keys may contain question marks, hyphens, dollar signs and slashes such as complete?, next-todo-text and dollar-num, and the library never uses dot access or identifier assumptions on user keys | [[interop.model]] |
| nil_is_nullish | invariant | null and undefined both mean nil and are tested with loose equality to null, and an absent key equals an undefined value | [[interop.model]] |
| iterable_inputs | invariant | every parameter documented as a list accepts any iterable, including the lazy results of squint map and for, and is normalised to an array once at the boundary while outputs are arrays | [[interop.model]] |
| variadic_and_array | invariant | container constructors accept either rest arguments or one array so that apply and direct array calls both work | [[interop.model]] |
| free_functions | invariant | the public API is free functions taking data first, with no methods, builder chains or reliance on this | [[interop.model]] |
| functions_opaque | invariant | handlers, update functions and predicates are called but never inspected, and behaviour never depends on function length or name | [[interop.model]] |
| data_ops_seam | extension_point | every function that reads or writes user state or reads a collection takes an optional ops object with get, assoc, toArray and tag, plus dissoc where deletion is used, defaulting to plain JS operations | [[interop.model]] |
| ops_bound_to_app | invariant | ops are supplied once when an app is created and passed down internally, never held in module-global state, so two apps with different ops can coexist | [[interop.model]] |
| seam_keeps_identity | invariant | with custom ops, branches that were not on an updated path keep reference equality and the input value is not mutated | [[interop.model]] |
| tag_namespace_kept | invariant | the tag operation turns a host keyword into ns slash name, or name when it has no namespace, so a namespaced effect keeps its namespace and means the same from squint, ClojureScript and TypeScript | [[interop.model]] |
| no_boundary_conversion | invariant | crossing the boundary never requires converting state, paths, effects or views between host and JS forms, and a dispatch of one update on a 5000-item state completes in under 1 ms with custom ops | [[interop.model]] |
| paths_explicit_api | invariant | path building is available as plain functions, namely path concatenation, a filter navigator constructor and an each helper that hands each child its value and its path, so the dollar-path derivation is optional | [[interop.model]] |
| no_macro_acceptance | invariant | the counter and todo acceptance scenarios, including deleting from a filtered list, pass using only the explicit path functions | [[interop.model]] |
| macro_optional_tier | invariant | a defui and derivation macro ships as a separate cljc file loadable by squint require-macros and by ClojureScript, desugars to the explicit API, and is never required by the library | [[interop.model]] |
| esm_named_exports | invariant | the package is an ES module with named exports, an exports map and no top-level side effects, so squint and shadow-cljs can import it with a plain require | [[interop.model]] |
| advanced_compile_safe | invariant | node, effect and path property names survive Closure advanced compilation, by shipping externs or by accessing only quoted keys | [[interop.model]] |
| dispatch_same_everywhere | invariant | the same effect vector gives the same state change whether written in TypeScript, squint or ClojureScript | [[interop.model]] |

## Model

### States

- `designed`
- `prototyped`
- `conformant`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_prototype | designed | prototyped | [[interop.model.plain_data_api]] |
| t_conform | prototyped | conformant | [[interop.model.no_macro_acceptance]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_plain_data | unit | [[interop.model.plain_data_api]] | build each node, effect and path | structured clone succeeds and every value is a plain type or function |
| p_string_tags | unit | [[interop.model.string_tags]] | the keyword form of ui select and the string ui slash select | both resolve to the same registered handler |
| p_punctuated | unit | [[interop.model.punctuated_keys]] | state with keys complete?, next-todo-text and dollar-num | select, set and update work on each |
| p_nil | unit | [[interop.model.nil_is_nullish]] | null, undefined and a missing key | all three read as nil and select returns undefined for each |
| p_iterables | unit | [[interop.model.iterable_inputs]] | children given as an array, a generator and a lazy map result | all three produce the same view and the output children is an array |
| p_variadic | unit | [[interop.model.variadic_and_array]] | vstack with rest args and with one array | the views deep-equal |
| p_free_functions | unit | [[interop.model.free_functions]] | scan the public exports | every export is a function, a constant or a sentinel, and none uses this |
| p_functions | unit | [[interop.model.functions_opaque]] | an update function with rest parameters and one with default parameters | both are called with the same arguments |
| p_seam | unit | [[interop.model.data_ops_seam]] | persistent-collection ops over a 3-level state | update at one path works and default ops are used when none are given |
| p_ops_bound | unit | [[interop.model.ops_bound_to_app]] | two apps with plain and persistent ops | each behaves per its own ops |
| p_identity | unit | [[interop.model.seam_keeps_identity]] | 5000 todos and an update to index 2 | todo 3 is reference-equal before and after and the input is unchanged |
| p_tag_ns | unit | [[interop.model.tag_namespace_kept]] | two keywords with the same name in different namespaces | the normalised tags differ and keep their namespaces |
| p_no_conversion | unit | [[interop.model.no_boundary_conversion]] | 1000 dispatches on 5000 todos with custom ops | total time is under 1000 ms and no conversion function is called |
| p_explicit_paths | unit | [[interop.model.paths_explicit_api]] | todos with an active filter | the each helper gives the second visible item the path todos, filter, 1 |
| p_no_macro | unit | [[interop.model.no_macro_acceptance]] | todos first, second, third with third complete and an active filter | deleting visible index 1 leaves first and third, and toggling visible index 0 changes only first |
| p_macro_optional | unit | [[interop.model.macro_optional_tier]] | the todo app written with and without the macro | both produce deep-equal views and effects |
| p_esm | unit | [[interop.model.esm_named_exports]] | import from squint and from a CLJS build | named imports resolve and no side effect runs at import |
| p_advanced | unit | [[interop.model.advanced_compile_safe]] | build the counter example with advanced optimisations | the click still produces the counter-increment effect |
| p_same_everywhere | unit | [[interop.model.dispatch_same_everywhere]] | the same effect batch from three languages | the resulting states are deep-equal |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_plain_data

- **WHEN** build each node, effect and path
- **THEN** structured clone succeeds and every value is a plain type or function
- **VERIFIES** [[interop.model.p_plain_data]]

#### Scenario: p_string_tags

- **WHEN** the keyword form of ui select and the string ui slash select
- **THEN** both resolve to the same registered handler
- **VERIFIES** [[interop.model.p_string_tags]]

#### Scenario: p_punctuated

- **WHEN** state with keys complete?, next-todo-text and dollar-num
- **THEN** select, set and update work on each
- **VERIFIES** [[interop.model.p_punctuated]]

#### Scenario: p_nil

- **WHEN** null, undefined and a missing key
- **THEN** all three read as nil and select returns undefined for each
- **VERIFIES** [[interop.model.p_nil]]

#### Scenario: p_iterables

- **WHEN** children given as an array, a generator and a lazy map result
- **THEN** all three produce the same view and the output children is an array
- **VERIFIES** [[interop.model.p_iterables]]

#### Scenario: p_variadic

- **WHEN** vstack with rest args and with one array
- **THEN** the views deep-equal
- **VERIFIES** [[interop.model.p_variadic]]

#### Scenario: p_free_functions

- **WHEN** scan the public exports
- **THEN** every export is a function, a constant or a sentinel, and none uses this
- **VERIFIES** [[interop.model.p_free_functions]]

#### Scenario: p_functions

- **WHEN** an update function with rest parameters and one with default parameters
- **THEN** both are called with the same arguments
- **VERIFIES** [[interop.model.p_functions]]

#### Scenario: p_seam

- **WHEN** persistent-collection ops over a 3-level state
- **THEN** update at one path works and default ops are used when none are given
- **VERIFIES** [[interop.model.p_seam]]

#### Scenario: p_ops_bound

- **WHEN** two apps with plain and persistent ops
- **THEN** each behaves per its own ops
- **VERIFIES** [[interop.model.p_ops_bound]]

#### Scenario: p_identity

- **WHEN** 5000 todos and an update to index 2
- **THEN** todo 3 is reference-equal before and after and the input is unchanged
- **VERIFIES** [[interop.model.p_identity]]

#### Scenario: p_tag_ns

- **WHEN** two keywords with the same name in different namespaces
- **THEN** the normalised tags differ and keep their namespaces
- **VERIFIES** [[interop.model.p_tag_ns]]

#### Scenario: p_no_conversion

- **WHEN** 1000 dispatches on 5000 todos with custom ops
- **THEN** total time is under 1000 ms and no conversion function is called
- **VERIFIES** [[interop.model.p_no_conversion]]

#### Scenario: p_explicit_paths

- **WHEN** todos with an active filter
- **THEN** the each helper gives the second visible item the path todos, filter, 1
- **VERIFIES** [[interop.model.p_explicit_paths]]

#### Scenario: p_no_macro

- **WHEN** todos first, second, third with third complete and an active filter
- **THEN** deleting visible index 1 leaves first and third, and toggling visible index 0 changes only first
- **VERIFIES** [[interop.model.p_no_macro]]

#### Scenario: p_macro_optional

- **WHEN** the todo app written with and without the macro
- **THEN** both produce deep-equal views and effects
- **VERIFIES** [[interop.model.p_macro_optional]]

#### Scenario: p_esm

- **WHEN** import from squint and from a CLJS build
- **THEN** named imports resolve and no side effect runs at import
- **VERIFIES** [[interop.model.p_esm]]

#### Scenario: p_advanced

- **WHEN** build the counter example with advanced optimisations
- **THEN** the click still produces the counter-increment effect
- **VERIFIES** [[interop.model.p_advanced]]

#### Scenario: p_same_everywhere

- **WHEN** the same effect batch from three languages
- **THEN** the resulting states are deep-equal
- **VERIFIES** [[interop.model.p_same_everywhere]]

