---
id: spec
kind: intent
statement: "WHILE a textarea holds focus THE textarea SHALL translate key, pointer and clipboard events into effects that edit its text, cursor and selection."
---

# components.textarea

Port of `textarea`, `textarea-view`, `textarea-light`, `selectable-text` and the cursor effects in `basic_components.cljc`. Two details are easy to miss. **Focus is a path:** the contextual `focus` value equals the textarea's `$text` path when it is focused, and `::request-focus` sets it, which is why two textareas never both hold focus. **Editing state is split:** `text` and `focus` live in the app state, while `cursor`, `select-cursor`, `down-pos`, `mpos` and `last-click` live in a `textarea-state` extra map. Effects use multi-path `update` with `collect-one`, so text, cursor and selection change atomically. A few behaviours are faithful quirks of the original and are specified as such, for example previous-line lands on the newline character itself.

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| focus_by_path | invariant | a textarea is focused exactly when context focus deep-equals its text path, and request-focus sets focus to that path | [[spec]] | app.toplevel.focus_effect (cross-file) |
| request_focus_on_hit | invariant | a pointer down inside the textarea that yields intents returns request-focus followed by those intents, and a pointer down that yields none returns nothing | [[spec]] |  |
| keys_need_focus | invariant | an unfocused textarea returns no effects for key-press or clipboard events | [[spec]] |  |
| key_map | invariant | up, down, left, right, enter and backspace map to previous-line, next-line, backward-char, forward-char, insert-newline and delete-backward, any string inserts text, and any other key is ignored | [[spec]] |  |
| insert_splice | invariant | inserting s with cursor c and no selection yields text[0..c] + s + text[c..] with cursor c + len(s), and a nil text yields s | [[spec]] |  |
| insert_replaces_selection | invariant | with a select cursor the range from min(c, sc) to max(c, sc), clamped to len(text), is replaced by s, the cursor becomes min(c, sc) + len(s), and the selection is cleared | [[spec]] |  |
| delete_backward_rule | invariant | with no selection it removes the character before the cursor, where the cursor is first clamped to len(text) and a cursor at 0 removes nothing and with a selection it removes the selected range, and the cursor becomes max(0, min(sc, c) or c - 1) and the selection is cleared | [[spec]] |  |
| cursor_clamped | invariant | after any effect 0 <= cursor <= len(text), forward-char gives min(len, c + 1) and backward-char gives max(0, min(len, c) - 1), and both clear the selection | [[spec]] |  |
| previous_line_quirk | invariant | previous-line clears the selection and sets the cursor to the index of the last newline at or before c - 1, or to 0 when there is none, which is the newline character itself and not the line start | [[spec]] |  |
| next_line_rule | invariant | next-line clears the selection and sets the cursor to one past the next newline at or after c, or to len(text) when there is none | [[spec]] |  |
| pointer_down_cursor | invariant | a pointer down moves the cursor to indexForPosition(font, text, x, y), stores mpos and down-pos as the position, and clears the selection | [[spec]] |  |
| drag_tracks | invariant | a pointer move while down-pos is set stores mpos, and with no down-pos it returns nothing | [[spec]] |  |
| finish_drag_rule | invariant | on pointer up the end index is indexForPosition at the position, the selection start is the index at down-pos when it differs from the end index, plus one when it lies after the end index, and down-pos is cleared | [[spec]] |  |
| double_click_word | invariant | a second click within 500 ms and with squared distance under 100 from the last click selects from the whitespace-bounded word start to the next whitespace or the end of text, and every click records the time and position | [[spec]] |  |
| clipboard_copy_rule | invariant | copy with focus and a selection returns the clipboard-copy effect with text[min..max] and otherwise returns nothing | [[spec]] |  |
| clipboard_cut_rule | invariant | cut with focus and a selection sets the cursor to the range start, clears the selection, sets the text without the range, and returns clipboard-cut with the range and a new-text notification | [[spec]] |  |
| clipboard_paste_rule | invariant | paste with focus returns insert-text with the pasted string | [[spec]] |  |
| text_state_split | invariant | text and focus are edited in app state while cursor, select-cursor, down-pos, mpos and last-click are edited in the textarea-state extra map | [[spec]] |  |
| border_default | invariant | the bordered variant is the default, with padding 5 on x and 2 on y and a 0.65 gray stroke, and the light variant has no border and a 0.97 gray fill | [[spec]] |  |
| selection_drawn | invariant | a selection draws a highlight over its range, and a focused textarea draws a translucent gray cursor | [[spec]] |  |
| enter_event_bubbles | invariant | the enter key effect is a normal effect so a wrapping handler can replace it, as todo-app does | [[spec]] |  |
| ime_compose | advisory | composition input from a mobile keyboard is applied as one insert-text at the end of composition | [[spec]] |  |

