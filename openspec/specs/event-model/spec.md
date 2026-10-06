---
id: spec
kind: intent
statement: "WHEN an input event arrives at a node THE event router SHALL hit-test it against the node bounds and return the intents produced by the matching descendants under the delivery rule of that event type."
---

# event.model

Port of the default protocol implementations in `membrane.ui` (the `Object` extension near the top of `ui.cljc`) and of the `OnMouseDown`, `OnMouseUp`, `OnKeyPress` and related records. The delivery rule differs per event type, and the first draft of this corpus got it wrong. **Pointer events (mouse-event, mouse-move, scroll, drop) are first-match-wins:** children are tried last to first, meaning topmost first, and the first non-empty intent list stops the search. **Key-press, key-event, clipboard and mouse-enter-global events concatenate** the intents of all children in order. **mouse-move-global is delivered to every descendant** with the offset adjusted by each origin. Hit-testing is half-open: 0 at or below local x below width, and the same on y. Everything is a pure function, `dispatch(view, event)` returns a list of intents.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| hit_half_open | invariant | a node accepts a pointer position only when 0 <= x - originX < width and 0 <= y - originY < height, so the right and bottom edges are exclusive | [[spec]] |
| local_pos_passed | invariant | a pointer handler receives the position relative to its own node origin | [[spec]] |
| coords_translated | invariant | descending through Translate(x, y) subtracts x and y from the event position | [[spec]] |
| pointer_first_match | invariant | for mouse-event, mouse-move, scroll and drop the children are tried in reverse order and the first non-empty intent list wins, and later children are not consulted | [[spec]] |
| down_handler_terminal | invariant | an on-mouse-down node calls its handler on a mouse-down inside bounds and does not descend into its children for that event | [[spec]] |
| up_handler_descends | invariant | an on-mouse-down node forwards a mouse-up to its children in reverse order, and symmetrically an on-mouse-up node forwards a mouse-down | [[spec]] |
| outside_bounds_nil | invariant | a pointer event outside the bounds of a node yields no intents from that node | [[spec]] |
| key_concat | invariant | key-press, key-event and clipboard events visit every child in order and concatenate the results | [[spec]] |
| global_move_all | invariant | mouse-move-global visits every descendant, passing the position minus each origin, and concatenates the results | [[spec]] |
| bubble_after_children | invariant | after the child results are collected the node applies its bubble function once, and the default is identity | [[spec]] |
| capability_queries | invariant | has-key-press, has-key-event and has-mouse-move-global are true when the node or any descendant handles that event, so a backend can skip delivery | [[spec]] |
| button_fires_on_down | invariant | a ui button returns its on-click result on a mouse-down inside its bounds and nothing on mouse-up | [[spec]] |
| event_pure | invariant | dispatching an event never mutates the view tree or state | [[spec]] |
| pointer_unified | invariant | mouse, touch and pen input normalise to one pointer shape with position, button, down flag, modifiers and pointerType | [[spec]] |
| tap_vs_drag | invariant | a pointer-up within 10 px and 300 ms of its pointer-down is a tap, which emits mouse-down then mouse-up, and anything else is a drag | [[spec]] |

## Model

### States

