---
id: ui.mobile
kind: intent
statement: "WHERE a touch device IS INCLUDED THE UI SHALL map touch to the pointer model, enlarge hit areas without changing drawn size, and adapt layout, gestures and text input for one-handed use on a narrow viewport."
---

# ui.mobile

Membrane is mouse-and-keyboard-first and its example targets are tiny (the todo delete X is 10 by 10 and the ui checkbox is 12 by 12). A mobile port has to adapt interaction without changing the drawn design or the app code. The approach is a mapping layer: touch becomes the existing pointer events, hit areas are padded by a slop layer inside the event router, and layout reflows from the container size, as `membrane.stretch/container-size` already allows.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| touch_maps_to_pointer | invariant | touchstart, touchmove and touchend map to mouse-down, mouse-move and mouse-up at the touch point, so every existing handler works unchanged | [[ui.mobile]] |
| hit_slop | invariant | a hit target smaller than 44 by 44 receives pointer events inside a 44 by 44 region centred on it, without changing its drawn size or its layout bounds | [[ui.mobile]] |
| slop_resolves_overlap | invariant | when slop regions of neighbouring targets overlap, the target whose centre is nearest to the touch point wins | [[ui.mobile]] |
| viewport_responsive | invariant | the root view is built from container size and reflows on any width from 320 px up | [[ui.mobile]] |
| no_horizontal_overflow | invariant | at 320 px width no content is wider than the viewport unless inside a horizontal scrollview | [[ui.mobile]] |
| thumb_zone_actions | advisory | primary actions sit in the bottom third of the screen | [[ui.mobile]] |
| gesture_set | invariant | supported gestures are tap, long-press, drag, flick and pinch, and each maps to a named intent | [[ui.mobile]] |
| soft_keyboard_bridge | invariant | focusing a textarea focuses a hidden input so the OS keyboard opens, and its input, backspace, enter and composition events become key-press events | [[ui.mobile]] |
| keyboard_avoidance | invariant | when the soft keyboard opens, the focused textarea is scrolled into the visible viewport | [[ui.mobile]] |
| selection_handles | advisory | on touch, a long-press on text selects a word and shows draggable selection handles that feed the drag-selection path | [[ui.mobile]] |
| orientation_supported | invariant | rotating the device relayouts without losing state | [[ui.mobile]] |
| reduced_motion | invariant | with prefers-reduced-motion set, momentum and transitions are disabled | [[ui.mobile]] |
| theme_aware | invariant | colors follow prefers-color-scheme, with explicit tokens for both themes | [[ui.mobile]] |
| haptics_optional | advisory | a short vibration on button taps where navigator.vibrate exists | [[ui.mobile]] |
| hover_off_on_touch | invariant | touch input never sets a hover flag and the hover visual is not shown | [[ui.mobile]] |

## Model

### States