## Model

### States

- `unfocused`
- `focused`
- `selecting`
- `selected`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_focus | unfocused | focused | [[spec.request_focus_on_hit]] |
| t_drag_start | focused | selecting | [[spec.pointer_down_cursor]] |
| t_drag_end | selecting | selected | [[spec.finish_drag_rule]] |
| t_edit_selected | selected | focused | [[spec.insert_replaces_selection]] |
| t_move | selected | focused | [[spec.cursor_clamped]] |
| t_blur | focused | unfocused | app.toplevel.click_away_blurs (cross-file) |
| t_blur_selected | selected | unfocused | app.toplevel.click_away_blurs (cross-file) |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_focus_path | unit | [[spec.focus_by_path]] | two textareas with different text paths | requesting focus on one leaves the other unfocused |
| p_request_focus | unit | [[spec.request_focus_on_hit]] | click inside and on empty space | inside returns request-focus first, empty returns nothing |
| p_keys_focus | unit | [[spec.keys_need_focus]] | key events while unfocused | no effects |
| p_key_map | unit | [[spec.key_map]] | each named key and the string s | each yields its effect and others yield none |
| p_insert | unit | [[spec.insert_splice]] | text hello cursor 2 s XY and nil text | hello becomes heXYllo cursor 4, and nil gives XY |
| p_insert_sel | unit | [[spec.insert_replaces_selection]] | text hello cursor 4 select-cursor 1 s Z | text becomes hZo cursor 2 selection nil |
| p_delete | unit | [[spec.delete_backward_rule]] | cursor 0, cursor 3 and a selection | no change at 0, one char removed at 3, range removed with a selection |
| p_cursor | unit | [[spec.cursor_clamped]] | random moves | 0 <= cursor <= len(text) |
| p_prev_line | unit | [[spec.previous_line_quirk]] | text ab newline cd with cursor 4 | cursor becomes 2 and the selection is cleared |
| p_next_line | unit | [[spec.next_line_rule]] | the same text with cursor 0 and cursor 4 | cursor becomes 3 then 5 |
| p_down_cursor | unit | [[spec.pointer_down_cursor]] | click at a known glyph | cursor, mpos and down-pos are set and selection is nil |
| p_drag | unit | [[spec.drag_tracks]] | move with and without down-pos | mpos is set only with down-pos |
| p_finish_drag | unit | [[spec.finish_drag_rule]] | drag from index 1 to index 4 | selection and cursor follow the rule and down-pos is nil |
| p_double_click | unit | [[spec.double_click_word]] | two clicks 200 ms apart then 600 ms apart | the first pair selects a word and the second does not |
| p_copy | unit | [[spec.clipboard_copy_rule]] | selected and unselected | text range or nothing |
| p_cut | unit | [[spec.clipboard_cut_rule]] | selection 1 to 3 in hello | text becomes hlo and the clipboard gets el |
| p_paste | unit | [[spec.clipboard_paste_rule]] | paste focused and unfocused | insert-text or nothing |
| p_state_split | unit | [[spec.text_state_split]] | editing and moving | text paths point into app state and cursor paths into extra |
| p_border | unit | [[spec.border_default]] | both variants | bordered view is larger by 10 by 4 than its body and light has no stroke |
| p_selection_drawn | unit | [[spec.selection_drawn]] | selection present and focused | highlight and cursor nodes exist |
| p_enter | unit | [[spec.enter_event_bubbles]] | enter while focused | the insert-newline effect is returned so it can be replaced |
| p_ime | unit | [[spec.ime_compose]] | composition events | one insert-text at the end |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_focus_path

