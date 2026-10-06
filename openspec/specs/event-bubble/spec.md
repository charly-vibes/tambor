---
id: spec
kind: intent
statement: "WHEN a descendant returns intents THE ancestors SHALL be able to intercept intents of a named type and replace them, or wrap the default handler of a built-in event as middleware."
---

# event.bubble

Port of `EventHandler` (`ui/on` with a custom keyword), `OnBubble`, and `ui/wrap-on`. Bubbling is how a deep child asks an ancestor for something it cannot do itself. In `textarea`, the view returns `[::request-focus]` and the `textarea` wrapper rewrites it to `[:set $focus $text]`. In `dropdown`, the list returns `[::select $selected value]` and the dropdown wrapper expands it to a select plus `[:set $open? false]`. `wrap-on` is middleware: the handler gets the default handler first, as `todo-app` does for the Enter key.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| intercept_by_type | invariant | an on(type, fn) node replaces every descendant intent whose first element equals type with fn applied to the remaining elements | [[spec]] |
| intercept_args_spread | invariant | the intercept handler receives the intent arguments as positional arguments, so on(select, fn(selectedPath, value)) sees the path and value | [[spec]] |
| other_intents_pass | invariant | intents of any other type pass through unchanged and keep their relative order | [[spec]] |
| intercept_may_expand | invariant | an intercept handler may return zero, one or many intents, and its output is spliced in place of the original | [[spec]] |
| innermost_first | invariant | nested interceptors apply from the innermost to the outermost as the intents bubble up | [[spec]] |
| wrap_on_middleware | invariant | the handler of wrap-on receives the default handler as its first argument and may call it, change its output, or skip it | [[spec]] |
| wrap_on_ordering | invariant | with several event and handler pairs in one wrap-on call, the first pair is outermost | [[spec]] |
| on_multi_pairs | invariant | on accepts several event and handler pairs followed by one body and is equivalent to nesting the single-pair forms | [[spec]] |
| on_bubble_raw | invariant | on-bubble receives the whole intent list of its children and its return value replaces it | [[spec]] |
| intercept_builtin_effects | invariant | the built-in effect types update, set and delete can be intercepted like any custom type, as the file selector does with on update | [[spec]] |

## Model

### States

- `collecting`
- `intercepting`
- `delivered`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_collect | collecting | intercepting | [[spec.intercept_by_type]] |
| t_pass | intercepting | delivered | [[spec.other_intents_pass]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_intercept | unit | [[spec.intercept_by_type]] | intents including request-focus | a request-focus intent becomes the set-focus intent from the textarea example |
| p_args | unit | [[spec.intercept_args_spread]] | select with path and value | the handler is called with exactly path and value |
| p_pass | unit | [[spec.other_intents_pass]] | mixed intent lists | non-matching intents keep identity and order |
| p_expand | unit | [[spec.intercept_may_expand]] | handler returning two intents | both appear in place of the original |
| p_innermost | unit | [[spec.innermost_first]] | two nested interceptors for one type | the inner one rewrites it first and the outer never sees the original |
| p_middleware | unit | [[spec.wrap_on_middleware]] | todo-app enter key wrapper | enter with non-empty default effects returns add-todo then set next-todo-text to empty, any other key returns the default effects |
| p_wrap_order | unit | [[spec.wrap_on_ordering]] | two pairs | the first pair wraps the second |
| p_multi | unit | [[spec.on_multi_pairs]] | on with three handlers | equals three nested single-pair nodes |
| p_raw_bubble | unit | [[spec.on_bubble_raw]] | handler dropping all intents | result is empty |
| p_builtin | unit | [[spec.intercept_builtin_effects]] | a row returning update of selected? with not under an on update wrapper | the wrapper replaces it with the set-membership update and the original never reaches the dispatcher |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_intercept

- **WHEN** intents including request-focus
- **THEN** a request-focus intent becomes the set-focus intent from the textarea example
- **VERIFIES** [[spec.p_intercept]]

#### Scenario: p_args

- **WHEN** select with path and value
- **THEN** the handler is called with exactly path and value
- **VERIFIES** [[spec.p_args]]

#### Scenario: p_pass

- **WHEN** mixed intent lists
- **THEN** non-matching intents keep identity and order
- **VERIFIES** [[spec.p_pass]]

#### Scenario: p_expand

- **WHEN** handler returning two intents
- **THEN** both appear in place of the original
- **VERIFIES** [[spec.p_expand]]

#### Scenario: p_innermost

- **WHEN** two nested interceptors for one type
- **THEN** the inner one rewrites it first and the outer never sees the original
- **VERIFIES** [[spec.p_innermost]]

#### Scenario: p_middleware

- **WHEN** todo-app enter key wrapper
- **THEN** enter with non-empty default effects returns add-todo then set next-todo-text to empty, any other key returns the default effects
- **VERIFIES** [[spec.p_middleware]]

#### Scenario: p_wrap_order

- **WHEN** two pairs
- **THEN** the first pair wraps the second
- **VERIFIES** [[spec.p_wrap_order]]

#### Scenario: p_multi

- **WHEN** on with three handlers
- **THEN** equals three nested single-pair nodes
- **VERIFIES** [[spec.p_multi]]

#### Scenario: p_raw_bubble

- **WHEN** handler dropping all intents
- **THEN** result is empty
- **VERIFIES** [[spec.p_raw_bubble]]

#### Scenario: p_builtin

- **WHEN** a row returning update of selected? with not under an on update wrapper
- **THEN** the wrapper replaces it with the set-membership update and the original never reaches the dispatcher
- **VERIFIES** [[spec.p_builtin]]

