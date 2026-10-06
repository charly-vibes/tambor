# Traceability: Membrane tests and examples -> spec properties

Source repo: phronmophobic/membrane (master). Spec ids are `<file-id>.<row-id>`.
Target language: strict TypeScript. typing.model has no Membrane counterpart (Clojure is untyped); it adds compile-time checking of paths, props, effects and handlers.

## test/membrane/component_test.clj  (generative, binding-form grammar)
| Membrane test | What it asserts | Spec property |
|---|---|---|
| `compiles-binding-data-form` | any destructuring form yields paths without error | path.derivation.p_compiles |
| `updates-prop-test` | set via `$sym` then re-destructure gives the value back | path.derivation.p_update |
| `extracts-prop-test` | select via `$sym` equals the destructured value | path.derivation.p_extract |
| (grammar: `& rest`, `:as`, `:keys`, `:strs`, `:syms`, `:or`) | rest and map forms | path.derivation.p_rest, p_every_binding |

## test/membrane/defui_test.clj
| Membrane test | Spec property |
|---|---|
| `child` / `parent` (defaults `:or {a 42}`, contextual `c`, `:as m`) | component.model.p_defaults, p_contextual, p_as_map |
| `seq-nth1` / `seq-nth4` (iterate a map with `for [k v]`, `$v`) | path.derivation.p_map_iter |
| `seq-nth-test` (select / setval / transform inc on each path) | path.derivation.p_extract, p_update, p_transform |
| `seq-nth3` (`[[k1 v1] [k2 v2] & _more]`, set #{:a 1 :b 2}) | path.derivation.p_pairs |
| `seq-nth2` (commented out: "setting keys doesn't make sense") | path.derivation.p_key_ro |
| `when-let-test` (obj nil -> no intents) | path.derivation.p_when_let |
| `if-let-test` (then / else branches, `$not-obj`) | path.derivation.p_if_let |
| `non-literal-target` / `non-literal-origin` (`assoc m :extra`) | component.model.p_nonliteral, p_nonliteral_vals; path.derivation.p_assoc |

## src/membrane/example/counter.cljc
| Scenario | Spec property |
|---|---|
| `counter` layout, `::counter-increment` | example.counter.p_layout, p_more, p_increment |
| `counter-counter` stack, per-entry paths | example.counter.p_stack, p_independent |
| `::add-counter` conj 0 | example.counter.p_add; effect.dispatch.p_counter_effects |

## src/membrane/example/todo.cljc (and terminal_todo.clj)
| Scenario | Spec property |
|---|---|
| `delete-X` geometry | example.todo.p_delete_x |
| `todo-item` layout and bindings | example.todo.p_item_layout, p_item_bindings |
| delete / complete / add | example.todo.p_delete, p_complete, p_add_button, p_add |
| `toggle` and filter fns | example.todo.p_toggle_render, p_toggle, p_filter_fns, p_filter_default |
| filtered list edits original list | example.todo.p_filtered_paths, p_filtered_toggle; state.paths.p_filter_merge, p_filter_delete; path.derivation.p_filter_path |
| Enter via `wrap-on` | example.todo.p_enter, p_enter_unfocused, p_other_keys; event.bubble.p_middleware |
| `save-image` | example.todo.p_image; backend.render.p_headless |
| same app on skia and lanterna | example.todo.p_portable; backend.render.p_swappable |
| quirk: unknown filter hides everything | example.todo.p_unknown_filter (advisory: port shows all) |

## src/membrane/example/file_selector.clj
| Scenario | Spec property |
|---|---|
| `on :update` overrides child built-in effect | example.file_selector.p_intercept; event.bubble.p_builtin |
| filter by substring, defaults | example.file_selector.p_filter, p_defaults |

## src/membrane/basic_components.cljc (no tests upstream; modelled from code)
textarea -> components.textarea.* ; scrollview -> components.scrollview.* ;
dropdown -> components.select.* ; counter and number-slider -> components.numeric.* ;
button, checkbox, on-hover -> components.hover.*

## README "Fun features"
| Snippet | Spec property |
|---|---|
| `ui/bounds` of label + checkbox without a window | view.model.p_bounds, p_checkbox_geometry |
| mouse-down at [15 15] on translate(10 10) returns `[[:say-hello]]` | event.model.p_local |

## Faithful quirks recorded (deliberately preserved, flagged in the spec)
- previous-line lands on the newline char, not line start (components.textarea.p_prev_line)
- hover-leave bound check is inclusive; hit-test is half-open (components.hover.p_leave vs event.model.p_half_open)
- file-selector lowercases the name but not the filter (example.file_selector.p_filter)
- clipboard events are not forwarded by `defui` components (component.model.p_clipboard, advisory fix)
