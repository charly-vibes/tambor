---
id: spec
kind: intent
statement: "WHEN the user presses more on a counter THE counter app SHALL increment only that counter's number, and WHEN the user presses Add Counter THE app SHALL append a counter starting at 0."
---

# example.counter

Acceptance spec from `src/membrane/example/counter.cljc` and the README. `counter` takes `num` and lays out a "more!" button (a pointer-down handler returning `[[::counter-increment $num]]`) beside `label(num)`. `counter-counter` takes `nums` and stacks an "Add Counter" button above one `counter` per entry, built with `for num in nums`, so each counter's `$num` is `nums` plus `seq-nth(i)`. The README also shows the no-framework version, where a handler mutates an atom, which the port keeps as a "raw" mode.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| counter_layout | invariant | the counter is a horizontal layout of the more button then the label, in that order | [[spec]] |
| more_emits_increment | invariant | a pointer down inside the more button returns exactly one effect, counter-increment with the num path | [[spec]] |
| increment_applies | invariant | applying counter-increment adds 1 to the number at the path and changes nothing else | [[spec]] |
| stack_layout | invariant | counter-counter is a vertical layout of the Add Counter button then one counter per entry of nums, in order | [[spec]] |
| independent_counters | invariant | a counter at index i has the path nums then seq-nth(i), so pressing it changes only entry i | [[spec]] |
| add_appends_zero | invariant | pressing Add Counter returns add-counter with the nums path, and applying it appends 0 | [[spec]] |
| label_shows_number | invariant | the label text is the decimal string of num | [[spec]] |
| raw_mode_supported | invariant | a handler that mutates external state and returns nil is allowed in raw mode and triggers a repaint | [[spec]] |
| counter_touch_target | invariant | the more button has a hit area of at least 44 by 44 on touch devices | [[spec]] |

## Model

### States

- `empty_list`
- `has_counters`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_first_add | empty_list | has_counters | [[spec.add_appends_zero]] |
| t_more_add | has_counters | has_counters | [[spec.add_appends_zero]] |
| t_press_more | has_counters | has_counters | [[spec.increment_applies]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_layout | unit | [[spec.counter_layout]] | num 10 | child 0 is the button and child 1 is the label with x offset greater than the button width |
| p_more | unit | [[spec.more_emits_increment]] | num 10 and a click at the button centre | intents equal one counter-increment with the path to num |
| p_increment | unit | [[spec.increment_applies]] | state num 10 | state num becomes 11 |
| p_stack | unit | [[spec.stack_layout]] | nums 0, 1, 2 | four rows, button first then three counters |
| p_independent | unit | [[spec.independent_counters]] | nums 0, 1, 2 and a click on the second more | nums becomes 0, 2, 2 |
| p_add | unit | [[spec.add_appends_zero]] | nums 0, 1, 2 and a click on Add Counter | nums becomes 0, 1, 2, 0 and a fifth row appears |
| p_label | unit | [[spec.label_shows_number]] | num 10 | label text is 10 |
| p_raw | unit | [[spec.raw_mode_supported]] | atom counter and a mutating handler | the atom is 1 after one click and one repaint occurred |
| p_touch | unit | [[spec.counter_touch_target]] | touch device | hit area is at least 44 by 44 |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_layout

- **WHEN** num 10
- **THEN** child 0 is the button and child 1 is the label with x offset greater than the button width
- **VERIFIES** [[spec.p_layout]]

#### Scenario: p_more

- **WHEN** num 10 and a click at the button centre
- **THEN** intents equal one counter-increment with the path to num
- **VERIFIES** [[spec.p_more]]

#### Scenario: p_increment

- **WHEN** state num 10
- **THEN** state num becomes 11
- **VERIFIES** [[spec.p_increment]]

#### Scenario: p_stack

- **WHEN** nums 0, 1, 2
- **THEN** four rows, button first then three counters
- **VERIFIES** [[spec.p_stack]]

#### Scenario: p_independent

- **WHEN** nums 0, 1, 2 and a click on the second more
- **THEN** nums becomes 0, 2, 2
- **VERIFIES** [[spec.p_independent]]

#### Scenario: p_add

- **WHEN** nums 0, 1, 2 and a click on Add Counter
- **THEN** nums becomes 0, 1, 2, 0 and a fifth row appears
- **VERIFIES** [[spec.p_add]]

#### Scenario: p_label

- **WHEN** num 10
- **THEN** label text is 10
- **VERIFIES** [[spec.p_label]]

#### Scenario: p_raw

- **WHEN** atom counter and a mutating handler
- **THEN** the atom is 1 after one click and one repaint occurred
- **VERIFIES** [[spec.p_raw]]

#### Scenario: p_touch

- **WHEN** touch device
- **THEN** hit area is at least 44 by 44
- **VERIFIES** [[spec.p_touch]]

