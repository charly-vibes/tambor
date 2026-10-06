---
id: components.numeric
kind: intent
statement: "WHEN the user presses a counter button or drags a slider THE numeric component SHALL change the bound number within its limits."
---

# components.numeric

Port of `counter` and `number-slider`. The counter is a "-" button, a centred label and a "+" button, with `num` defaulting to 0 and optional `min` and `max`. The slider maps the x position inside `max-width` (default 100) onto `[min, max]`, truncating when `integer?` and clamping always. It tracks `mdown?` so moves only count while pressed.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| counter_default | invariant | num defaults to 0 | [[components.numeric]] |
| counter_dec_rule | invariant | decrement updates num to max(min, num - 1) when min is given and to num - 1 otherwise | [[components.numeric]] |
| counter_inc_rule | invariant | increment updates num to min(max, num + 1) when max is given and to num + 1 otherwise | [[components.numeric]] |
| counter_label_width | invariant | the label is padded on both sides so the centred area is at least 20 wide | [[components.numeric]] |
| counter_buttons | invariant | the minus and plus buttons are basic buttons whose on-click returns the dec and inc effects with the path and the limit | [[components.numeric]] |
| slider_mapping | invariant | the value is min + (x / maxWidth) * (max - min), truncated toward zero when integer? is true, then clamped to [min, max] | [[components.numeric]] |
| slider_gesture | invariant | pointer down sets mdown? true and updates, pointer move updates only while mdown? is true, and pointer up sets mdown? false and updates | [[components.numeric]] |
| slider_label | invariant | the label shows num itself when integer? and num with two decimals otherwise | [[components.numeric]] |
| slider_fill | invariant | the filled width is maxWidth * (num - min) / (max - min) | [[components.numeric]] |
| slider_max_width_default | invariant | maxWidth defaults to 100 | [[components.numeric]] |
| slider_pointer_capture | advisory | on touch the slider keeps receiving moves after the finger leaves its bounds until release | [[components.numeric]] |

## Model

### States

- `idle`
- `adjusting`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_press | idle | adjusting | [[components.numeric.slider_gesture]] |
| t_release | adjusting | idle | [[components.numeric.slider_mapping]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_default | unit | [[components.numeric.counter_default]] | no num | num is 0 |
| p_dec | unit | [[components.numeric.counter_dec_rule]] | num 3 with min 3 and num 3 with no min | stays 3 then becomes 2 |
| p_inc | unit | [[components.numeric.counter_inc_rule]] | num 3 with max 3 and no max | stays 3 then becomes 4 |
| p_label_width | unit | [[components.numeric.counter_label_width]] | labels 1 and 12345 | centred area is at least 20 |
| p_buttons | unit | [[components.numeric.counter_buttons]] | click minus and plus | dec and inc effects carry path and limit |
| p_mapping | unit | [[components.numeric.slider_mapping]] | min 5 max 20 width 300 integer at x 150, x -10, x 400 | 12, 5 and 20 |
| p_gesture | unit | [[components.numeric.slider_gesture]] | move before down and after down | only the second updates |
| p_label | unit | [[components.numeric.slider_label]] | num 3 and 3.14159 | 3 and 3.14 |
| p_fill | unit | [[components.numeric.slider_fill]] | num 3 min 0 max 20 width 100 | width is 15 |
| p_max_width | unit | [[components.numeric.slider_max_width_default]] | no max-width | 100 |
| p_capture | unit | [[components.numeric.slider_pointer_capture]] | drag outside bounds on touch | updates continue until release |
