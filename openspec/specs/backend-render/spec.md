---
id: backend.render
kind: intent
statement: "WHEN a view tree is handed to a backend THE backend SHALL draw every primitive to its target, answer text-measurement and text-hit-test queries, and forward normalised input events to the event router."
---

# backend.render

Membrane's only platform requirements are drawing primitives and an event loop that forwards events and repaints. The port ships **canvas** (Canvas2D, the default), **dom** (accessible, selectable text) and a **text** backend (a cell grid, as in `terminal_todo`) behind one contract. Beyond drawing, `textarea` needs two backend services that are easy to forget: `indexForPosition(font, text, x, y)` (turning a click into a character index, set via `index-for-position*`) and a clipboard. The todo example also renders to an image without any window (`save-image`).

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| backend_contract | extension_point | a backend implements draw(view), measureText(text, font), indexForPosition(font, text, x, y), copyToClipboard(s), and an input subscription | [[backend.render]] |
| primitive_set | invariant | every backend draws label, text-selection, text-cursor, image, rectangle and rounded rectangle in stroke or fill, path, arc, translate, rotate, scale, color, style, stroke width and scissor, and unknown node types fall back to drawing their children | [[backend.render]] |
| draw_deterministic | invariant | drawing the same view twice yields identical output | [[backend.render]] |
| transform_stack_balanced | invariant | every push of a transform, clip or style is popped by the end of draw | [[backend.render]] |
| index_for_position_inverse | invariant | indexForPosition returns an index in 0..len(text) that is monotone in x on a single line, and positions left of the first glyph give 0 and beyond the last give len | [[backend.render]] |
| clipboard_service | invariant | copyToClipboard writes to the system clipboard where permitted, and paste events arrive as clipboard-paste events carrying the string | [[backend.render]] |
| headless_render | invariant | a view can be rendered to an image buffer with no window and no mounted DOM | [[backend.render]] |
| dpr_scaled | invariant | the canvas backing store is scaled by devicePixelRatio and CSS size is unchanged | [[backend.render]] |
| resize_redraws | invariant | a viewport or orientation change relayouts and redraws, passing the new container size to the app | [[backend.render]] |
| input_forwarded | invariant | raw pointer, wheel, key and clipboard events are normalised and forwarded with coordinates in view space | [[backend.render]] |
| key_normalisation | invariant | printable keys become one-character strings and Enter, Backspace and the four arrows become the named keys enter, backspace, up, down, left and right, and modifier keys alone produce nothing | [[backend.render]] |
| touch_action_none | invariant | the canvas disables browser panning and zoom so the router owns touch | [[backend.render]] |
| raf_coalesced | invariant | multiple repaint requests in one frame produce one draw | [[backend.render]] |
| backends_swappable | invariant | the same app view function and state run on every backend with no code change, and only measureText and drawing differ | [[backend.render]] |
| text_backend_metrics | advisory | the text backend treats one cell as one unit of width and height, and apps are laid out in those units | [[backend.render]] |
| a11y_mirror | advisory | the canvas backend keeps an offscreen accessibility tree mirroring interactive nodes | [[backend.render]] |
| safe_area_respected | invariant | root content is inset by the safe-area insets on notched devices | [[backend.render]] |

## Model

### States

