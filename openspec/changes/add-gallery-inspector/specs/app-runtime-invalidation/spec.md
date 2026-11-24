# app.runtime.invalidation Specification

## MODIFIED Requirements

### Requirement: Dispatch commits are published

Every top-level dispatch SHALL publish exactly one immutable
`DispatchCommit` — carrying `previousState`, `state`, a `ChangeSet`,
the normalized batch of applied intents as an additive frozen plain-data
`intents` array, and a strictly increasing `sequence` that starts at
1 — after effects apply and before repaint scheduling, and lane-only
batches SHALL publish commits that still schedule no repaint. Coalescing
SHALL merge paints, never commits. The `intents` member is additive and
optional: commits published by custom dispatches or structural
implementers MAY omit it, and its presence SHALL NOT change dispatch,
effect-ordering, or repaint semantics.

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

#### Scenario: commit exposes the applied intents

- **WHEN** a dispatch applies a normalized batch of effects
- **THEN** the commit's `intents` array deep-equals that batch in order,
  is frozen, and lane-only batches carry their lane intent; the member
  stays optional for seams outside makeApp's publish path
- **VERIFIES** [[app.runtime.invalidation.p_commit_intents]]
