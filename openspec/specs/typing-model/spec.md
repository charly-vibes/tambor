---
id: spec
kind: intent
statement: "THE tambor library SHALL be written in strict TypeScript so that views, paths, props, effects and handlers are checked at compile time and invalid combinations fail to compile."
---

# typing.model

The port target is TypeScript (strict), not vanilla JS. Types give the port things Membrane's Clojure never had: a path is a typed lens `Path<S, T>`, a component's `$k` props are derived from its value props with template-literal key remapping, effects are a discriminated union, and the core compiles without the DOM lib so `backend_optional` is enforced by the compiler. Types erase at runtime, so nothing here may be needed to make behaviour correct. Path derivation (path.derivation) uses typed runtime refs rather than macros, and the types sit on top of that. Squint is no longer a target.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| strict_compiler | invariant | the library compiles under strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes and noImplicitOverride with zero errors | [[spec]] |
| no_any_public | invariant | no exported signature contains any, and unknown is used where a type is genuinely open | [[spec]] |
| core_without_dom | invariant | the core package compiles with lib limited to ES2022 and no dom, so any DOM reference in core is a compile error | [[spec]] |
| node_union | invariant | every view node is a member of a discriminated union keyed by a type field, and a switch over it without a default fails to compile when a case is missing | [[spec]] |
| readonly_nodes | invariant | node and effect types are deeply readonly so assigning to a field is a compile error | [[spec]] |
| vec_tuples | invariant | positions and sizes are readonly two-element tuples and a three-element or array argument is a compile error | [[spec]] |
| typed_path | invariant | Path<S, T> is a lens from S to T, so select returns T, set requires a T, and composing Path<S, A> with Path<A, B> yields Path<S, B> | [[spec]] |
| path_mismatch_rejected | invariant | setting a string through a Path<S, number> is a compile error | [[spec]] |
| navigator_types | invariant | key narrows to the property type, nth to the element type, filter and take and drop keep the array type, nilToVal removes undefined, and collectOne prepends the collected type to the update function parameters | [[spec]] |
| dollar_keys_derived | invariant | the props type of a component maps each key k to k and to a dollar-k of type Path<Root, P[k]> using key remapping, so a missing or mistyped dollar prop fails to compile | [[spec]] |
| defaults_typed | invariant | a declared default makes the prop optional at the call site and non-optional inside the component body | [[spec]] |
| context_augmentable | invariant | the context type is an interface that applications extend by declaration merging, with focus as a built-in member | [[spec]] |
| effect_union | invariant | Effect is a discriminated tuple union whose built-ins update, set, get and delete carry typed paths, and applications register custom effects by extending an EffectMap interface | [[spec]] |
| dispatch_checked | invariant | dispatch accepts only members of the Effect union and rejects an unregistered effect type or wrong argument types at compile time | [[spec]] |
| handler_signatures | invariant | each event handler type has a fixed signature, for example a mouse-down handler takes a Vec2 and returns readonly Effect[], and a wrap-on handler receives the typed default handler first | [[spec]] |
| intercept_typed | invariant | on(type, fn) infers the parameters of fn from the registered effect type so the argument types are checked | [[spec]] |
| component_generic | invariant | defui infers the props type from the render function and calling a component with a missing required prop or an extra unknown prop fails to compile | [[spec]] |
| types_erased | invariant | removing all type annotations leaves behaviour unchanged, so no runtime check depends on a type | [[spec]] |
| type_tests_in_ci | invariant | type-level tests using expectTypeOf and ts-expect-error pins run in CI and fail the build on regression | [[spec]] |
| esm_with_declarations | invariant | the package ships ES modules with bundled declaration files and an exports map, with side-effect-free modules so unused components tree-shake | [[spec]] |
| serialisable_effects | invariant | effect arguments other than update functions and filter predicates are JSON-serialisable values, and the type system marks function-bearing effects | [[spec]] |

## Model

### States

