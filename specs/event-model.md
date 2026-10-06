---
id: event.model
kind: intent
statement: "WHEN an input event arrives at a node THE event router SHALL hit-test it against the node bounds and return the intents produced by the matching descendants under the delivery rule of that event type."
---

# event.model

Port of the default protocol implementations in `membrane.ui` (the `Object` extension near the top of `ui.cljc`) and of the `OnMouseDown`, `OnMouseUp`, `OnKeyPress` and related records. The delivery rule differs per event type, and the first draft of this corpus got it wrong. **Pointer events (mouse-event, mouse-move, scroll, drop) are first-match-wins:** children are tried last to first, meaning topmost first, and the first non-empty intent list stops the search. **Key-press, key-event, clipboard and mouse-enter-global events concatenate** the intents of all children in order. **mouse-move-global is delivered to every descendant** with the offset adjusted by each origin. Hit-testing is half-open: 0 at or below local x below width, and the same on y. Everything is a pure function, `dispatch(view, event)` returns a list of intents.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| hit_half_open | invariant | a node accepts a pointer position only when 0 <= x - originX < width and 0 <= y - originY < height, so the right and bottom edges are exclusive | [[event.model]] |
| local_pos_passed | invariant | a pointer handler receives the position relative to its own node origin | [[event.model]] |
| coords_translated | invariant | descending through Translate(x, y) subtracts x and y from the event position | [[event.model]] |
| pointer_first_match | invariant | for mouse-event, mouse-move, scroll and drop the children are tried in reverse order and the first non-empty intent list wins, and later children are not consulted | [[event.model]] |
| down_handler_terminal | invariant | an on-mouse-down node calls its handler on a mouse-down inside bounds and does not descend into its children for that event | [[event.model]] |
| up_handler_descends | invariant | an on-mouse-down node forwards a mouse-up to its children in reverse order, and symmetrically an on-mouse-up node forwards a mouse-down | [[event.model]] |
| outside_bounds_nil | invariant | a pointer event outside the bounds of a node yields no intents from that node | [[event.model]] |
| key_concat | invariant | key-press, key-event and clipboard events visit every child in order and concatenate the results | [[event.model]] |
| global_move_all | invariant | mouse-move-global visits every descendant, passing the position minus each origin, and concatenates the results | [[event.model]] |
| bubble_after_children | invariant | after the child results are collected the node applies its bubble function once, and the default is identity | [[event.model]] |
| capability_queries | invariant | has-key-press, has-key-event and has-mouse-move-global are true when the node or any descendant handles that event, so a backend can skip delivery | [[event.model]] |
| button_fires_on_down | invariant | a ui button returns its on-click result on a mouse-down inside its bounds and nothing on mouse-up | [[event.model]] |
| event_pure | invariant | dispatching an event never mutates the view tree or state | [[event.model]] |
| pointer_unified | invariant | mouse, touch and pen input normalise to one pointer shape with position, button, down flag, modifiers and pointerType | [[event.model]] |
| tap_vs_drag | invariant | a pointer-up within 10 px and 300 ms of its pointer-down is a tap, which emits mouse-down then mouse-up, and anything else is a drag | [[event.model]] |

## Model

### States

- `idle`
- `pressed`
- `dragging`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_press | idle | pressed | [[event.model.hit_half_open]] |
| t_drag | pressed | dragging | [[event.model.tap_vs_drag]] |
| t_tap | pressed | idle | [[event.model.tap_vs_drag]] |
| t_release | dragging | idle | [[event.model.event_pure]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_half_open | unit | [[event.model.hit_half_open]] | spacer(20, 20) probed at 0, 19, 20 and -1 | positions 0 and 19 hit and 20 and -1 miss |
| p_local | unit | [[event.model.local_pos_passed]] | handler at translate(10, 10) probed at [15, 15] | handler sees [5, 5] and README returns the intent [:say-hello] |
| p_coords | unit | [[event.model.coords_translated]] | nested translates | handler sees the point minus the sum of offsets |
| p_first_match | unit | [[event.model.pointer_first_match]] | two overlapping nodes both with handlers | only the later sibling's intents are returned |
| p_down_terminal | unit | [[event.model.down_handler_terminal]] | on-mouse-down wrapping a node that also handles down | only the outer handler fires |
| p_up_descends | unit | [[event.model.up_handler_descends]] | on-mouse-down wrapping a node that handles up | the inner up handler fires |
| p_outside | unit | [[event.model.outside_bounds_nil]] | points outside all nodes | result is empty |
| p_key_concat | unit | [[event.model.key_concat]] | three siblings that each handle key-press | the output is the three results in order |
| p_global_move | unit | [[event.model.global_move_all]] | handlers at several offsets | each receives its own local position and all fire |
| p_bubble | unit | [[event.model.bubble_after_children]] | node with a counting bubble | bubble runs exactly once per event |
| p_capability | unit | [[event.model.capability_queries]] | trees with and without key handlers | the query matches whether any descendant handles the event |
| p_button | unit | [[event.model.button_fires_on_down]] | down and up inside and outside | only a down inside returns on-click |
| p_event_pure | unit | [[event.model.event_pure]] | random events | tree and state unchanged afterwards |
| p_pointer | unit | [[event.model.pointer_unified]] | mouse, touch and pen inputs | all produce the same normalised shape |
| p_tap | unit | [[event.model.tap_vs_drag]] | random down-up pairs | classification matches the slop and time thresholds |
