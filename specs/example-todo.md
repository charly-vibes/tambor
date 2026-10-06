---
id: example.todo
kind: intent
statement: "WHEN the user adds, completes, edits, deletes or filters todos THE todo app SHALL apply the change to the matching item of the underlying list even while a filter is showing only some items."
---

# example.todo

Acceptance spec from `src/membrane/example/todo.cljc` (and `terminal_todo.clj`, the same app on another backend). Components: `delete-X` (a plain view, two 3px red strokes from [0,0]-[10,10] and [10,0]-[0,10]), `todo-item` (delete X at translate(5,5) whose pointer down returns `[[:delete $todo]]`, a checkbox at translate(10,4) bound to `(:complete? todo)`, a 10 px spacer and a textarea bound to `(:description todo)`), `todo-list` (vertical layout with `spacer(0,5)` between rows), `toggle` (option labels, the selected one plain and the others gray and clickable, returning `[[:set $selected option]]`) and `todo-app` (Add Todo button and a textarea with an Enter shortcut, then the toggle, then the filtered list). The initial data is `first` (open), `second` (open), `third` (complete). The central subtlety is that the list shown is `filter(filter-fn, todos)`, yet every item path still reaches the original list, so path.derivation and state.paths are what make this app correct.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| delete_x_geometry | invariant | delete-X draws two strokes of width 3 in red [1, 0, 0] from [0, 0] to [10, 10] and from [10, 0] to [0, 10], and has bounds [10, 10] | [[example.todo]] |
| item_layout | invariant | todo-item is a horizontal layout of the delete X translated by (5, 5), the checkbox translated by (10, 4), a spacer 10 wide, and the textarea | [[example.todo]] |
| item_bindings | invariant | the checkbox is bound to the complete flag of the todo and the textarea to its description, with paths through the todo path | [[example.todo]] |
| delete_emits | invariant | a pointer down inside the delete X region returns exactly delete with the todo path | [[example.todo]] |
| delete_removes_item | invariant | applying delete at a todo path removes exactly that todo from the underlying list, keeping the order of the rest | [[example.todo]] |
| complete_toggles | invariant | a pointer down on a checkbox toggles the complete flag of that todo only | [[example.todo]] |
| list_spacing | invariant | todo-list is a vertical layout with a spacer of height 5 interposed between rows | [[example.todo]] |
| toggle_render | invariant | in toggle the selected option is a plain label and every other option is a clickable label in gray [0.8, 0.8, 0.8] separated by 5 px spacers | [[example.todo]] |
| toggle_sets_filter | invariant | clicking a non-selected option returns set with the selected path and that option, and the selected option itself handles nothing | [[example.todo]] |
| filter_default | invariant | selected-filter defaults to the unfiltered option | [[example.todo]] |
| filter_fns | invariant | unfiltered shows every todo, active shows todos with complete? false and complete shows todos with complete? true | [[example.todo]] |
| unknown_filter_all | advisory | an unknown filter name shows all todos, whereas the original falls back to a keyword that hides everything | [[example.todo]] |
| filtered_paths_original | invariant | an item shown at visible index j under a filter has the path todos then filter then seq-nth(j), so select, set, toggle and delete reach the matching original element | [[example.todo]] |
| add_button | invariant | the Add Todo button returns add-todo with the todos path and the current next-todo-text, then set next-todo-text to the empty string | [[example.todo]] |
| add_appends | invariant | applying add-todo appends a todo with that description and complete? false to the end of the underlying list | [[example.todo]] |
| enter_adds | invariant | the Enter key while the new-todo textarea is focused returns the same two effects as the Add Todo button instead of inserting a newline | [[example.todo]] |
| enter_unfocused_nothing | invariant | the Enter key while the new-todo textarea is not focused returns nothing | [[example.todo]] |
| other_keys_default | invariant | any key other than Enter returns the textarea's default effects unchanged | [[example.todo]] |
| new_todo_layout | invariant | the new-todo textarea is translated by (10, 10) beside the Add Todo button, followed by a 10 px spacer, the toggle, a 10 px spacer, and the list | [[example.todo]] |
| image_render | invariant | the app renders to an image with no window from plain state, as save-image does in the original | [[example.todo]] |
| backend_portable | invariant | the same todo-app definition runs on the canvas, dom and text-terminal backends without change | [[example.todo]] |
| todo_touch_targets | invariant | the delete X, checkbox and toggle labels each have a hit area of at least 44 by 44 on touch devices while their drawn size is unchanged | [[example.todo]] |