- **WHEN** two textareas with different text paths
- **THEN** requesting focus on one leaves the other unfocused
- **VERIFIES** [[spec.p_focus_path]]

#### Scenario: p_request_focus

- **WHEN** click inside and on empty space
- **THEN** inside returns request-focus first, empty returns nothing
- **VERIFIES** [[spec.p_request_focus]]

#### Scenario: p_keys_focus

- **WHEN** key events while unfocused
- **THEN** no effects
- **VERIFIES** [[spec.p_keys_focus]]

#### Scenario: p_key_map

- **WHEN** each named key and the string s
- **THEN** each yields its effect and others yield none
- **VERIFIES** [[spec.p_key_map]]

#### Scenario: p_insert

- **WHEN** text hello cursor 2 s XY and nil text
- **THEN** hello becomes heXYllo cursor 4, and nil gives XY
- **VERIFIES** [[spec.p_insert]]

#### Scenario: p_insert_sel

- **WHEN** text hello cursor 4 select-cursor 1 s Z
- **THEN** text becomes hZo cursor 2 selection nil
- **VERIFIES** [[spec.p_insert_sel]]

#### Scenario: p_delete

- **WHEN** cursor 0, cursor 3 and a selection
- **THEN** no change at 0, one char removed at 3, range removed with a selection
- **VERIFIES** [[spec.p_delete]]

#### Scenario: p_cursor

- **WHEN** random moves
- **THEN** 0 <= cursor <= len(text)
- **VERIFIES** [[spec.p_cursor]]

#### Scenario: p_prev_line

- **WHEN** text ab newline cd with cursor 4
- **THEN** cursor becomes 2 and the selection is cleared
- **VERIFIES** [[spec.p_prev_line]]

#### Scenario: p_next_line

- **WHEN** the same text with cursor 0 and cursor 4
- **THEN** cursor becomes 3 then 5
- **VERIFIES** [[spec.p_next_line]]

#### Scenario: p_down_cursor

- **WHEN** click at a known glyph
- **THEN** cursor, mpos and down-pos are set and selection is nil
- **VERIFIES** [[spec.p_down_cursor]]

#### Scenario: p_drag

- **WHEN** move with and without down-pos
- **THEN** mpos is set only with down-pos
- **VERIFIES** [[spec.p_drag]]

#### Scenario: p_finish_drag

- **WHEN** drag from index 1 to index 4
- **THEN** selection and cursor follow the rule and down-pos is nil
- **VERIFIES** [[spec.p_finish_drag]]

#### Scenario: p_double_click

- **WHEN** two clicks 200 ms apart then 600 ms apart
- **THEN** the first pair selects a word and the second does not
- **VERIFIES** [[spec.p_double_click]]

#### Scenario: p_copy

- **WHEN** selected and unselected
- **THEN** text range or nothing
- **VERIFIES** [[spec.p_copy]]

#### Scenario: p_cut

- **WHEN** selection 1 to 3 in hello
- **THEN** text becomes hlo and the clipboard gets el
- **VERIFIES** [[spec.p_cut]]

#### Scenario: p_paste

- **WHEN** paste focused and unfocused
- **THEN** insert-text or nothing
- **VERIFIES** [[spec.p_paste]]

#### Scenario: p_state_split

- **WHEN** editing and moving
- **THEN** text paths point into app state and cursor paths into extra
- **VERIFIES** [[spec.p_state_split]]

#### Scenario: p_border

- **WHEN** both variants
- **THEN** bordered view is larger by 10 by 4 than its body and light has no stroke
- **VERIFIES** [[spec.p_border]]

#### Scenario: p_selection_drawn

- **WHEN** selection present and focused
- **THEN** highlight and cursor nodes exist
- **VERIFIES** [[spec.p_selection_drawn]]

#### Scenario: p_enter

- **WHEN** enter while focused
- **THEN** the insert-newline effect is returned so it can be replaced
- **VERIFIES** [[spec.p_enter]]

#### Scenario: p_ime

- **WHEN** composition events
- **THEN** one insert-text at the end
- **VERIFIES** [[spec.p_ime]]

