---
id: spec
kind: intent
statement: "WHEN the user types a filter or taps an item THE item selector SHALL show only matching items and toggle membership of the tapped item in the selected set."
---

# example.file_selector

Acceptance spec from `src/membrane/example/file_selector.clj`. `item-row` takes `item-name` and `selected?` and handles a pointer down by returning the *built-in* `[:update $selected? not]`, drawing a non-interactive checkbox (translate 5, 5) a 5 px spacer and a label. `item-selector` takes `item-names`, a `selected` set (default empty) and `str-filter` (default empty), shows a textarea bound to the filter, then the case-insensitively matching rows. It wraps each row in `on :update` to **override the child's built-in update** so that, instead of flipping a boolean, the selected set gains or loses the item name. That is a bubble intercept of a built-in effect, and the spec depends on event.bubble.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| row_layout | invariant | item-row is a horizontal layout of a non-interactive checkbox translated by (5, 5), a 5 px spacer and the name label | [[spec]] |
| row_default_toggle | invariant | on its own a row pointer down returns the built-in update of its selected? path with logical not | [[spec]] |
| set_intercept | invariant | the selector intercepts the built-in update from a row and replaces it with one update of the selected path that removes the name if present and adds it otherwise | [[spec]] |
| filter_matches | invariant | an item is shown when its lower-cased name contains the filter text as a substring, so the filter is matched against the lower-cased name as given | [[spec]] |
| filter_defaults | invariant | str-filter defaults to the empty string, which shows all items, and selected defaults to the empty set | [[spec]] |
| selected_membership | invariant | a row's selected? is whether the name is a member of the selected set | [[spec]] |
| selection_persists_under_filter | invariant | changing the filter does not change the selected set | [[spec]] |
| result_is_state | invariant | the final selection is read from the state after the app stops, as file-selector does | [[spec]] |

## Model

### States

- `empty_selection`
- `some_selected`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_select_first | empty_selection | some_selected | [[spec.set_intercept]] |
| t_deselect_last | some_selected | empty_selection | [[spec.set_intercept]] |
| t_toggle_more | some_selected | some_selected | [[spec.set_intercept]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_row_layout | unit | [[spec.row_layout]] | one row | checkbox at origin [5, 5], then spacer, then label in order |
| p_row_default | unit | [[spec.row_default_toggle]] | a row alone | the intent is update with the selected? path and not |
| p_intercept | unit | [[spec.set_intercept]] | selected set empty then containing b | tapping b yields add then remove, and the boolean path is never touched |
| p_filter | unit | [[spec.filter_matches]] | names a.txt, B.md, notes with filter b and filter t | b shows B.md and a.txt does not match, t shows a.txt and notes |
| p_defaults | unit | [[spec.filter_defaults]] | no props besides names | all names shown and the selected set is empty |
| p_membership | unit | [[spec.selected_membership]] | selected set containing a.txt | only that row is checked |
| p_persist | unit | [[spec.selection_persists_under_filter]] | select a.txt then filter to nothing then clear | a.txt is still selected |
| p_result | unit | [[spec.result_is_state]] | select two items and stop | the returned set equals the state set |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_row_layout

- **WHEN** one row
- **THEN** checkbox at origin [5, 5], then spacer, then label in order
- **VERIFIES** [[spec.p_row_layout]]

#### Scenario: p_row_default

- **WHEN** a row alone
- **THEN** the intent is update with the selected? path and not
- **VERIFIES** [[spec.p_row_default]]

#### Scenario: p_intercept

- **WHEN** selected set empty then containing b
- **THEN** tapping b yields add then remove, and the boolean path is never touched
- **VERIFIES** [[spec.p_intercept]]

#### Scenario: p_filter

- **WHEN** names a.txt, B.md, notes with filter b and filter t
- **THEN** b shows B.md and a.txt does not match, t shows a.txt and notes
- **VERIFIES** [[spec.p_filter]]

#### Scenario: p_defaults

- **WHEN** no props besides names
- **THEN** all names shown and the selected set is empty
- **VERIFIES** [[spec.p_defaults]]

#### Scenario: p_membership

- **WHEN** selected set containing a.txt
- **THEN** only that row is checked
- **VERIFIES** [[spec.p_membership]]

#### Scenario: p_persist

- **WHEN** select a.txt then filter to nothing then clear
- **THEN** a.txt is still selected
- **VERIFIES** [[spec.p_persist]]

#### Scenario: p_result

- **WHEN** select two items and stop
- **THEN** the returned set equals the state set
- **VERIFIES** [[spec.p_result]]

