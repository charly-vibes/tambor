---
id: components.textarea
kind: intent
statement: "WHILE a textarea holds focus THE textarea SHALL translate key, pointer and clipboard events into effects that edit its text, cursor and selection."
---

# components.textarea

Port of `textarea`, `textarea-view`, `textarea-light`, `selectable-text` and the cursor effects in `basic_components.cljc`. Two details are easy to miss. **Focus is a path:** the contextual `focus` value equals the textarea's `$text` path when it is focused, and `::request-focus` sets it, which is why two textareas never both hold focus. **Editing state is split:** `text` and `focus` live in the app state, while `cursor`, `select-cursor`, `down-pos`, `mpos` and `last-click` live in a `textarea-state` extra map. Effects use multi-path `update` with `collect-one`, so text, cursor and selection change atomically. A few behaviours are faithful quirks of the original and are specified as such, for example previous-line lands on the newline character itself.

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| focus_by_path | invariant | a textarea is focused exactly when context focus deep-equals its text path, and request-focus sets focus to that path | [[components.textarea]] | [[app.toplevel.focus_effect]] |
| request_focus_on_hit | invariant | a pointer down inside the textarea that yields intents returns request-focus followed by those intents, and a pointer down that yields none returns nothing | [[components.textarea]] | |
| keys_need_focus | invariant | an unfocused textarea returns no effects for key-press or clipboard events | [[components.textarea]] | |
| key_map | invariant | up, down, left, right, enter and backspace map to previous-line, next-line, backward-char, forward-char, insert-newline and delete-backward, any string inserts text, and any other key is ignored | [[components.textarea]] | |
| insert_splice | invariant | inserting s with cursor c and no selection yields text[0..c] + s + text[c..] with cursor c + len(s), and a nil text yields s | [[components.textarea]] | |
| insert_replaces_selection | invariant | with a select cursor the range from min(c, sc) to max(c, sc), clamped to len(text), is replaced by s, the cursor becomes min(c, sc) + len(s), and the selection is cleared | [[components.textarea]] | |
| delete_backward_rule | invariant | with no selection it removes the character before the cursor, where the cursor is first clamped to len(text) and a cursor at 0 removes nothing and with a selection it removes the selected range, and the cursor becomes max(0, min(sc, c) or c - 1) and the selection is cleared | [[components.textarea]] | |
| cursor_clamped | invariant | after any effect 0 <= cursor <= len(text), forward-char gives min(len, c + 1) and backward-char gives max(0, min(len, c) - 1), and both clear the selection | [[components.textarea]] | |
| previous_line_quirk | invariant | previous-line clears the selection and sets the cursor to the index of the last newline at or before c - 1, or to 0 when there is none, which is the newline character itself and not the line start | [[components.textarea]] | |
| next_line_rule | invariant | next-line clears the selection and sets the cursor to one past the next newline at or after c, or to len(text) when there is none | [[components.textarea]] | |
| pointer_down_cursor | invariant | a pointer down moves the cursor to indexForPosition(font, text, x, y), stores mpos and down-pos as the position, and clears the selection | [[components.textarea]] | |
| drag_tracks | invariant | a pointer move while down-pos is set stores mpos, and with no down-pos it returns nothing | [[components.textarea]] | |
| finish_drag_rule | invariant | on pointer up the end index is indexForPosition at the position, the selection start is the index at down-pos when it differs from the end index, plus one when it lies after the end index, and down-pos is cleared | [[components.textarea]] | |
| double_click_word | invariant | a second click within 500 ms and with squared distance under 100 from the last click selects from the whitespace-bounded word start to the next whitespace or the end of text, and every click records the time and position | [[components.textarea]] | |
| clipboard_copy_rule | invariant | copy with focus and a selection returns the clipboard-copy effect with text[min..max] and otherwise returns nothing | [[components.textarea]] | |
| clipboard_cut_rule | invariant | cut with focus and a selection sets the cursor to the range start, clears the selection, sets the text without the range, and returns clipboard-cut with the range and a new-text notification | [[components.textarea]] | |
| clipboard_paste_rule | invariant | paste with focus returns insert-text with the pasted string | [[components.textarea]] | |
| text_state_split | invariant | text and focus are edited in app state while cursor, select-cursor, down-pos, mpos and last-click are edited in the textarea-state extra map | [[components.textarea]] | |
| border_default | invariant | the bordered variant is the default, with padding 5 on x and 2 on y and a 0.65 gray stroke, and the light variant has no border and a 0.97 gray fill | [[components.textarea]] | |
| selection_drawn | invariant | a selection draws a highlight over its range, and a focused textarea draws a translucent gray cursor | [[components.textarea]] | |
| enter_event_bubbles | invariant | the enter key effect is a normal effect so a wrapping handler can replace it, as todo-app does | [[components.textarea]] | |
| ime_compose | advisory | composition input from a mobile keyboard is applied as one insert-text at the end of composition | [[components.textarea]] | |

