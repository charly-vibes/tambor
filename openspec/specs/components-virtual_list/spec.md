---
id: components.virtual_list
kind: intent
statement: "WHEN a list is longer than its viewport THE virtual-list SHALL draw only the window of rows that intersects the viewport, with row offsets computed arithmetically from the declared row height and the scroll offset."
---

# components.virtual_list

A fixed-row-height list component for lists too long to draw whole. Props
are `count` (the item count), `row-height`, `gap`, `overscan`,
`scroll-bounds` (the viewport), `offset` (default [0, 0]), `row` (the
per-index row renderer) and `$offset`. The windowed state is the summary
record — item count, row step, content extent, scroll offset and the
half-open window — with no item list in it; rows are pulled per index
through the `row` renderer exactly for the drawn window. Row offsets are
`i * (row-height + gap)` — arithmetic, no DOM measurement. Scrolling, the
scroll range and the scrollbar reuse the scrollview's machinery
(components.scrollview) with the total set to [viewport width, extent];
the assembly composes over `scrollview`'s clip and wheel gates.

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| count_summary_state | invariant | the windowed state is the summary record — item count, row step, content extent, scroll offset and the half-open window bounds — with no item list in it; rows are pulled per index through the row renderer for the drawn window | [[components.virtual_list]] |  |
| offsets_arithmetic | invariant | row i sits at i * (row-height + gap) and the content extent is count * row-height + (count - 1) * gap, computed arithmetically with no DOM measurement consulted | [[components.virtual_list]] |  |
| window_half_open | invariant | the window [first, last) covers exactly the rows intersecting the viewport [oy, oy + vh) — row i spans [i * step, i * step + h) so it intersects exactly when oy - h < i * step < oy + vh | [[components.virtual_list]] |  |
| overscan_pads_window | invariant | the window is padded by the overscan rows on each side, clamped to [0, count]; scrolled past the content end the pad reaches back to the tail rows | [[components.virtual_list]] |  |
| overscan_pads_empty | invariant | an empty intersection — a viewport sitting inside a row gap or exactly aligned on a row boundary — does not void the pad: the padded window is the rows adjacent to the viewport edges, within one pitch per pad row on each side, clamped to [0, count]; the same rule that reaches back to the tail rows past the content end | [[components.virtual_list]] |  |
| range_formula | invariant | the maximum offset is max(0, extent - viewport height) and a scroll update clamps against it — the scrollview range rule over the content extent (components.scrollview.range_formula) | [[components.virtual_list]] |  |
| wheel_updates_offset | invariant | a scroll event over the viewport adds the wheel delta to the stored offset clamped to the range, and returns nothing when both axes are unchanged — the scrollview wheel rule (components.scrollview.wheel_updates_offset) over the content extent | [[components.virtual_list]] |  |
| drawn_window_only | invariant | the view draws exactly the window's rows, each placed at its arithmetic offset inside the body translated by the negated offset — no row outside the window is drawn | [[components.virtual_list]] |  |
| empty_window_zero | invariant | count 0, a non-positive viewport height or a non-positive row step yield the empty window, a zero extent and finite numbers, with nothing drawn | [[components.virtual_list]] |  |

## Model

### States

- `at_top`
- `scrolled`
- `at_bottom`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_down | at_top | scrolled | [[components.virtual_list.wheel_updates_offset]] |
| t_page | scrolled | at_bottom | [[components.virtual_list.range_formula]] |
| t_up | at_bottom | scrolled | [[components.virtual_list.wheel_updates_offset]] |
| t_return | scrolled | at_top | [[components.virtual_list.range_formula]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_offsets | unit | [[components.virtual_list.offsets_arithmetic]] | random index, row height and gap | row i sits at i * (row-height + gap) and the extent is the closed form |
| p_window | unit | [[components.virtual_list.window_half_open]] | mid-scroll offsets over random extents | the window covers exactly the rows intersecting the viewport, including the gap-boundary edges |
| p_overscan | unit | [[components.virtual_list.overscan_pads_window]] | overscan 2 over in-span offsets | the window extends by 2 rows each side, clamped, and reaches the tail past the end |
| p_range | unit | [[components.virtual_list.range_formula]] | extent 5000 over viewports 300 and 600 | max offset is 4700 and 4400 |
| p_wheel | unit | [[components.virtual_list.wheel_updates_offset]] | offset 0 and delta 50, offset at max and delta 50 | first updates to 50, second returns nothing |
| p_summary | unit | [[components.virtual_list.count_summary_state]] | random extents and offsets | the window state carries only numeric summaries — count, step, extent, offset, window — with no item list |
| p_empty | unit | [[components.virtual_list.empty_window_zero]] | count 0, viewport 0 and step 0 | the window is empty, extent 0, finite, nothing drawn |
| p_drawn | unit | [[components.virtual_list.drawn_window_only]] | random offsets over random extents | exactly the window's rows are drawn at their arithmetic offsets — a contiguous slice of the whole-list positions |
| p_gap_pad | unit | [[components.virtual_list.overscan_pads_empty]] | viewports that fit inside a row gap (boundary-aligned ends included) over overscan 0..3 | the pad hangs off the viewport edges — the adjacent rows within one pitch per pad row, clamped; overscan 0 yields the empty window |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_offsets

- **WHEN** random index, row height and gap
- **THEN** row i sits at i * (row-height + gap) and the extent is the closed form
- **VERIFIES** [[components.virtual_list.p_offsets]]

#### Scenario: p_window

- **WHEN** mid-scroll offsets over random extents
- **THEN** the window covers exactly the rows intersecting the viewport, including the gap-boundary edges
- **VERIFIES** [[components.virtual_list.p_window]]

#### Scenario: p_overscan

- **WHEN** overscan 2 over in-span offsets
- **THEN** the window extends by 2 rows each side, clamped, and reaches the tail past the end
- **VERIFIES** [[components.virtual_list.p_overscan]]

#### Scenario: p_range

- **WHEN** extent 5000 over viewports 300 and 600
- **THEN** max offset is 4700 and 4400
- **VERIFIES** [[components.virtual_list.p_range]]

#### Scenario: p_wheel

- **WHEN** offset 0 and delta 50, offset at max and delta 50
- **THEN** first updates to 50, second returns nothing
- **VERIFIES** [[components.virtual_list.p_wheel]]

#### Scenario: p_summary

- **WHEN** random extents and offsets
- **THEN** the window state carries only numeric summaries — count, step, extent, offset, window — with no item list
- **VERIFIES** [[components.virtual_list.p_summary]]

#### Scenario: p_empty

- **WHEN** count 0, viewport 0 and step 0
- **THEN** the window is empty, extent 0, finite, nothing drawn
- **VERIFIES** [[components.virtual_list.p_empty]]

#### Scenario: p_drawn

- **WHEN** random offsets over random extents
- **THEN** exactly the window's rows are drawn at their arithmetic offsets — a contiguous slice of the whole-list positions
- **VERIFIES** [[components.virtual_list.p_drawn]]

#### Scenario: p_gap_pad

- **WHEN** viewports that fit inside a row gap (boundary-aligned ends included) over overscan 0..3
- **THEN** the pad hangs off the viewport edges — the adjacent rows within one pitch per pad row, clamped; overscan 0 yields the empty window
- **VERIFIES** [[components.virtual_list.p_gap_pad]]
