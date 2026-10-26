---
id: components.ring_buffer
kind: intent
statement: "WHEN a stream of items is appended to a bounded series THE ring-buffer SHALL retain exactly the newest capacity items in ingest order, SHALL drop the oldest items on overflow, and SHALL append at O(1) amortized cost per item without copying the retained series."
---

# components.ring_buffer

## Purpose

The bounded-series store (tambor-54j.8.5): the public promotion of the
BZ5 log-stream candidate — a fixed-capacity FIFO of items with
drop-oldest, for state that must hold a window and a summary, never the
raw stream (the §4.8 discipline the BZ5 finding measured: the naive
per-line ingest climbed ~+70 ms per extra 1000 lines because every
append copied the whole ever-growing corpus, while the bounded window
held flat). `boundedSeries(capacity)` builds the empty series;
`appendSeries(series, batch)` ingests a batch and drops the overflow's
oldest; `newestSeries(series, n)` materializes the newest n items
oldest→newest (the rendering window); `foldSeries(series, fold, seed)`
folds the whole retained window oldest→newest (the summary-state read —
a histogram, a match count). Public through the interop barrel
alongside the memo component.

The representation is a persistent two-stack queue, chosen over a
mutating array ring on purpose: the corpus's state model changes state
only through dispatch and every dispatch produces fresh identity for
changed slices, so a store usable directly as an app-state slice must
be plain immutable data — a mutating ring would add mutability the
corpus does not have, and the slice-based copy the inline bench pattern
used (`[...ring, ...batch].slice`) is allocation-bounded but O(capacity)
per append, not O(1) amortized. The two stacks (`old` oldest-first,
`young` newest-first) are cons chains of plain cells: appending conses
the batch onto the young stack and pops the overflow's oldest off the
old stack, refilling the old stack from the young stack once (reversed)
when it empties mid-drop. Each item is consed at most twice over the
stream (pushed, plus at most one rotation) and dropped at most once —
O(1) amortized per appended item, no immutable copy of the retained
series, memory bounded by capacity. Identity sharing is what makes the
series sound inside dispatch: an append that drops nothing shares both
retained stacks, so unchanged state slices keep their identity and
structural sharing does the rest.

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| capacity_bound | invariant | the series never holds more than capacity items: appending past capacity drops exactly the overflow's oldest items, so the retained set is always the newest capacity items in ingest order | [[components.ring_buffer]] |  |
| ingest_order | invariant | the series is a FIFO of the ingest order — iteration (the newest view and the fold) walks oldest→newest, and a dropped item never reappears | [[components.ring_buffer]] |  |
| append_amortized | invariant | appending a batch of b items costs O(b) amortized — each item is consed at most twice over the stream (pushed to the young stack, rotated to the old stack at most once) and dropped at most once — and never copies the retained series: an append that drops nothing shares both retained stacks' identity, and a dropping append pops the old stack without re-consing it | [[components.ring_buffer]] |  |
| window_view | invariant | newest(n) is exactly the newest min(n, size) items in oldest→newest order, materialized from the newest end so the walk is bounded by the retained window (≤ capacity), never by the ingest history | [[components.ring_buffer]] |  |
| fold_visits_all | invariant | fold(seed, f) visits exactly the size retained items once each, oldest→newest, and returns the final accumulator | [[components.ring_buffer]] |  |
| pure_slices | invariant | an append returns a fresh immutable value and never mutates its argument; unchanged stacks keep their identity (structural sharing), so a series held in app state changes only through the dispatch that appends to it | [[components.ring_buffer]] |  |
| capacity_validated | invariant | capacity must be a positive integer — a non-positive or non-integer capacity is rejected with a TypeError at construction, never silently mis-bounding every later append | [[components.ring_buffer]] |  |

## Model

### States

- `under_capacity`
- `at_capacity`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_grow | under_capacity | under_capacity | [[components.ring_buffer.append_amortized]] |
| t_fill | under_capacity | at_capacity | [[components.ring_buffer.capacity_bound]] |
| t_drop | at_capacity | at_capacity | [[components.ring_buffer.capacity_bound]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_capacity_bound | unit | [[components.ring_buffer.capacity_bound]] | random capacities and batch sequences ingesting past 3× capacity | size never exceeds capacity and the retained window is exactly the newest capacity items in ingest order |
| p_fifo_order | unit | [[components.ring_buffer.ingest_order]] | random batch sequences over random capacities | the iterated order is a suffix of the ingest order (the dropped prefix is gone) and the fold visits the same order |
| p_append_amortized | unit | [[components.ring_buffer.append_amortized]] | random append sequences checked at each step | a no-drop append shares both stacks (the batch is consed on top of the retained young spine), a dropping append is the exact d-th rest of the old stack, and a rotation allocates fresh cells without aliasing either pre-append stack |
| p_newest_window | unit | [[components.ring_buffer.window_view]] | random series and window sizes, including 0, capacity and beyond | newest(n) equals the last min(n, size) items of the full order, oldest→newest |
| p_fold | unit | [[components.ring_buffer.fold_visits_all]] | random batch sequences | fold visits exactly size items once each in ingest order and its accumulator equals a reference array fold |
| p_pure | unit | [[components.ring_buffer.pure_slices]] | a series and a batch | the input series is untouched, two equal appends of the same base produce equal values, and an empty batch shares identity |
| p_validation | unit | [[components.ring_buffer.capacity_validated]] | capacities 0, -3, 1.5 and NaN | each construction throws TypeError |

## Requirements

### Requirement: Property coverage mirror

Every property row SHALL be verified by exactly one dedicated test;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_capacity_bound

- **WHEN** random capacities and batch sequences ingesting past 3× capacity
- **THEN** size never exceeds capacity and the retained window is exactly the newest capacity items in ingest order
- **VERIFIES** [[components.ring_buffer.p_capacity_bound]]

#### Scenario: p_fifo_order

- **WHEN** random batch sequences over random capacities
- **THEN** the iterated order is a suffix of the ingest order (the dropped prefix is gone) and the fold visits the same order
- **VERIFIES** [[components.ring_buffer.p_fifo_order]]

#### Scenario: p_append_amortized

- **WHEN** random append sequences checked at each step
- **THEN** a no-drop append shares both stacks (the batch is consed on top of the retained young spine), a dropping append is the exact d-th rest of the old stack, and a rotation allocates fresh cells without aliasing either pre-append stack
- **VERIFIES** [[components.ring_buffer.p_append_amortized]]

#### Scenario: p_newest_window

- **WHEN** random series and window sizes, including 0, capacity and beyond
- **THEN** newest(n) equals the last min(n, size) items of the full order, oldest→newest
- **VERIFIES** [[components.ring_buffer.p_newest_window]]

#### Scenario: p_fold

- **WHEN** random batch sequences
- **THEN** fold visits exactly size items once each in ingest order and its accumulator equals a reference array fold
- **VERIFIES** [[components.ring_buffer.p_fold]]

#### Scenario: p_pure

- **WHEN** a series and a batch
- **THEN** the input series is untouched, two equal appends of the same base produce equal values, and an empty batch shares identity
- **VERIFIES** [[components.ring_buffer.p_pure]]

#### Scenario: p_validation

- **WHEN** capacities 0, -3, 1.5 and NaN
- **THEN** each construction throws TypeError
- **VERIFIES** [[components.ring_buffer.p_validation]]
