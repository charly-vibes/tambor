---
id: scrollytelling.pin
kind: intent
checked_against_core: clear
statement: "WHILE a Pin's Boundary is active, THE Pin SHALL fix its target
  element's position relative to the viewport, reserve equivalent layout
  space via a ScrollSpacer, and SHALL release the element back to native
  document flow at the Boundary's end without a visual jump."
---

# Pin (bridged onto tambor)

Unchanged from the original DOM-oriented specification in intent — this
file still states the library-level requirement. What changed is *how*
it is satisfied: there is no native document scroll or `position: fixed`
in tambor, so every Constraint below is realized by composing
[[components.scrollview]] (the offset source) with the new
[[components.pinned_panel]] (specified in `components-pinned_panel.md`)
rather than by browser layout. Each row's expr names, in prose, the
component-level invariant doing the actual work — not as a structured
`observes` reference, since `observes` is reserved for `effect`-kind
Constraints (Reference Typing) and none of these targets are effects.

## Constraints

| id                           | kind      | expr                                                                                                          | traces_to               |
|---------------------------------|-----------|------------------------------------------------------------------------------------------------------------------|------------------------------|
| fixed_during_active             | invariant | `∀ position within the Boundary: the target element's viewport-relative position is constant` — realized by [[components.pinned_panel.body_drawn_untranslated_when_active]] | [[scrollytelling.pin]]      |
| spacer_reserves_height          | invariant | `ScrollSpacer height == the Pin's authored scroll duration, for the entire time the Pin is active` — realized by [[components.pinned_panel.spacer_matches_body_extent]] together with [[components.scrollview.range_formula]] | [[scrollytelling.pin]]      |
| release_no_jump                 | invariant | `at Boundary end: the pin releases and control returns to native flow within the same frame, with no discontinuity in rendered position` — realized by [[components.pinned_panel.release_continuous]] | [[scrollytelling.pin]]      |
| spacer_recomputed_on_resize     | invariant | `target element size changes after initialization ⟹ ScrollSpacer height is recomputed on the next onRefresh` — realized for free by [[components.pinned_panel.render_pure]] together with [[backend.render.resize_redraws]], since nothing is cached in the first place | [[scrollytelling.pin]] |
| nested_pin_priority             | invariant | `∀ nested Pins: stacking order resolves by explicit priority, defaulting to document order when priority is unset` — realized by [[components.pinned_panel.nested_panel_priority]] | [[scrollytelling.pin]]      |
| focus_releases_pin              | invariant | `keyboard focus would move past the last interactive element inside an active Pin ⟹ the Pin releases rather than trapping focus` — **open gap**, see Notes | [[scrollytelling.pin]]      |

## Model

### States
- `unpinned`
- `pinned`
- `released`

### Transitions

| id                   | from     | to       | guard                                                          |
|----------------------|----------|----------|---------------------------------------------------------------------|
| pin                  | unpinned | pinned   | [[scrollytelling.pin.spacer_reserves_height]]                       |
| release              | pinned   | released | [[scrollytelling.pin.release_no_jump]]                              |
| release_on_focus_out | pinned   | released | [[scrollytelling.pin.focus_releases_pin]]                           |
| unpin                | released | unpinned | `scroll returns above the Pin's start boundary`                     |

## Properties

| id                        | kind | derives_from                                          | generator                                             | predicate                                                                    |
|------------------------------|------|--------------------------------------------------------------|----------------------------------------------------------------|-------------------------------------------------------------------------------------|
| position_constant_while_pinned| unit | [[scrollytelling.pin.fixed_during_active]]                  | `scroll_sweep_within_pin_boundary()`                           | `viewport_position(target) is constant across every sampled frame`                 |
| spacer_matches_duration       | unit | [[scrollytelling.pin.spacer_reserves_height]]               | `pin_with(authored_duration: d)`                               | `spacer_height == d`                                                                |
| no_visual_jump_on_release     | unit | [[scrollytelling.pin.release_no_jump]]                      | `scroll_past_pin_end_boundary()`                               | `rendered_position(frame_before_release) == rendered_position(frame_after_release)`|
| resize_recomputes_spacer      | unit | [[scrollytelling.pin.spacer_recomputed_on_resize]]          | `resize_pinned_target_then_refresh()`                          | `spacer_height == new authored duration`                                           |
| nested_priority_resolved      | unit | [[scrollytelling.pin.nested_pin_priority]]                  | `two_nested_pins(priority: unset)`                             | `stacking_order == document_order`                                                  |
| tab_out_releases_focus        | unit | [[scrollytelling.pin.focus_releases_pin]]                   | `tab_past_last_interactive_element_in_pin()`                   | `check(pin_state) == released`                                                      |

## Notes

`checked_against_core: clear`. Three of six Constraints are satisfied
**for free** by composing existing tambor guarantees rather than
needing new primitive-level work:

- `spacer_recomputed_on_resize` was a real engineering concern on the web
  (stale cached layout after a resize). On tambor it's not a
  separate mechanism at all — [[component.model.render_pure]] recomputes
  every value fresh on every render, and [[backend.render.resize_redraws]]
  already guarantees a redraw follows any container resize. There is
  nothing to "recompute on refresh" because nothing is ever cached in
  the first place.
- `fixed_during_active` and `release_no_jump` reduce directly to
  [[components.pinned_panel]]'s own `body_drawn_untranslated_when_active`
  and `release_continuous` — restated here only to keep this file's
  intent self-contained for a reader who hasn't opened
  `components-pinned_panel.md`.

One Constraint remains an **open gap**, carried over unresolved rather
than silently dropped or claimed-solved: `focus_releases_pin` names no
realizing invariant because nothing in this corpus
([[component.model]], [[backend.render]], or the new
[[components.pinned_panel]]) specifies keyboard focus traversal order
across the Membrane component tree. Closing this honestly requires
either a new corpus-level focus-order spec, or narrowing this Constraint
to the DOM backend specifically (where native Tab order might apply) —
not something `pinned_panel` can claim on its own. See the matching note
in `components-pinned_panel.md`.