## Model

### States

- `unfocused`
- `focused`
- `selecting`
- `selected`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_focus | unfocused | focused | [[components.textarea.request_focus_on_hit]] |
| t_drag_start | focused | selecting | [[components.textarea.pointer_down_cursor]] |
| t_drag_end | selecting | selected | [[components.textarea.finish_drag_rule]] |
| t_edit_selected | selected | focused | [[components.textarea.insert_replaces_selection]] |
| t_move | selected | focused | [[components.textarea.cursor_clamped]] |
| t_blur | focused | unfocused | [[app.toplevel.click_away_blurs]] |
| t_blur_selected | selected | unfocused | [[app.toplevel.click_away_blurs]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_focus_path | unit | [[components.textarea.focus_by_path]] | two textareas with different text paths | requesting focus on one leaves the other unfocused |
| p_request_focus | unit | [[components.textarea.request_focus_on_hit]] | click inside and on empty space | inside returns request-focus first, empty returns nothing |
| p_keys_focus | unit | [[components.textarea.keys_need_focus]] | key events while unfocused | no effects |
| p_key_map | unit | [[components.textarea.key_map]] | each named key and the string s | each yields its effect and others yield none |
| p_insert | unit | [[components.textarea.insert_splice]] | text hello cursor 2 s XY and nil text | hello becomes heXYllo cursor 4, and nil gives XY |
| p_insert_sel | unit | [[components.textarea.insert_replaces_selection]] | text hello cursor 4 select-cursor 1 s Z | text becomes hZo cursor 2 selection nil |
| p_delete | unit | [[components.textarea.delete_backward_rule]] | cursor 0, cursor 3 and a selection | no change at 0, one char removed at 3, range removed with a selection |
| p_cursor | unit | [[components.textarea.cursor_clamped]] | random moves | 0 <= cursor <= len(text) |
| p_prev_line | unit | [[components.textarea.previous_line_quirk]] | text ab newline cd with cursor 4 | cursor becomes 2 and the selection is cleared |
| p_next_line | unit | [[components.textarea.next_line_rule]] | the same text with cursor 0 and cursor 4 | cursor becomes 3 then 5 |
| p_down_cursor | unit | [[components.textarea.pointer_down_cursor]] | click at a known glyph | cursor, mpos and down-pos are set and selection is nil |
| p_drag | unit | [[components.textarea.drag_tracks]] | move with and without down-pos | mpos is set only with down-pos |
| p_finish_drag | unit | [[components.textarea.finish_drag_rule]] | drag from index 1 to index 4 | selection and cursor follow the rule and down-pos is nil |
| p_double_click | unit | [[components.textarea.double_click_word]] | two clicks 200 ms apart then 600 ms apart | the first pair selects a word and the second does not |
| p_copy | unit | [[components.textarea.clipboard_copy_rule]] | selected and unselected | text range or nothing |
| p_cut | unit | [[components.textarea.clipboard_cut_rule]] | selection 1 to 3 in hello | text becomes hlo and the clipboard gets el |
| p_paste | unit | [[components.textarea.clipboard_paste_rule]] | paste focused and unfocused | insert-text or nothing |
| p_state_split | unit | [[components.textarea.text_state_split]] | editing and moving | text paths point into app state and cursor paths into extra |
| p_border | unit | [[components.textarea.border_default]] | both variants | bordered view is larger by 10 by 4 than its body and light has no stroke |
| p_selection_drawn | unit | [[components.textarea.selection_drawn]] | selection present and focused | highlight and cursor nodes exist |
| p_enter | unit | [[components.textarea.enter_event_bubbles]] | enter while focused | the insert-newline effect is returned so it can be replaced |
| p_ime | unit | [[components.textarea.ime_compose]] | composition events | one insert-text at the end |
