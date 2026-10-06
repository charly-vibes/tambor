---
id: spec
kind: intent
statement: "WHEN the backend delivers an event to the app root THE top-level handler SHALL route it to the view, pass the resulting intents to the dispatcher, manage drag-scrolling and clear focus on a click that hits nothing."
---

# app.toplevel

Port of `TopEventHandler`, `wrap-scroll` and `wrap-start-scroll` in `component.cljc`. The root passes every event's intents through the handler. Scrollbars start a drag by returning a `start-scroll` intent holding a function from offset delta to intents. The root intercepts it, stores `{scrollf, mpos}` in the state, and feeds later mouse moves to `scrollf` until mouse-up. A mouse-down that produces no intents while a `focus` is set clears the focus, which is why clicking outside a textarea blurs it.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| all_events_dispatched | invariant | the result of every routed event (move, mouse event, drop, scroll, key event, key press, global move, enter, clipboard) is passed to the handler | [[spec]] |
| global_move_always | invariant | the root always reports has-mouse-move-global as true so hover-out works | [[spec]] |
| start_scroll_intercept | invariant | a mouse-down that yields start-scroll intents sets scroll-state to the scroll function and the position, using the deepest start-scroll intent which is the last one | [[spec]] |
| start_scroll_replaced | invariant | the chosen start-scroll intent is replaced by the result of calling its function with [0, 0], and the other intents keep their order with every start-scroll intent removed | [[spec]] |
| scroll_drag_delta | invariant | while scroll-state is set a mouse-move calls the stored function with the position minus the stored start position and returns its intents instead of routing the move | [[spec]] |
| scroll_release | invariant | a mouse-up while scroll-state is set returns only the effect that clears scroll-state | [[spec]] |
| click_away_blurs | invariant | a mouse-down with no intents and a non-nil focus returns the effect that sets focus to nil | [[spec]] |
| focus_kept_on_hit | invariant | a mouse-down with intents never clears focus | [[spec]] |
| state_namespaces | invariant | extra, context and top-extra live under reserved keys of the state, with focus inside context and scroll-state inside top-extra | [[spec]] |
| initial_state_default | invariant | make-app with no initial state starts from an empty map | [[spec]] |
| drag_effect | effect | on drag start the root emits a set of scroll-state to function and position | [[spec]] |
| focus_effect | effect | on click-away the root emits a set of focus to nil | [[spec]] |

## Model

### States

- `idle`
- `scrolling`
- `focus_held`
- `focus_cleared` emits: [[spec.focus_effect]]

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_start_scroll | idle | scrolling | [[spec.start_scroll_intercept]] |
| t_end_scroll | scrolling | idle | [[spec.scroll_release]] |
| t_take_focus | idle | focus_held | [[spec.focus_kept_on_hit]] |
| t_blur | focus_held | focus_cleared | [[spec.click_away_blurs]] |
| t_reset | focus_cleared | idle | [[spec.initial_state_default]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_all_dispatched | unit | [[spec.all_events_dispatched]] | scripted events of each type | the handler is called once per event |
| p_global_move | unit | [[spec.global_move_always]] | a view with no hover | has-mouse-move-global is true |
| p_start_scroll | unit | [[spec.start_scroll_intercept]] | two nested start-scroll intents | scroll-state holds the last one and the position |
| p_start_replaced | unit | [[spec.start_scroll_replaced]] | start-scroll amid other intents | order is kept and no start-scroll intent survives |
| p_scroll_drag | unit | [[spec.scroll_drag_delta]] | move from [0, 0] to [3, 7] | the function receives [3, 7] |
| p_scroll_release | unit | [[spec.scroll_release]] | mouse-up in a drag | the only effect is set scroll-state to nil |
| p_click_away | unit | [[spec.click_away_blurs]] | click on empty space with focus set | the effect sets focus to nil |
| p_focus_kept | unit | [[spec.focus_kept_on_hit]] | click on a handler with focus set | focus is untouched |
| p_namespaces | unit | [[spec.state_namespaces]] | app state with user keys | reserved keys never collide with user keys |
| p_initial | unit | [[spec.initial_state_default]] | make-app with no state | state equals an empty map |
| p_drag_effect | unit | [[spec.drag_effect]] | a scrollbar press | the set scroll-state effect is emitted |
| p_focus_effect | unit | [[spec.focus_effect]] | click-away | the set focus nil effect is emitted |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_all_dispatched

- **WHEN** scripted events of each type
- **THEN** the handler is called once per event
- **VERIFIES** [[spec.p_all_dispatched]]

#### Scenario: p_global_move

- **WHEN** a view with no hover
- **THEN** has-mouse-move-global is true
- **VERIFIES** [[spec.p_global_move]]

#### Scenario: p_start_scroll

- **WHEN** two nested start-scroll intents
- **THEN** scroll-state holds the last one and the position
- **VERIFIES** [[spec.p_start_scroll]]

#### Scenario: p_start_replaced

- **WHEN** start-scroll amid other intents
- **THEN** order is kept and no start-scroll intent survives
- **VERIFIES** [[spec.p_start_replaced]]

#### Scenario: p_scroll_drag

- **WHEN** move from [0, 0] to [3, 7]
- **THEN** the function receives [3, 7]
- **VERIFIES** [[spec.p_scroll_drag]]

#### Scenario: p_scroll_release

- **WHEN** mouse-up in a drag
- **THEN** the only effect is set scroll-state to nil
- **VERIFIES** [[spec.p_scroll_release]]

#### Scenario: p_click_away

- **WHEN** click on empty space with focus set
- **THEN** the effect sets focus to nil
- **VERIFIES** [[spec.p_click_away]]

#### Scenario: p_focus_kept

- **WHEN** click on a handler with focus set
- **THEN** focus is untouched
- **VERIFIES** [[spec.p_focus_kept]]

#### Scenario: p_namespaces

- **WHEN** app state with user keys
- **THEN** reserved keys never collide with user keys
- **VERIFIES** [[spec.p_namespaces]]

#### Scenario: p_initial

- **WHEN** make-app with no state
- **THEN** state equals an empty map
- **VERIFIES** [[spec.p_initial]]

#### Scenario: p_drag_effect

- **WHEN** a scrollbar press
- **THEN** the set scroll-state effect is emitted
- **VERIFIES** [[spec.p_drag_effect]]

#### Scenario: p_focus_effect

- **WHEN** click-away
- **THEN** the set focus nil effect is emitted
- **VERIFIES** [[spec.p_focus_effect]]

