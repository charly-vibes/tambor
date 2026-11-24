## MODIFIED Requirements

### Requirement: Property coverage mirror

Every property row SHALL be verified by exactly one dedicated test;
`ah sync` derives one contract per VERIFIES link. The per-child reuse
predicates (p_stream_tail, p_fresh_rebuilds, p_reorder_rebuilds) SHALL
scope their positional splice to children carrying no declared key;
children carrying a declared key additionally follow keyed sibling
matching per the app-keyed-dom-reconciliation capability.

#### Scenario: p_known_paths

- **WHEN** a built-in path-edit dispatch batch lands
- **THEN** the commit's ChangeSet is known with the touched paths and the commit exposes the prior and next state
- **VERIFIES** [[app.runtime.invalidation.p_known_paths]]

#### Scenario: p_unknown_conservative

- **WHEN** an unregistered custom effect runs through the default handler
- **THEN** the commit's ChangeSet is unknown with a reason
- **VERIFIES** [[app.runtime.invalidation.p_unknown_conservative]]

#### Scenario: p_reentrant_queue

- **WHEN** a subscribe listener dispatches during commit delivery
- **THEN** the dispatch lands on a new commit with a strictly greater sequence and no deadlock
- **VERIFIES** [[app.runtime.invalidation.p_reentrant_queue]]

#### Scenario: p_burst_commits

- **WHEN** 80 routed dispatches land inside one stubbed animation frame
- **THEN** 80 commits with strictly increasing sequences are published and exactly one draw is made for the frame
- **VERIFIES** [[app.runtime.invalidation.p_burst_commits]]

#### Scenario: p_same_commit

- **WHEN** two listeners are subscribed to one dispatch
- **THEN** both observe the identical frozen commit object in registration order
- **VERIFIES** [[app.runtime.invalidation.p_same_commit]]

#### Scenario: p_unsubscribe_stops

- **WHEN** a listener unsubscribes and another dispatch commits
- **THEN** the unsubscribed listener receives no commit and the other listener still does
- **VERIFIES** [[app.runtime.invalidation.p_unsubscribe_stops]]

#### Scenario: p_throw_isolation

- **WHEN** a subscribed listener throws while a commit is delivered and a second listener is registered after it
- **THEN** the second listener still receives the commit and the first error re-thrown after the delivery pass completes
- **VERIFIES** [[app.runtime.invalidation.p_throw_isolation]]

#### Scenario: p_unsubscribe_snapshot

- **WHEN** a listener unsubscribes another during a delivery pass
- **THEN** the in-flight pass is unchanged and the unsubscribed listener receives no commit from the next dispatch
- **VERIFIES** [[app.runtime.invalidation.p_unsubscribe_snapshot]]

#### Scenario: p_noop_listener

- **WHEN** a no-op listener is attached and the pinned state-equivalence workload dispatches
- **THEN** the final state and draw behavior equal the no-listener run
- **VERIFIES** [[app.runtime.invalidation.p_noop_listener]]

#### Scenario: p_ops_noop

- **WHEN** a makeOpsApp-backed demo app is mounted on the wire
- **THEN** no commit hint attaches, the draws carry the conservative unknown ChangeSet, and no commit is ever delivered
- **VERIFIES** [[app.runtime.invalidation.p_ops_noop]]

#### Scenario: p_skip_identity

- **WHEN** a dispatch derives a view identity-equal to the last drawn view with no overlay or lane movement
- **THEN** the draw is recorded with zero element-tree rebuilds
- **VERIFIES** [[app.runtime.invalidation.p_skip_identity]]

#### Scenario: p_unknown_rebuilds

- **WHEN** the frame's ChangeSet is unknown and the derived view identity matches the last drawn view
- **THEN** the backend still performs a full rebuild
- **VERIFIES** [[app.runtime.invalidation.p_unknown_rebuilds]]

#### Scenario: p_visible_reason

- **WHEN** the lane offset moves, the overlay appears, the ambient scheme flips, or the container resizes
- **THEN** the backend performs a full rebuild regardless of view identity
- **VERIFIES** [[app.runtime.invalidation.p_visible_reason]]

#### Scenario: p_stream_tail

- **WHEN** appends arrive into a memo-stable 1,000-row history of
  children carrying no declared key
- **THEN** only the changed tail rows' DOM mutates and every unchanged
  row keeps the same element references across frames (positional rule;
  keyed children follow app-keyed-dom-reconciliation)
- **VERIFIES** [[app.runtime.invalidation.p_stream_tail]]

#### Scenario: p_fresh_rebuilds

- **WHEN** an unkeyed child Elem is structurally equal to the previous
  frame's child at its position but is a fresh object
- **THEN** the backend rebuilds that subtree — identity is the only
  positional reuse key
- **VERIFIES** [[app.runtime.invalidation.p_fresh_rebuilds]]

#### Scenario: p_reorder_rebuilds

- **WHEN** unkeyed children are reordered, inserted mid-list, or removed
- **THEN** affected positions rebuild conservatively — this capability
  attempts no keyed matching (keyed matching is
  app-keyed-dom-reconciliation's scope)
- **VERIFIES** [[app.runtime.invalidation.p_reorder_rebuilds]]

#### Scenario: p_unknown_no_reuse

- **WHEN** the frame's ChangeSet is unknown
- **THEN** no child subtree is reused for that frame — keyed or unkeyed
- **VERIFIES** [[app.runtime.invalidation.p_unknown_no_reuse]]

#### Scenario: p_build_immutable

- **WHEN** a deep-frozen view graph is built with reuse enabled
- **THEN** the build completes without a mutation error and the drawn output matches a build of the same graph without reuse
- **VERIFIES** [[app.runtime.invalidation.p_build_immutable]]

#### Scenario: p_counter_frame

- **WHEN** counters are enabled under a frame that coalesces into one identity-equal derive
- **THEN** the counters report one derive for the frame and zero rebuilds on the short-circuited path
- **VERIFIES** [[app.runtime.invalidation.p_counter_frame]]

#### Scenario: p_counters_off

- **WHEN** counters are disabled
- **THEN** the reads stay at their defaults, never throw, and draws still happen
- **VERIFIES** [[app.runtime.invalidation.p_counters_off]]