- `detached`
- `attached`
- `drawing`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_attach | detached | attached | [[backend.render.input_forwarded]] |
| t_draw | attached | drawing | [[backend.render.raf_coalesced]] |
| t_drawn | drawing | attached | [[backend.render.transform_stack_balanced]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_contract | unit | [[backend.render.backend_contract]] | all three backends | each exposes draw, measureText, indexForPosition, copyToClipboard and subscribe |
| p_primitives | unit | [[backend.render.primitive_set]] | one node of each primitive and an unknown node | each draws and the unknown node draws its children |
| p_determinism | unit | [[backend.render.draw_deterministic]] | random views | two draws produce equal pixels |
| p_stack | unit | [[backend.render.transform_stack_balanced]] | random nested views | stack depth is 0 after draw |
| p_index | unit | [[backend.render.index_for_position_inverse]] | text hello at x from -5 to 200 | index is 0 at the left, 5 at the right and never decreases |
| p_clipboard | unit | [[backend.render.clipboard_service]] | copy hello and a paste event | the clipboard gets hello and the paste arrives as a string |
| p_headless | unit | [[backend.render.headless_render]] | the todo-app initial state in a runtime with no DOM | an image of non-zero size is produced |
| p_dpr | unit | [[backend.render.dpr_scaled]] | dpr in 1, 2, 3 | backing size equals css size times dpr |
| p_resize | unit | [[backend.render.resize_redraws]] | random viewport sizes | a redraw follows each resize with the new size in context |
| p_input | unit | [[backend.render.input_forwarded]] | scripted pointer events | the router receives view-space coordinates |
| p_keys | unit | [[backend.render.key_normalisation]] | a, A, Enter, Backspace, ArrowLeft, Shift | a, A, enter, backspace, left and nothing |
| p_touch_action | unit | [[backend.render.touch_action_none]] | mounted canvas | computed touch-action is none |
| p_raf | unit | [[backend.render.raf_coalesced]] | N requests per frame | one draw per frame |
| p_swappable | unit | [[backend.render.backends_swappable]] | counter-counter on each backend | the same click yields the same effect list |
| p_text_metrics | unit | [[backend.render.text_backend_metrics]] | text backend | a label of 5 characters measures 5 by 1 |
| p_a11y | unit | [[backend.render.a11y_mirror]] | views with buttons | one accessible node per interactive node |
| p_safe_area | unit | [[backend.render.safe_area_respected]] | simulated insets | content stays inside the insets |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_contract

- **WHEN** all three backends
- **THEN** each exposes draw, measureText, indexForPosition, copyToClipboard and subscribe
- **VERIFIES** [[backend.render.p_contract]]

#### Scenario: p_primitives

- **WHEN** one node of each primitive and an unknown node
- **THEN** each draws and the unknown node draws its children
- **VERIFIES** [[backend.render.p_primitives]]

#### Scenario: p_determinism

- **WHEN** random views
- **THEN** two draws produce equal pixels
- **VERIFIES** [[backend.render.p_determinism]]

#### Scenario: p_stack

- **WHEN** random nested views
- **THEN** stack depth is 0 after draw
- **VERIFIES** [[backend.render.p_stack]]

#### Scenario: p_index

- **WHEN** text hello at x from -5 to 200
- **THEN** index is 0 at the left, 5 at the right and never decreases
- **VERIFIES** [[backend.render.p_index]]

#### Scenario: p_clipboard

- **WHEN** copy hello and a paste event
- **THEN** the clipboard gets hello and the paste arrives as a string
- **VERIFIES** [[backend.render.p_clipboard]]

#### Scenario: p_headless

- **WHEN** the todo-app initial state in a runtime with no DOM
- **THEN** an image of non-zero size is produced
- **VERIFIES** [[backend.render.p_headless]]

#### Scenario: p_dpr

- **WHEN** dpr in 1, 2, 3
- **THEN** backing size equals css size times dpr
- **VERIFIES** [[backend.render.p_dpr]]

#### Scenario: p_resize

- **WHEN** random viewport sizes
- **THEN** a redraw follows each resize with the new size in context
- **VERIFIES** [[backend.render.p_resize]]

#### Scenario: p_input

- **WHEN** scripted pointer events
- **THEN** the router receives view-space coordinates
- **VERIFIES** [[backend.render.p_input]]

#### Scenario: p_keys

- **WHEN** a, A, Enter, Backspace, ArrowLeft, Shift
- **THEN** a, A, enter, backspace, left and nothing
- **VERIFIES** [[backend.render.p_keys]]

#### Scenario: p_touch_action

- **WHEN** mounted canvas
- **THEN** computed touch-action is none
- **VERIFIES** [[backend.render.p_touch_action]]

#### Scenario: p_raf

- **WHEN** N requests per frame
- **THEN** one draw per frame
- **VERIFIES** [[backend.render.p_raf]]

#### Scenario: p_swappable

- **WHEN** counter-counter on each backend
- **THEN** the same click yields the same effect list
- **VERIFIES** [[backend.render.p_swappable]]

#### Scenario: p_text_metrics

- **WHEN** text backend
- **THEN** a label of 5 characters measures 5 by 1
- **VERIFIES** [[backend.render.p_text_metrics]]

#### Scenario: p_a11y

- **WHEN** views with buttons
- **THEN** one accessible node per interactive node
- **VERIFIES** [[backend.render.p_a11y]]

#### Scenario: p_safe_area

- **WHEN** simulated insets
- **THEN** content stays inside the insets
- **VERIFIES** [[backend.render.p_safe_area]]