- `untyped`
- `typed`
- `verified`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_type | untyped | typed | [[spec.strict_compiler]] |
| t_verify | typed | verified | [[spec.type_tests_in_ci]] |
| t_regress | verified | untyped | [[spec.types_erased]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_strict | unit | [[spec.strict_compiler]] | tsc over the library with the listed flags | zero diagnostics |
| p_no_any | unit | [[spec.no_any_public]] | scan the emitted declaration files | no exported symbol mentions any |
| p_core_dom | unit | [[spec.core_without_dom]] | add document to a core file | tsc reports an error |
| p_union | unit | [[spec.node_union]] | a switch missing the Scale case | tsc reports an error on the never check |
| p_readonly | unit | [[spec.readonly_nodes]] | assign to a node field | tsc reports an error |
| p_vec | unit | [[spec.vec_tuples]] | pass three numbers and a number array as a position | both are errors |
| p_path | unit | [[spec.typed_path]] | compose Path<S, A> with Path<A, B> | the result has type Path<S, B> and select returns B |
| p_mismatch | unit | [[spec.path_mismatch_rejected]] | set a string through Path<S, number> | tsc reports an error |
| p_navigators | unit | [[spec.navigator_types]] | each navigator on a todos array state | the inferred types match the documented table |
| p_dollar | unit | [[spec.dollar_keys_derived]] | a component with props num and nums | the props type has dollar-num as Path<Root, number> and dollar-nums as Path<Root, number[]>, and omitting one errors |
| p_defaults | unit | [[spec.defaults_typed]] | selected-filter with a default | the call site may omit it and the body sees a defined value |
| p_context | unit | [[spec.context_augmentable]] | augment context with a theme field | the field is typed in every component |
| p_effect_union | unit | [[spec.effect_union]] | register a custom add-todo effect | it appears in the union with its argument types |
| p_dispatch | unit | [[spec.dispatch_checked]] | dispatch an unknown type and a wrong argument | both are compile errors |
| p_handlers | unit | [[spec.handler_signatures]] | a mouse-down handler with the wrong parameter | tsc reports an error |
| p_intercept | unit | [[spec.intercept_typed]] | on select with the wrong parameter types | tsc reports an error |
| p_generic | unit | [[spec.component_generic]] | call counter with no num and with an extra prop | both are compile errors |
| p_erased | unit | [[spec.types_erased]] | strip annotations and rerun the behaviour suite | results are identical |
| p_type_tests | unit | [[spec.type_tests_in_ci]] | break a type on purpose | the CI type-test job fails |
| p_esm | unit | [[spec.esm_with_declarations]] | import one component into a bundler | unused components are absent from the bundle |
| p_serialisable | unit | [[spec.serialisable_effects]] | add-todo and update with a function | add-todo round-trips through JSON and the update effect is marked function-bearing |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_strict

- **WHEN** tsc over the library with the listed flags
- **THEN** zero diagnostics
- **VERIFIES** [[spec.p_strict]]

#### Scenario: p_no_any

- **WHEN** scan the emitted declaration files
- **THEN** no exported symbol mentions any
- **VERIFIES** [[spec.p_no_any]]

#### Scenario: p_core_dom

- **WHEN** add document to a core file
- **THEN** tsc reports an error
- **VERIFIES** [[spec.p_core_dom]]

#### Scenario: p_union

- **WHEN** a switch missing the Scale case
- **THEN** tsc reports an error on the never check
- **VERIFIES** [[spec.p_union]]

#### Scenario: p_readonly

- **WHEN** assign to a node field
- **THEN** tsc reports an error
- **VERIFIES** [[spec.p_readonly]]

#### Scenario: p_vec

- **WHEN** pass three numbers and a number array as a position
- **THEN** both are errors
- **VERIFIES** [[spec.p_vec]]

#### Scenario: p_path

- **WHEN** compose Path<S, A> with Path<A, B>
- **THEN** the result has type Path<S, B> and select returns B
- **VERIFIES** [[spec.p_path]]

#### Scenario: p_mismatch

- **WHEN** set a string through Path<S, number>
- **THEN** tsc reports an error
- **VERIFIES** [[spec.p_mismatch]]

#### Scenario: p_navigators

- **WHEN** each navigator on a todos array state
- **THEN** the inferred types match the documented table
- **VERIFIES** [[spec.p_navigators]]

#### Scenario: p_dollar

- **WHEN** a component with props num and nums
- **THEN** the props type has dollar-num as Path<Root, number> and dollar-nums as Path<Root, number[]>, and omitting one errors
- **VERIFIES** [[spec.p_dollar]]

#### Scenario: p_defaults

- **WHEN** selected-filter with a default
- **THEN** the call site may omit it and the body sees a defined value
- **VERIFIES** [[spec.p_defaults]]

#### Scenario: p_context

- **WHEN** augment context with a theme field
- **THEN** the field is typed in every component
- **VERIFIES** [[spec.p_context]]

#### Scenario: p_effect_union

- **WHEN** register a custom add-todo effect
- **THEN** it appears in the union with its argument types
- **VERIFIES** [[spec.p_effect_union]]

#### Scenario: p_dispatch

- **WHEN** dispatch an unknown type and a wrong argument
- **THEN** both are compile errors
- **VERIFIES** [[spec.p_dispatch]]

#### Scenario: p_handlers

- **WHEN** a mouse-down handler with the wrong parameter
- **THEN** tsc reports an error
- **VERIFIES** [[spec.p_handlers]]

#### Scenario: p_intercept

- **WHEN** on select with the wrong parameter types
- **THEN** tsc reports an error
- **VERIFIES** [[spec.p_intercept]]

#### Scenario: p_generic

- **WHEN** call counter with no num and with an extra prop
- **THEN** both are compile errors
- **VERIFIES** [[spec.p_generic]]

#### Scenario: p_erased

- **WHEN** strip annotations and rerun the behaviour suite
- **THEN** results are identical
- **VERIFIES** [[spec.p_erased]]

#### Scenario: p_type_tests

- **WHEN** break a type on purpose
- **THEN** the CI type-test job fails
- **VERIFIES** [[spec.p_type_tests]]

#### Scenario: p_esm

- **WHEN** import one component into a bundler
- **THEN** unused components are absent from the bundle
- **VERIFIES** [[spec.p_esm]]

#### Scenario: p_serialisable

- **WHEN** add-todo and update with a function
- **THEN** add-todo round-trips through JSON and the update effect is marked function-bearing
- **VERIFIES** [[spec.p_serialisable]]

