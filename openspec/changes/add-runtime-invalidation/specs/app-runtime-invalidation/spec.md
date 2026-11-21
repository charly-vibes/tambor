## ADDED Requirements

### Requirement: Dispatch commits are published

Every top-level dispatch SHALL publish exactly one immutable
`DispatchCommit` — carrying `previousState`, `state`, a `ChangeSet`,
and a strictly increasing `sequence` — after effects apply and before
repaint scheduling, and lane-only batches SHALL publish commits that
still schedule no repaint.

#### Scenario: known change reports paths

- **WHEN** a dispatch applies a built-in path edit effect
- **THEN** the commit's ChangeSet is `known` with the touched paths and
  the commit exposes the prior and next state

#### Scenario: unannotated custom handler is conservative

- **WHEN** a dispatch applies a custom handler effect that reports no
  path annotations
- **THEN** the commit's ChangeSet is `unknown` with a reason and the
  next frame performs a full rebuild

#### Scenario: reentrant listener dispatch queues

- **WHEN** a subscribe listener dispatches during commit delivery
- **THEN** the dispatch lands on a new commit with a strictly greater
  sequence and delivery never reenters the current listener pass

### Requirement: Application subscriptions

The App SHALL expose an additive `subscribe(listener)` returning an
unsubscribe function; listeners SHALL receive the same frozen commit in
registration order, and attaching listeners SHALL NOT change dispatch,
effect-ordering, or repaint semantics.

#### Scenario: same commit to all listeners

- **WHEN** two listeners are subscribed and one dispatch commits
- **THEN** both listeners observe the identical frozen commit object in
  registration order

#### Scenario: unsubscribe stops delivery

- **WHEN** a listener unsubscribes and another dispatch commits
- **THEN** the unsubscribed listener receives no commit and the other
  listener still does

#### Scenario: no-op listener keeps contracts

- **WHEN** a no-op listener is attached and the pinned
  state-equivalence workload dispatches
- **THEN** the final state and draw behavior equal the no-listener run

### Requirement: Painter identity short-circuit

The DOM backend's `draw(view)` SHALL skip the element-tree rebuild when
the incoming view is identity-equal to the last drawn view and no
overlay, lane movement, ambient-scheme change, or container-size change
occurs, and SHALL otherwise rebuild exactly as today.

#### Scenario: unchanged view skips rebuild

- **WHEN** a dispatch derives a view identity-equal to the last drawn
  view with no overlay or lane movement
- **THEN** the backend records the draw but performs zero element-tree
  rebuilds

#### Scenario: unknown change forces rebuild

- **WHEN** the frame's ChangeSet is `unknown` and the derived view
  identity matches the last drawn view
- **THEN** the backend still performs a full rebuild (the
  short-circuit never fires on unknown changes)

#### Scenario: visible reason defeats short-circuit

- **WHEN** the lane offset moves, the overlay appears, the ambient
  scheme flips, or the container resizes
- **THEN** the backend performs a full rebuild regardless of view
  identity

### Requirement: Draw instrumentation is opt-in and zero-cost-off

The mount handle SHALL expose opt-in derive/rebuild/draw counters on
the existing phase-timer seam, and the counters SHALL impose no
measurable cost while disabled.

#### Scenario: counters attribute a coalesced frame

- **WHEN** counters are enabled and a frame coalesces N dispatches into
  one identity-equal derive
- **THEN** the counters report N commits, one derive, and zero rebuilds

#### Scenario: disabled counters cost nothing

- **WHEN** counters are disabled
- **THEN** no counter work executes on the dispatch/draw path
