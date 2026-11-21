## ADDED Requirements

### Requirement: Dispatch commits are published

Every top-level dispatch SHALL publish exactly one immutable
`DispatchCommit` — carrying `previousState`, `state`, a `ChangeSet`,
and a strictly increasing `sequence` that starts at 1 — after effects
apply and before repaint scheduling, and lane-only batches SHALL
publish commits that still schedule no repaint. Coalescing SHALL merge
paints, never commits.

#### Scenario: known change reports paths

- **WHEN** a dispatch applies a built-in path edit effect
- **THEN** the commit's ChangeSet is `known` with the touched paths and
  the commit exposes the prior and next state

#### Scenario: unannotated custom handler is conservative

- **WHEN** a dispatch applies a custom handler effect that reports no
  path annotations
- **THEN** the commit's ChangeSet is `unknown` with a reason and the
  next frame performs a full rebuild

#### Scenario: coalesced burst commits once per dispatch

- **WHEN** 80 dispatches arrive within one animation frame under
  coalescing
- **THEN** 80 commits with strictly increasing sequences are published
  and exactly one build-or-skip decision is made for the frame

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

#### Scenario: throwing listener is isolated

- **WHEN** a subscribed listener throws while a commit is delivered and
  a second listener is registered after it
- **THEN** the second listener still receives the commit and the first
  error is re-thrown after the delivery pass completes

#### Scenario: unsubscribe during delivery takes effect next commit

- **WHEN** a listener unsubscribes another listener during a delivery
  pass
- **THEN** the in-flight pass is unchanged and the unsubscribed
  listener receives no commit from the next dispatch

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

### Requirement: Per-child identity reuse

When building the element tree, the DOM backend SHALL reuse the
previous frame's DOM subtree for a child whose Elem is identity-equal
to the child at the same position in the previous frame, and SHALL
rebuild any child that is not an identity match — including
fresh-but-structurally-equal children and any frame whose ChangeSet is
`unknown` — so unchanged memo-stable rows perform no DOM mutation
while stale output is impossible by construction.

#### Scenario: streaming append mutates only the tail

- **WHEN** appends arrive into a memo-stable 1,000-row history
- **THEN** only the changed tail rows' DOM is mutated and every
  unchanged row keeps the same element references across frames

#### Scenario: fresh-but-equal child rebuilds

- **WHEN** a child Elem is structurally equal to the previous frame's
  child at its position but is a fresh object
- **THEN** the backend rebuilds that subtree (identity is the only
  reuse key)

#### Scenario: reorder rebuilds conservatively

- **WHEN** children are reordered, inserted mid-list, or removed
- **THEN** affected positions rebuild — no keyed matching is attempted
  in this capability

#### Scenario: unknown change disables reuse

- **WHEN** the frame's ChangeSet is `unknown`
- **THEN** no child subtree is reused for that frame

### Requirement: Published views are immutable

The DOM backend SHALL treat derived view graphs as immutable — building
MUST NOT mutate any published Elem — and the reuse mechanism SHALL be
sound only under this contract.

#### Scenario: building never writes the view

- **WHEN** a deep-frozen view graph is built with reuse enabled
- **THEN** the build completes without a mutation error and the drawn
  output matches a build of the same graph without reuse

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
