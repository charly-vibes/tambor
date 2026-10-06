---
id: path.derivation
kind: intent
statement: "WHEN a component binds a name from a prop through destructuring, iteration or a supported call THE path deriver SHALL give the matching dollar name a path that selects and updates that exact location in the state."
---

# path.derivation

This is the heart of `defui`, and it is exactly what `test/membrane/component_test.clj` and `test/membrane/defui_test.clj` test. Inside a component body every bound name `x` has a sibling `$x` that is a path from the app state to `x`. Membrane derives it at macro-expansion time by walking `let`, `when-let`, `if-let`, `for` and function calls with a table of known functions (`nth`, `get`, `get-in`, keyword call, `filter`, `take`, `drop`, `or`, `assoc`, `select-one`). **Porting note:** TypeScript has no macros and types are erased, so derivation cannot read types. The primary strategy is a **typed runtime ref**: props arrive as `Ref<T>` values carrying value and path, with `ref.get("a")`, `ref.nth(i)`, `ref.filter(fn)` and `ref.each()` returning `Ref` of the narrowed type, and the type checker verifies the navigation. The alternatives are a **TypeScript compiler transformer** and, for squint and ClojureScript, an optional **macro** (see interop.model). A third, macro-free tier is the explicit API (path concatenation, a filter navigator, `each(xs, $xs, fn)`), which already passes the filtered-todo scenario. All are held to the same vectors below. Component_test property-tests this with generated destructuring forms. The three generative laws are *compiles*, *updates* (set the path, re-destructure, get the value back) and *extracts* (select by path equals the bound value).

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| every_binding_has_path | invariant | every name bound by destructuring, let, when-let, if-let or for has a dollar path | [[path.derivation]] |
| extract_law | invariant | for every bound name x, select(state, path of x) equals the value x had at render time | [[path.derivation]] |
| update_law | invariant | for every bound name x and value v, destructuring the structure after set(path of x, v) binds x to v | [[path.derivation]] |
| transform_law | invariant | transform(path of x, f) changes only x so that the new x equals f applied to the old x | [[path.derivation]] |
| any_binding_form_compiles | invariant | any combination of positional, nested, rest, as, keys, strs, syms, or-defaults and explicit key bindings yields paths without error | [[path.derivation]] |
| rest_binding_path | invariant | a rest binding takes the path of the remaining sequence, and a rest map binding uses restArgsMap | [[path.derivation]] |
| map_iteration_seq_nth | invariant | iterating a map with for and destructuring [k v] binds dollar v to a seq-nth(i) then nth(1) path, so writing it changes the i-th value of the map | [[path.derivation]] |
| key_paths_read_only | invariant | a path ending at a map key is readable but writing it is unsupported and must raise or be refused | [[path.derivation]] |
| vector_of_pairs_destructure | invariant | destructuring [[k1 v1] [k2 v2] & more] over a map binds dollar k1, v1, k2, v2 to the first two entries in order | [[path.derivation]] |
| when_let_guards_body | invariant | when-let with a nil or false value renders nothing and so produces no handlers, otherwise the body sees paths into the bound value | [[path.derivation]] |
| if_let_branches | invariant | in if-let the then branch sees the new bindings and the else branch sees only the outer ones | [[path.derivation]] |
| shadowing_uses_binding_time | invariant | a path is computed from the dependencies at the time of binding, so a later rebinding of a name does not change an earlier derived path | [[path.derivation]] |
| fn_params_shadow | invariant | a nested function parameter with the same name as a bound name hides its path inside the function body | [[path.derivation]] |
| known_call_table | invariant | derivation understands nth, get, get-in, keyword call, filter, take, drop, or, assoc, select-one and root-deref, and these map to the navigators nth, keypath, keypathList, keypath, filter, take, drop, nilToVal, identity, path and rawPath | [[path.derivation]] |
| get_with_default | invariant | get with a default value adds a nilToVal step | [[path.derivation]] |
| assoc_transparent | invariant | assoc onto a map does not change the path of that map | [[path.derivation]] |
| literal_is_constant | invariant | a literal value has a constant segment that cannot be written | [[path.derivation]] |
| unknown_call_opaque | invariant | the result of an unrecognised function call has an opaque path that is readable as a value but never writable | [[path.derivation]] |
| filter_path_composes | invariant | iterating over (filter pred xs) gives each item the path of xs followed by filter(pred) then seq-nth(i), so the item edits the underlying list | [[path.derivation]] |
| unsupported_loops_throw | invariant | the removed forms fori, for-kv and for-with-last raise an error saying they are no longer supported | [[path.derivation]] |
| unbound_dollar_literal | invariant | a dollar name with no bound base name is left as a plain symbol and is never replaced | [[path.derivation]] |
| strategy_agnostic | extension_point | the typed runtime ref strategy and the compiler transformer strategy are interchangeable and must pass identical vectors | [[path.derivation]] |

