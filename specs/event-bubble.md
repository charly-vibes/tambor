---
id: event.bubble
kind: intent
statement: "WHEN a descendant returns intents THE ancestors SHALL be able to intercept intents of a named type and replace them, or wrap the default handler of a built-in event as middleware."
---

# event.bubble

Port of `EventHandler` (`ui/on` with a custom keyword), `OnBubble`, and `ui/wrap-on`. Bubbling is how a deep child asks an ancestor for something it cannot do itself. In `textarea`, the view returns `[::request-focus]` and the `textarea` wrapper rewrites it to `[:set $focus $text]`. In `dropdown`, the list returns `[::select $selected value]` and the dropdown wrapper expands it to a select plus `[:set $open? false]`. `wrap-on` is middleware: the handler gets the default handler first, as `todo-app` does for the Enter key.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| intercept_by_type | invariant | an on(type, fn) node replaces every descendant intent whose first element equals type with fn applied to the remaining elements | [[event.bubble]] |
| intercept_args_spread | invariant | the intercept handler receives the intent arguments as positional arguments, so on(select, fn(selectedPath, value)) sees the path and value | [[event.bubble]] |
| other_intents_pass | invariant | intents of any other type pass through unchanged and keep their relative order | [[event.bubble]] |
| intercept_may_expand | invariant | an intercept handler may return zero, one or many intents, and its output is spliced in place of the original | [[event.bubble]] |
| innermost_first | invariant | nested interceptors apply from the innermost to the outermost as the intents bubble up | [[event.bubble]] |
| wrap_on_middleware | invariant | the handler of wrap-on receives the default handler as its first argument and may call it, change its output, or skip it | [[event.bubble]] |
| wrap_on_ordering | invariant | with several event and handler pairs in one wrap-on call, the first pair is outermost | [[event.bubble]] |
| on_multi_pairs | invariant | on accepts several event and handler pairs followed by one body and is equivalent to nesting the single-pair forms | [[event.bubble]] |
| on_bubble_raw | invariant | on-bubble receives the whole intent list of its children and its return value replaces it | [[event.bubble]] |
| intercept_builtin_effects | invariant | the built-in effect types update, set and delete can be intercepted like any custom type, as the file selector does with on update | [[event.bubble]] |

## Model

### States

- `collecting`
- `intercepting`
- `delivered`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_collect | collecting | intercepting | [[event.bubble.intercept_by_type]] |
| t_pass | intercepting | delivered | [[event.bubble.other_intents_pass]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_intercept | unit | [[event.bubble.intercept_by_type]] | intents including request-focus | a request-focus intent becomes the set-focus intent from the textarea example |
| p_args | unit | [[event.bubble.intercept_args_spread]] | select with path and value | the handler is called with exactly path and value |
| p_pass | unit | [[event.bubble.other_intents_pass]] | mixed intent lists | non-matching intents keep identity and order |
| p_expand | unit | [[event.bubble.intercept_may_expand]] | handler returning two intents | both appear in place of the original |
| p_innermost | unit | [[event.bubble.innermost_first]] | two nested interceptors for one type | the inner one rewrites it first and the outer never sees the original |
| p_middleware | unit | [[event.bubble.wrap_on_middleware]] | todo-app enter key wrapper | enter with non-empty default effects returns add-todo then set next-todo-text to empty, any other key returns the default effects |
| p_wrap_order | unit | [[event.bubble.wrap_on_ordering]] | two pairs | the first pair wraps the second |
| p_multi | unit | [[event.bubble.on_multi_pairs]] | on with three handlers | equals three nested single-pair nodes |
| p_raw_bubble | unit | [[event.bubble.on_bubble_raw]] | handler dropping all intents | result is empty |
| p_builtin | unit | [[event.bubble.intercept_builtin_effects]] | a row returning update of selected? with not under an on update wrapper | the wrapper replaces it with the set-membership update and the original never reaches the dispatcher |