- `idle`
- `pressed`
- `dragging`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_press | idle | pressed | [[spec.hit_half_open]] |
| t_drag | pressed | dragging | [[spec.tap_vs_drag]] |
| t_tap | pressed | idle | [[spec.tap_vs_drag]] |
| t_release | dragging | idle | [[spec.event_pure]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_half_open | unit | [[spec.hit_half_open]] | spacer(20, 20) probed at 0, 19, 20 and -1 | positions 0 and 19 hit and 20 and -1 miss |
| p_local | unit | [[spec.local_pos_passed]] | handler at translate(10, 10) probed at [15, 15] | handler sees [5, 5] and README returns the intent [:say-hello] |
| p_coords | unit | [[spec.coords_translated]] | nested translates | handler sees the point minus the sum of offsets |
| p_first_match | unit | [[spec.pointer_first_match]] | two overlapping nodes both with handlers | only the later sibling's intents are returned |
| p_down_terminal | unit | [[spec.down_handler_terminal]] | on-mouse-down wrapping a node that also handles down | only the outer handler fires |
| p_up_descends | unit | [[spec.up_handler_descends]] | on-mouse-down wrapping a node that handles up | the inner up handler fires |
| p_outside | unit | [[spec.outside_bounds_nil]] | points outside all nodes | result is empty |
| p_key_concat | unit | [[spec.key_concat]] | three siblings that each handle key-press | the output is the three results in order |
| p_global_move | unit | [[spec.global_move_all]] | handlers at several offsets | each receives its own local position and all fire |
| p_bubble | unit | [[spec.bubble_after_children]] | node with a counting bubble | bubble runs exactly once per event |
| p_capability | unit | [[spec.capability_queries]] | trees with and without key handlers | the query matches whether any descendant handles the event |
| p_button | unit | [[spec.button_fires_on_down]] | down and up inside and outside | only a down inside returns on-click |
| p_event_pure | unit | [[spec.event_pure]] | random events | tree and state unchanged afterwards |
| p_pointer | unit | [[spec.pointer_unified]] | mouse, touch and pen inputs | all produce the same normalised shape |
| p_tap | unit | [[spec.tap_vs_drag]] | random down-up pairs | classification matches the slop and time thresholds |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_half_open

- **WHEN** spacer(20, 20) probed at 0, 19, 20 and -1
- **THEN** positions 0 and 19 hit and 20 and -1 miss
- **VERIFIES** [[spec.p_half_open]]

#### Scenario: p_local

- **WHEN** handler at translate(10, 10) probed at [15, 15]
- **THEN** handler sees [5, 5] and README returns the intent [:say-hello]
- **VERIFIES** [[spec.p_local]]

#### Scenario: p_coords

- **WHEN** nested translates
- **THEN** handler sees the point minus the sum of offsets
- **VERIFIES** [[spec.p_coords]]

#### Scenario: p_first_match

- **WHEN** two overlapping nodes both with handlers
- **THEN** only the later sibling's intents are returned
- **VERIFIES** [[spec.p_first_match]]

#### Scenario: p_down_terminal

- **WHEN** on-mouse-down wrapping a node that also handles down
- **THEN** only the outer handler fires
- **VERIFIES** [[spec.p_down_terminal]]

#### Scenario: p_up_descends

- **WHEN** on-mouse-down wrapping a node that handles up
- **THEN** the inner up handler fires
- **VERIFIES** [[spec.p_up_descends]]

#### Scenario: p_outside

- **WHEN** points outside all nodes
- **THEN** result is empty
- **VERIFIES** [[spec.p_outside]]

#### Scenario: p_key_concat

- **WHEN** three siblings that each handle key-press
- **THEN** the output is the three results in order
- **VERIFIES** [[spec.p_key_concat]]

#### Scenario: p_global_move

- **WHEN** handlers at several offsets
- **THEN** each receives its own local position and all fire
- **VERIFIES** [[spec.p_global_move]]

#### Scenario: p_bubble

- **WHEN** node with a counting bubble
- **THEN** bubble runs exactly once per event
- **VERIFIES** [[spec.p_bubble]]

#### Scenario: p_capability

- **WHEN** trees with and without key handlers
- **THEN** the query matches whether any descendant handles the event
- **VERIFIES** [[spec.p_capability]]

#### Scenario: p_button

- **WHEN** down and up inside and outside
- **THEN** only a down inside returns on-click
- **VERIFIES** [[spec.p_button]]

#### Scenario: p_event_pure

- **WHEN** random events
- **THEN** tree and state unchanged afterwards
- **VERIFIES** [[spec.p_event_pure]]

#### Scenario: p_pointer

- **WHEN** mouse, touch and pen inputs
- **THEN** all produce the same normalised shape
- **VERIFIES** [[spec.p_pointer]]

#### Scenario: p_tap

- **WHEN** random down-up pairs
- **THEN** classification matches the slop and time thresholds
- **VERIFIES** [[spec.p_tap]]