## Model

### States

- `unfiltered`
- `active_only`
- `complete_only`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_to_active | unfiltered | active_only | [[example.todo.toggle_sets_filter]] |
| t_to_complete | unfiltered | complete_only | [[example.todo.toggle_sets_filter]] |
| t_active_to_complete | active_only | complete_only | [[example.todo.toggle_sets_filter]] |
| t_complete_to_active | complete_only | active_only | [[example.todo.toggle_sets_filter]] |
| t_active_to_unfiltered | active_only | unfiltered | [[example.todo.toggle_sets_filter]] |
| t_complete_to_unfiltered | complete_only | unfiltered | [[example.todo.toggle_sets_filter]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_delete_x | unit | [[example.todo.delete_x_geometry]] | render delete-X | two path nodes with width 3, red, endpoints as stated, and bounds [10, 10] |
| p_item_layout | unit | [[example.todo.item_layout]] | one todo | x offsets are increasing in the stated order and the checkbox origin is [10, 4] relative to the row |
| p_item_bindings | unit | [[example.todo.item_bindings]] | todo second with complete? false | checkbox is unchecked and textarea text is second, and the paths end in complete? and description |
| p_delete_emits | unit | [[example.todo.delete_emits]] | click at [8, 8] and at [20, 8] on a row | the first returns delete with the todo path and the second does not |
| p_delete | unit | [[example.todo.delete_removes_item]] | todos first, second, third and delete the first | list becomes second, third |
| p_complete | unit | [[example.todo.complete_toggles]] | click the second checkbox | only the second todo becomes complete |
| p_spacing | unit | [[example.todo.list_spacing]] | three todos | row offsets differ by row height plus 5 plus the gap |
| p_toggle_render | unit | [[example.todo.toggle_render]] | options all, active, complete with selected active | active is plain and the other two are gray and clickable |
| p_toggle | unit | [[example.todo.toggle_sets_filter]] | click on the active label | effect is set selected-filter to active, and a click on the selected label returns nothing |
| p_filter_default | unit | [[example.todo.filter_default]] | no selected-filter | the unfiltered option is selected and three rows render |
| p_filter_fns | unit | [[example.todo.filter_fns]] | todos first, second, third with third complete | unfiltered shows 3, active shows first and second, complete shows third |
| p_unknown_filter | unit | [[example.todo.unknown_filter_all]] | selected-filter bogus | three rows render |
| p_filtered_paths | unit | [[example.todo.filtered_paths_original]] | active filter and a delete click on visible index 1 | original list becomes first, third |
| p_filtered_toggle | unit | [[example.todo.filtered_paths_original]] | complete filter and unchecking the only visible todo | third becomes open and the next render under complete shows no rows |
| p_add_button | unit | [[example.todo.add_button]] | next-todo-text hello | effects are add-todo with todos path and hello, then set next-todo-text to the empty string |
| p_add | unit | [[example.todo.add_appends]] | apply add-todo hello | list ends with description hello and complete? false |
| p_enter | unit | [[example.todo.enter_adds]] | focused new-todo textarea and the enter key | effects equal those of the button |
| p_enter_unfocused | unit | [[example.todo.enter_unfocused_nothing]] | unfocused textarea and enter | no effects |
| p_other_keys | unit | [[example.todo.other_keys_default]] | focused and the key x | the textarea default insert-text effect is returned |
| p_new_todo_layout | unit | [[example.todo.new_todo_layout]] | initial state | top row textarea origin is [10, 10] relative to the button's right edge and the toggle is below it |
| p_image | unit | [[example.todo.image_render]] | initial state and no DOM | an image buffer of non-zero size is produced |
| p_portable | unit | [[example.todo.backend_portable]] | the three backends | each renders the app and routes a click to the same effect |
| p_todo_touch | unit | [[example.todo.todo_touch_targets]] | touch device | each hit area is at least 44 by 44 and the visual bounds are unchanged |
