---
id: spec
kind: intent
statement: "WHEN the pointer enters or leaves a hover-aware component THE component SHALL update its hover flag through effects, and the button and checkbox SHALL fire on pointer down."
---

# components.hover

Port of `on-hover`, `on-mouse-out`, `button` and `checkbox` from `basic_components.cljc`. Hover is stored as a `hover?` prop, so it lives in the component's `extra` state and is edited through paths like any other state. Entering sets it on mouse-move over the body. Leaving is detected by a *global* mouse-move, which is why the root must always report `has-mouse-move-global`. The bound check on leave is inclusive at the upper edge (`x > w`), unlike hit-testing, which is half-open.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| hover_enter | invariant | when hover? is false a mouse-move over the body returns the effect that sets hover? to true | [[spec]] |
| hover_leave | invariant | when hover? is true a global mouse-move at x < 0, x > w, y < 0 or y > h returns the child intents plus the effect that sets hover? to false | [[spec]] |
| hover_stays_inside | invariant | when hover? is true a global mouse-move inside the box returns only the child intents | [[spec]] |
| mouse_out_callback | invariant | on-mouse-out additionally returns the mouse-out callback intents on leave, and on enter returns set hover? true followed by the child intents | [[spec]] |
| button_component | invariant | the basic button is an on-hover wrapper around a ui button with text, on-click and the hover flag, and on-click is a function with no arguments returning intents | [[spec]] |
| button_hover_visual | invariant | a hovered button draws a light gray rounded fill behind its border | [[spec]] |
| checkbox_toggle | invariant | a pointer down on a checkbox returns exactly the toggle effect carrying its checked path, and toggle updates that path with logical not | [[spec]] |
| checkbox_view_only | invariant | the plain ui checkbox draws state but handles no events | [[spec]] |
| touch_no_hover | advisory | hover effects are produced only for pointerType mouse | [[spec]] |

## Model

### States

- `not_hovered`
- `hovered`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_enter | not_hovered | hovered | [[spec.hover_enter]] |
| t_leave | hovered | not_hovered | [[spec.hover_leave]] |
| t_stay | hovered | hovered | [[spec.hover_stays_inside]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_enter | unit | [[spec.hover_enter]] | move inside a 40 by 20 body | the effect sets hover? to true |
| p_leave | unit | [[spec.hover_leave]] | global moves at -1, 41 and 21 | each adds set hover? false to the child intents |
| p_stay | unit | [[spec.hover_stays_inside]] | global move at 10, 10 | no hover effect is returned |
| p_mouse_out | unit | [[spec.mouse_out_callback]] | leave with a callback | callback intents follow the set false |
| p_button | unit | [[spec.button_component]] | text Add Todo with on-click | pointer down inside returns the on-click result and up returns nothing |
| p_button_visual | unit | [[spec.button_hover_visual]] | hover true and false | only the hovered view contains the fill |
| p_checkbox | unit | [[spec.checkbox_toggle]] | checked false then true | the effect is toggle with the checked path and applying it flips the value |
| p_checkbox_view | unit | [[spec.checkbox_view_only]] | ui checkbox | events return nothing |
| p_touch_hover | unit | [[spec.touch_no_hover]] | touch pointer moves | hover? is never set |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_enter

- **WHEN** move inside a 40 by 20 body
- **THEN** the effect sets hover? to true
- **VERIFIES** [[spec.p_enter]]

#### Scenario: p_leave

- **WHEN** global moves at -1, 41 and 21
- **THEN** each adds set hover? false to the child intents
- **VERIFIES** [[spec.p_leave]]

#### Scenario: p_stay

- **WHEN** global move at 10, 10
- **THEN** no hover effect is returned
- **VERIFIES** [[spec.p_stay]]

#### Scenario: p_mouse_out

- **WHEN** leave with a callback
- **THEN** callback intents follow the set false
- **VERIFIES** [[spec.p_mouse_out]]

#### Scenario: p_button

- **WHEN** text Add Todo with on-click
- **THEN** pointer down inside returns the on-click result and up returns nothing
- **VERIFIES** [[spec.p_button]]

#### Scenario: p_button_visual

- **WHEN** hover true and false
- **THEN** only the hovered view contains the fill
- **VERIFIES** [[spec.p_button_visual]]

#### Scenario: p_checkbox

- **WHEN** checked false then true
- **THEN** the effect is toggle with the checked path and applying it flips the value
- **VERIFIES** [[spec.p_checkbox]]

#### Scenario: p_checkbox_view

- **WHEN** ui checkbox
- **THEN** events return nothing
- **VERIFIES** [[spec.p_checkbox_view]]

#### Scenario: p_touch_hover

- **WHEN** touch pointer moves
- **THEN** hover? is never set
- **VERIFIES** [[spec.p_touch_hover]]

