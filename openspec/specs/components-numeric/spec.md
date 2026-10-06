---
id: spec
kind: intent
statement: "WHEN the user presses a counter button or drags a slider THE numeric component SHALL change the bound number within its limits."
---

# components.numeric

Port of `counter` and `number-slider`. The counter is a "-" button, a centred label and a "+" button, with `num` defaulting to 0 and optional `min` and `max`. The slider maps the x position inside `max-width` (default 100) onto `[min, max]`, truncating when `integer?` and clamping always. It tracks `mdown?` so moves only count while pressed.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| counter_default | invariant | num defaults to 0 | [[spec]] |
| counter_dec_rule | invariant | decrement updates num to max(min, num - 1) when min is given and to num - 1 otherwise | [[spec]] |
| counter_inc_rule | invariant | increment updates num to min(max, num + 1) when max is given and to num + 1 otherwise | [[spec]] |
| counter_label_width | invariant | the label is padded on both sides so the centred area is at least 20 wide | [[spec]] |
| counter_buttons | invariant | the minus and plus buttons are basic buttons whose on-click returns the dec and inc effects with the path and the limit | [[spec]] |
| slider_mapping | invariant | the value is min + (x / maxWidth) * (max - min), truncated toward zero when integer? is true, then clamped to [min, max] | [[spec]] |
| slider_gesture | invariant | pointer down sets mdown? true and updates, pointer move updates only while mdown? is true, and pointer up sets mdown? false and updates | [[spec]] |
| slider_label | invariant | the label shows num itself when integer? and num with two decimals otherwise | [[spec]] |
| slider_fill | invariant | the filled width is maxWidth * (num - min) / (max - min) | [[spec]] |
| slider_max_width_default | invariant | maxWidth defaults to 100 | [[spec]] |
| slider_pointer_capture | advisory | on touch the slider keeps receiving moves after the finger leaves its bounds until release | [[spec]] |

## Model

### States

- `idle`
- `adjusting`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_press | idle | adjusting | [[spec.slider_gesture]] |
| t_release | adjusting | idle | [[spec.slider_mapping]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_default | unit | [[spec.counter_default]] | no num | num is 0 |
| p_dec | unit | [[spec.counter_dec_rule]] | num 3 with min 3 and num 3 with no min | stays 3 then becomes 2 |
| p_inc | unit | [[spec.counter_inc_rule]] | num 3 with max 3 and no max | stays 3 then becomes 4 |
| p_label_width | unit | [[spec.counter_label_width]] | labels 1 and 12345 | centred area is at least 20 |
| p_buttons | unit | [[spec.counter_buttons]] | click minus and plus | dec and inc effects carry path and limit |
| p_mapping | unit | [[spec.slider_mapping]] | min 5 max 20 width 300 integer at x 150, x -10, x 400 | 12, 5 and 20 |
| p_gesture | unit | [[spec.slider_gesture]] | move before down and after down | only the second updates |
| p_label | unit | [[spec.slider_label]] | num 3 and 3.14159 | 3 and 3.14 |
| p_fill | unit | [[spec.slider_fill]] | num 3 min 0 max 20 width 100 | width is 15 |
| p_max_width | unit | [[spec.slider_max_width_default]] | no max-width | 100 |
| p_capture | unit | [[spec.slider_pointer_capture]] | drag outside bounds on touch | updates continue until release |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_default

- **WHEN** no num
- **THEN** num is 0
- **VERIFIES** [[spec.p_default]]

#### Scenario: p_dec

- **WHEN** num 3 with min 3 and num 3 with no min
- **THEN** stays 3 then becomes 2
- **VERIFIES** [[spec.p_dec]]

#### Scenario: p_inc

- **WHEN** num 3 with max 3 and no max
- **THEN** stays 3 then becomes 4
- **VERIFIES** [[spec.p_inc]]

#### Scenario: p_label_width

- **WHEN** labels 1 and 12345
- **THEN** centred area is at least 20
- **VERIFIES** [[spec.p_label_width]]

#### Scenario: p_buttons

- **WHEN** click minus and plus
- **THEN** dec and inc effects carry path and limit
- **VERIFIES** [[spec.p_buttons]]

#### Scenario: p_mapping

- **WHEN** min 5 max 20 width 300 integer at x 150, x -10, x 400
- **THEN** 12, 5 and 20
- **VERIFIES** [[spec.p_mapping]]

#### Scenario: p_gesture

- **WHEN** move before down and after down
- **THEN** only the second updates
- **VERIFIES** [[spec.p_gesture]]

#### Scenario: p_label

- **WHEN** num 3 and 3.14159
- **THEN** 3 and 3.14
- **VERIFIES** [[spec.p_label]]

#### Scenario: p_fill

- **WHEN** num 3 min 0 max 20 width 100
- **THEN** width is 15
- **VERIFIES** [[spec.p_fill]]

#### Scenario: p_max_width

- **WHEN** no max-width
- **THEN** 100
- **VERIFIES** [[spec.p_max_width]]

#### Scenario: p_capture

- **WHEN** drag outside bounds on touch
- **THEN** updates continue until release
- **VERIFIES** [[spec.p_capture]]

