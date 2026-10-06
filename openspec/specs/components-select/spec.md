---
id: spec
kind: intent
statement: "WHEN the user opens a dropdown and chooses an option THE dropdown SHALL set the selected path to that option value and close the list."
---

# components.select

Port of `dropdown` and `dropdown-list` from `basic_components.cljc`. `options` is a vector of `[value, label]` pairs. The header shows the label of the selected option, or a gray "no selection". The list is rendered only while `open?`. Choosing a row returns `[::select $selected value]`, which the dropdown intercepts (see event.bubble) and expands to select plus close. The per-row hover flag lives in `extra` keyed `[hover?, value]`.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| header_toggles | invariant | a pointer down on the header returns the effect that updates open? with logical not | [[spec]] |
| header_label | invariant | the header shows the label of the first option whose value equals selected, and a gray no selection text when none matches or selected is nil | [[spec]] |
| list_when_open | invariant | the list is part of the view only when open? is true | [[spec]] |
| row_select_effect | invariant | a pointer down on a row returns select with the selected path and the row value | [[spec]] |
| select_closes | invariant | the dropdown rewrites a select intent into select followed by the effect that sets open? to false | [[spec]] |
| select_sets_value | invariant | the select effect sets the selected path to the value | [[spec]] |
| row_visuals | invariant | the selected row has a blue fill [0, 0.48, 1] with a white label and a hovered row has a light gray fill [0.976, 0.976, 0.976] | [[spec]] |
| list_geometry | invariant | the row width is the widest label plus 24, a row is label height plus 4 tall, and the box has 8 padding on y and rounded corners of 4 | [[spec]] |
| row_hover_keyed | invariant | row hover flags are stored in extra under a key made of the hover marker and the row value, so rows hover independently | [[spec]] |
| touch_rows | invariant | rows are at least 44 px tall on touch devices | [[spec]] |

## Model

### States

- `closed`
- `open`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_open | closed | open | [[spec.header_toggles]] |
| t_choose | open | closed | [[spec.select_closes]] |
| t_toggle_shut | open | closed | [[spec.header_toggles]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_header_toggle | unit | [[spec.header_toggles]] | open? false then true | the effect flips open? |
| p_header_label | unit | [[spec.header_label]] | options this, that, the-other and selected that | label is That, and with nil it is no selection |
| p_list_open | unit | [[spec.list_when_open]] | open? both values | list nodes exist only when open |
| p_row_effect | unit | [[spec.row_select_effect]] | click second row | effect is select with the selected path and that |
| p_select_closes | unit | [[spec.select_closes]] | a select intent | output is select then set open? false |
| p_select_sets | unit | [[spec.select_sets_value]] | select then read | the selected path holds the value |
| p_row_visuals | unit | [[spec.row_visuals]] | selected and hovered rows | fills and label colors match |
| p_geometry | unit | [[spec.list_geometry]] | labels of three widths | row width equals max plus 24 |
| p_row_hover | unit | [[spec.row_hover_keyed]] | hover two different rows | two distinct extra keys |
| p_touch_rows | unit | [[spec.touch_rows]] | touch device | row height is at least 44 |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_header_toggle

- **WHEN** open? false then true
- **THEN** the effect flips open?
- **VERIFIES** [[spec.p_header_toggle]]

#### Scenario: p_header_label

- **WHEN** options this, that, the-other and selected that
- **THEN** label is That, and with nil it is no selection
- **VERIFIES** [[spec.p_header_label]]

#### Scenario: p_list_open

- **WHEN** open? both values
- **THEN** list nodes exist only when open
- **VERIFIES** [[spec.p_list_open]]

#### Scenario: p_row_effect

- **WHEN** click second row
- **THEN** effect is select with the selected path and that
- **VERIFIES** [[spec.p_row_effect]]

#### Scenario: p_select_closes

- **WHEN** a select intent
- **THEN** output is select then set open? false
- **VERIFIES** [[spec.p_select_closes]]

#### Scenario: p_select_sets

- **WHEN** select then read
- **THEN** the selected path holds the value
- **VERIFIES** [[spec.p_select_sets]]

#### Scenario: p_row_visuals

- **WHEN** selected and hovered rows
- **THEN** fills and label colors match
- **VERIFIES** [[spec.p_row_visuals]]

#### Scenario: p_geometry

- **WHEN** labels of three widths
- **THEN** row width equals max plus 24
- **VERIFIES** [[spec.p_geometry]]

#### Scenario: p_row_hover

- **WHEN** hover two different rows
- **THEN** two distinct extra keys
- **VERIFIES** [[spec.p_row_hover]]

#### Scenario: p_touch_rows

- **WHEN** touch device
- **THEN** row height is at least 44
- **VERIFIES** [[spec.p_touch_rows]]