## Model

### States

- `bound`
- `derived`
- `opaque`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_derive | bound | derived | [[path.derivation.every_binding_has_path]] |
| t_opaque | bound | opaque | [[path.derivation.unknown_call_opaque]] |
| t_rebind | derived | bound | [[path.derivation.shadowing_uses_binding_time]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_every_binding | unit | [[path.derivation.every_binding_has_path]] | generated binding forms | every bound name has a dollar path |
| p_extract | unit | [[path.derivation.extract_law]] | generated binding forms with test data | select by path equals the destructured value |
| p_update | unit | [[path.derivation.update_law]] | generated binding forms and the test value [a, 42] | after set the destructured name equals the test value |
| p_transform | unit | [[path.derivation.transform_law]] | obj a 1 and b 2 with inc | the selected value is one more and nothing else changes |
| p_compiles | unit | [[path.derivation.any_binding_form_compiles]] | generated forms from the component_test grammar | derivation never throws |
| p_rest | unit | [[path.derivation.rest_binding_path]] | forms with rest and rest map | paths cover the remaining items |
| p_map_iter | unit | [[path.derivation.map_iteration_seq_nth]] | arg obj a 1 and b 2 iterating for [k v] | the three laws hold and selected values are the set 1 and 2 |
| p_key_ro | unit | [[path.derivation.key_paths_read_only]] | write through a key path | writing is refused |
| p_pairs | unit | [[path.derivation.vector_of_pairs_destructure]] | arg obj a 1, b 2, c 3 | selected values are the set a, 1, b, 2 |
| p_when_let | unit | [[path.derivation.when_let_guards_body]] | obj a 1 then obj nil | the first selects 1 and sets to obj a 2, the second yields no intents |
| p_if_let | unit | [[path.derivation.if_let_branches]] | obj a 1, obj nil, not-obj 1 | then path selects 1, nil yields no then handlers, else path selects 1 on not-obj and sets to not-obj 2 |
| p_shadow | unit | [[path.derivation.shadowing_uses_binding_time]] | let a, then b from a, then a rebound | dollar b still points into the first a |
| p_fn_shadow | unit | [[path.derivation.fn_params_shadow]] | inner fn with parameter named like a binding | the inner name is not replaced |
| p_call_table | unit | [[path.derivation.known_call_table]] | each known call | the navigator list matches the table |
| p_get_default | unit | [[path.derivation.get_with_default]] | get with default 42 | reading an absent key gives 42 |
| p_assoc | unit | [[path.derivation.assoc_transparent]] | assoc onto a prop map | path equals the original map path |
| p_literal | unit | [[path.derivation.literal_is_constant]] | literal arguments | path reads the literal and refuses writes |
| p_opaque | unit | [[path.derivation.unknown_call_opaque]] | result of a custom function | value readable and path write refused |
| p_filter_path | unit | [[path.derivation.filter_path_composes]] | todos first second third and active filter | the item path of the second visible todo selects second, set and delete change only the original index 1 |
| p_unsupported | unit | [[path.derivation.unsupported_loops_throw]] | fori, for-kv, for-with-last | each raises the documented error |
| p_unbound | unit | [[path.derivation.unbound_dollar_literal]] | dollar name with no base | the symbol is left alone |
| p_strategy | unit | [[path.derivation.strategy_agnostic]] | both strategies on one vector set, with refs typed Ref<T> | outputs are deep-equal |
