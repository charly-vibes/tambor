---
id: spec
kind: intent
statement: "WHEN content is larger than the viewport THE scrollview SHALL clip it, scroll it by wheel, touch or scrollbar drag, and keep offsets within the scrollable range."
---

# components.scrollview

Port of `scrollview`, `vertical-scrollbar` and `horizontal-scrollbar`. Props are `offset` (default [0, 0]), `scroll-bounds` ([w, h]) and `body`. The inner view is translated by the negated offset. Offsets stored in state may sit outside the range after a resize (to avoid rubber-banding) and snap back at the next scroll update. Scrollbar drags use the `start-scroll` intent handled in app.toplevel.

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| default_offset | invariant | offset defaults to [0, 0] | [[spec]] |  |
| content_translated | invariant | the body is drawn translated by [-ox, -oy] inside a clip of scroll-bounds | [[spec]] |  |
| range_formula | invariant | the maximum offset per axis is max(0, total - viewport), and clamp(v) is max(0, min(max, v)) | [[spec]] |  |
| wheel_defers_to_children | invariant | on a scroll event the child intents are returned when non-empty so that a nested scrollview wins | [[spec]] |  |
| wheel_updates_offset | invariant | otherwise, when the clamped new offset differs from the current one on either axis, it returns updates setting x to clamp(ox + dx) and y to clamp(oy + dy), and when both are unchanged it returns nothing | [[spec]] |  |
| stale_offset_snaps | invariant | an out-of-range stored offset is not clamped on render and is clamped by the next scroll update | [[spec]] |  |
| bars_conditional | invariant | the vertical bar exists only when total height exceeds the viewport height and is placed at x = width, and the horizontal bar only when total width exceeds the width and is placed at y = height | [[spec]] |  |
| thumb_geometry | invariant | a thumb starts at offset / total and ends at (offset + viewport) / total of the track, with a track thickness of 7 and rounded ends | [[spec]] |  |
| bar_drag | invariant | a pointer down on a bar returns start-scroll whose function maps the pointer delta to set offset = clamp(div0(position, viewport) * max offset) | [[spec]] | app.toplevel.drag_effect (cross-file) |
| div0_safe | invariant | division by a zero viewport yields 0 and never NaN or infinity | [[spec]] |  |
| clip_events | invariant | content outside the viewport receives no pointer events | [[spec]] |  |
| touch_drag_scrolls | invariant | a one-finger drag over content that has no handler for the gesture scrolls by the drag delta | [[spec]] |  |
| momentum | advisory | a flick continues with decaying velocity and stops at the range ends, and is disabled under reduced motion | [[spec]] |  |

## Model

### States

- `at_top`
- `scrolled`
- `dragging_bar`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_scroll | at_top | scrolled | [[spec.wheel_updates_offset]] |
| t_back | scrolled | at_top | [[spec.range_formula]] |
| t_grab | scrolled | dragging_bar | [[spec.bar_drag]] |
| t_release | dragging_bar | scrolled | [[spec.div0_safe]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_default | unit | [[spec.default_offset]] | no offset prop | offset equals [0, 0] |
| p_translate | unit | [[spec.content_translated]] | random offsets | body origin equals the negated offset |
| p_range | unit | [[spec.range_formula]] | viewport 200 over content 500 and 100 | max offset is 300 and 0 |
| p_wheel_child | unit | [[spec.wheel_defers_to_children]] | a child that handles scroll | the child's intents are returned |
| p_wheel | unit | [[spec.wheel_updates_offset]] | offset 0 and delta 50, offset at max and delta 50 | first updates to 50, second returns nothing |
| p_stale | unit | [[spec.stale_offset_snaps]] | stored offset above max then a small scroll | render keeps it, the update clamps it |
| p_bars | unit | [[spec.bars_conditional]] | content larger on one axis only | exactly one bar is present at the right place |
| p_thumb | unit | [[spec.thumb_geometry]] | total 500 view 200 offset 100 | thumb spans 0.2 to 0.6 of the track |
| p_bar_drag | unit | [[spec.bar_drag]] | press then delta | the function returns the set offset effect |
| p_div0 | unit | [[spec.div0_safe]] | viewport 0 | offset is 0 and finite |
| p_clip | unit | [[spec.clip_events]] | pointer outside the viewport over clipped content | no intents |
| p_touch_scroll | unit | [[spec.touch_drag_scrolls]] | touch drag of 30 px | offset changes by 30 within range |
| p_momentum | unit | [[spec.momentum]] | flick then rest | offset keeps changing then settles, and is static under reduced motion |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_default

- **WHEN** no offset prop
- **THEN** offset equals [0, 0]
- **VERIFIES** [[spec.p_default]]

#### Scenario: p_translate

- **WHEN** random offsets
- **THEN** body origin equals the negated offset
- **VERIFIES** [[spec.p_translate]]

#### Scenario: p_range

- **WHEN** viewport 200 over content 500 and 100
- **THEN** max offset is 300 and 0
- **VERIFIES** [[spec.p_range]]

#### Scenario: p_wheel_child

- **WHEN** a child that handles scroll
- **THEN** the child's intents are returned
- **VERIFIES** [[spec.p_wheel_child]]

#### Scenario: p_wheel

- **WHEN** offset 0 and delta 50, offset at max and delta 50
- **THEN** first updates to 50, second returns nothing
- **VERIFIES** [[spec.p_wheel]]

#### Scenario: p_stale

- **WHEN** stored offset above max then a small scroll
- **THEN** render keeps it, the update clamps it
- **VERIFIES** [[spec.p_stale]]

#### Scenario: p_bars

- **WHEN** content larger on one axis only
- **THEN** exactly one bar is present at the right place
- **VERIFIES** [[spec.p_bars]]

#### Scenario: p_thumb

- **WHEN** total 500 view 200 offset 100
- **THEN** thumb spans 0.2 to 0.6 of the track
- **VERIFIES** [[spec.p_thumb]]

#### Scenario: p_bar_drag

- **WHEN** press then delta
- **THEN** the function returns the set offset effect
- **VERIFIES** [[spec.p_bar_drag]]

#### Scenario: p_div0

- **WHEN** viewport 0
- **THEN** offset is 0 and finite
- **VERIFIES** [[spec.p_div0]]

#### Scenario: p_clip

- **WHEN** pointer outside the viewport over clipped content
- **THEN** no intents
- **VERIFIES** [[spec.p_clip]]

#### Scenario: p_touch_scroll

- **WHEN** touch drag of 30 px
- **THEN** offset changes by 30 within range
- **VERIFIES** [[spec.p_touch_scroll]]

#### Scenario: p_momentum

- **WHEN** flick then rest
- **THEN** offset keeps changing then settles, and is static under reduced motion
- **VERIFIES** [[spec.p_momentum]]