- `portrait`
- `landscape`
- `keyboard_open`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_rotate | portrait | landscape | [[ui.mobile.orientation_supported]] |
| t_rotate_back | landscape | portrait | [[ui.mobile.orientation_supported]] |
| t_keyboard_open | portrait | keyboard_open | [[ui.mobile.keyboard_avoidance]] |
| t_keyboard_close | keyboard_open | portrait | [[ui.mobile.viewport_responsive]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_touch_map | unit | [[ui.mobile.touch_maps_to_pointer]] | a tap on the more button | the same effect as a mouse click is returned |
| p_slop | unit | [[ui.mobile.hit_slop]] | todo delete X with a touch 15 px right of its centre | the delete effect fires while drawn bounds stay 10 by 10 |
| p_overlap | unit | [[ui.mobile.slop_resolves_overlap]] | two 20 px targets 10 px apart | a touch between them picks the nearer centre |
| p_reflow | unit | [[ui.mobile.viewport_responsive]] | widths 320 to 1024 | layout is valid at every width |
| p_overflow | unit | [[ui.mobile.no_horizontal_overflow]] | width 320 and the todo app | no node extends past the viewport |
| p_thumb | unit | [[ui.mobile.thumb_zone_actions]] | primary actions | y of each is in the bottom third |
| p_gestures | unit | [[ui.mobile.gesture_set]] | scripted gestures | each gesture emits its named intent |
| p_keyboard_bridge | unit | [[ui.mobile.soft_keyboard_bridge]] | focus then input events | insert, backspace and enter effects are emitted |
| p_avoid | unit | [[ui.mobile.keyboard_avoidance]] | random focus positions | the focused textarea is inside the visible area |
| p_handles | unit | [[ui.mobile.selection_handles]] | long-press on a word | the word is selected and two handles exist |
| p_rotate | unit | [[ui.mobile.orientation_supported]] | rotation during use | state is deep-equal after rotation |
| p_motion | unit | [[ui.mobile.reduced_motion]] | the media query on | no momentum frames are scheduled |
| p_theme | unit | [[ui.mobile.theme_aware]] | both color schemes | tokens resolve in each |
| p_haptics | unit | [[ui.mobile.haptics_optional]] | vibrate present and absent | no error either way |
| p_no_hover | unit | [[ui.mobile.hover_off_on_touch]] | touch moves over a button | hover? is never set |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_touch_map

- **WHEN** a tap on the more button
- **THEN** the same effect as a mouse click is returned
- **VERIFIES** [[ui.mobile.p_touch_map]]

#### Scenario: p_slop

- **WHEN** todo delete X with a touch 15 px right of its centre
- **THEN** the delete effect fires while drawn bounds stay 10 by 10
- **VERIFIES** [[ui.mobile.p_slop]]

#### Scenario: p_overlap

- **WHEN** two 20 px targets 10 px apart
- **THEN** a touch between them picks the nearer centre
- **VERIFIES** [[ui.mobile.p_overlap]]

#### Scenario: p_reflow

- **WHEN** widths 320 to 1024
- **THEN** layout is valid at every width
- **VERIFIES** [[ui.mobile.p_reflow]]

#### Scenario: p_overflow

- **WHEN** width 320 and the todo app
- **THEN** no node extends past the viewport
- **VERIFIES** [[ui.mobile.p_overflow]]

#### Scenario: p_thumb

- **WHEN** primary actions
- **THEN** y of each is in the bottom third
- **VERIFIES** [[ui.mobile.p_thumb]]

#### Scenario: p_gestures

- **WHEN** scripted gestures
- **THEN** each gesture emits its named intent
- **VERIFIES** [[ui.mobile.p_gestures]]

#### Scenario: p_keyboard_bridge

- **WHEN** focus then input events
- **THEN** insert, backspace and enter effects are emitted
- **VERIFIES** [[ui.mobile.p_keyboard_bridge]]

#### Scenario: p_avoid

- **WHEN** random focus positions
- **THEN** the focused textarea is inside the visible area
- **VERIFIES** [[ui.mobile.p_avoid]]

#### Scenario: p_handles

- **WHEN** long-press on a word
- **THEN** the word is selected and two handles exist
- **VERIFIES** [[ui.mobile.p_handles]]

#### Scenario: p_rotate

- **WHEN** rotation during use
- **THEN** state is deep-equal after rotation
- **VERIFIES** [[ui.mobile.p_rotate]]

#### Scenario: p_motion

- **WHEN** the media query on
- **THEN** no momentum frames are scheduled
- **VERIFIES** [[ui.mobile.p_motion]]

#### Scenario: p_theme

- **WHEN** both color schemes
- **THEN** tokens resolve in each
- **VERIFIES** [[ui.mobile.p_theme]]

#### Scenario: p_haptics

- **WHEN** vibrate present and absent
- **THEN** no error either way
- **VERIFIES** [[ui.mobile.p_haptics]]

#### Scenario: p_no_hover

- **WHEN** touch moves over a button
- **THEN** hover? is never set
- **VERIFIES** [[ui.mobile.p_no_hover]]

