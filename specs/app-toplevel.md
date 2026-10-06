---
id: app.toplevel
kind: intent
statement: "WHEN the backend delivers an event to the app root THE top-level handler SHALL route it to the view, pass the resulting intents to the dispatcher, manage drag-scrolling and clear focus on a click that hits nothing."
---

# app.toplevel

Port of `TopEventHandler`, `wrap-scroll` and `wrap-start-scroll` in `component.cljc`. The root passes every event's intents through the handler. Scrollbars start a drag by returning a `start-scroll` intent holding a function from offset delta to intents. The root intercepts it, stores `{scrollf, mpos}` in the state, and feeds later mouse moves to `scrollf` until mouse-up. A mouse-down that produces no intents while a `focus` is set clears the focus, which is why clicking outside a textarea blurs it.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| all_events_dispatched | invariant | the result of every routed event (move, mouse event, drop, scroll, key event, key press, global move, enter, clipboard) is passed to the handler | [[app.toplevel]] |
| global_move_always | invariant | the root always reports has-mouse-move-global as true so hover-out works | [[app.toplevel]] |
| start_scroll_intercept | invariant | a mouse-down that yields start-scroll intents sets scroll-state to the scroll function and the position, using the deepest start-scroll intent which is the last one | [[app.toplevel]] |
| start_scroll_replaced | invariant | the chosen start-scroll intent is replaced by the result of calling its function with [0, 0], and the other intents keep their order with every start-scroll intent removed | [[app.toplevel]] |
| scroll_drag_delta | invariant | while scroll-state is set a mouse-move calls the stored function with the position minus the stored start position and returns its intents instead of routing the move | [[app.toplevel]] |
| scroll_release | invariant | a mouse-up while scroll-state is set returns only the effect that clears scroll-state | [[app.toplevel]] |
| click_away_blurs | invariant | a mouse-down with no intents and a non-nil focus returns the effect that sets focus to nil | [[app.toplevel]] |
| focus_kept_on_hit | invariant | a mouse-down with intents never clears focus | [[app.toplevel]] |
| state_namespaces | invariant | extra, context and top-extra live under reserved keys of the state, with focus inside context and scroll-state inside top-extra | [[app.toplevel]] |
| initial_state_default | invariant | make-app with no initial state starts from an empty map | [[app.toplevel]] |
| drag_effect | effect | on drag start the root emits a set of scroll-state to function and position | [[app.toplevel]] |
| focus_effect | effect | on click-away the root emits a set of focus to nil | [[app.toplevel]] |

## Model

### States

- `idle`
- `scrolling`
- `focus_held`
- `focus_cleared` emits: [[app.toplevel.focus_effect]]

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_start_scroll | idle | scrolling | [[app.toplevel.start_scroll_intercept]] |
| t_end_scroll | scrolling | idle | [[app.toplevel.scroll_release]] |
| t_take_focus | idle | focus_held | [[app.toplevel.focus_kept_on_hit]] |
| t_blur | focus_held | focus_cleared | [[app.toplevel.click_away_blurs]] |
| t_reset | focus_cleared | idle | [[app.toplevel.initial_state_default]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_all_dispatched | unit | [[app.toplevel.all_events_dispatched]] | scripted events of each type | the handler is called once per event |
| p_global_move | unit | [[app.toplevel.global_move_always]] | a view with no hover | has-mouse-move-global is true |
| p_start_scroll | unit | [[app.toplevel.start_scroll_intercept]] | two nested start-scroll intents | scroll-state holds the last one and the position |
| p_start_replaced | unit | [[app.toplevel.start_scroll_replaced]] | start-scroll amid other intents | order is kept and no start-scroll intent survives |
| p_scroll_drag | unit | [[app.toplevel.scroll_drag_delta]] | move from [0, 0] to [3, 7] | the function receives [3, 7] |
| p_scroll_release | unit | [[app.toplevel.scroll_release]] | mouse-up in a drag | the only effect is set scroll-state to nil |
| p_click_away | unit | [[app.toplevel.click_away_blurs]] | click on empty space with focus set | the effect sets focus to nil |
| p_focus_kept | unit | [[app.toplevel.focus_kept_on_hit]] | click on a handler with focus set | focus is untouched |
| p_namespaces | unit | [[app.toplevel.state_namespaces]] | app state with user keys | reserved keys never collide with user keys |
| p_initial | unit | [[app.toplevel.initial_state_default]] | make-app with no state | state equals an empty map |
| p_drag_effect | unit | [[app.toplevel.drag_effect]] | a scrollbar press | the set scroll-state effect is emitted |
| p_focus_effect | unit | [[app.toplevel.focus_effect]] | click-away | the set focus nil effect is emitted |
