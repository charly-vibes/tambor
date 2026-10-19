---
id: interaction.lane
kind: intent
statement: "WHEN a handler returns a lane-typed effect THE dispatcher SHALL apply it to the app's ephemeral lane store and SHALL leave the persistent state unchanged."
---

# interaction.lane

The ephemeral interaction lane (tambor-54j.3, I13): high-frequency
interaction state — pan offsets, drag positions, scroll — lives in a
per-app lane store OUTSIDE the persistent state, so 60 Hz pointer
streams never enter history and never change the state identity the
route-time view cache (tambor-8xm) keys on. The corpus constraint comes
from the chat-repo cold read: membrane keeps interaction state in app
state, which is a gap to avoid (benchmarks-and-findings.md §Constraints).
The lane is a plain mutable record owned by make-app, reachable from
effect handlers through the effect context (the extra-keys seam — the
global effect registry must stay name-collision-free and app-agnostic,
which rules out a per-app registered effect type). A lane effect is a
builtin like update or set: `["lane", key, updateFn]` applies
`lane[key] = updateFn(lane[key])`. A batch whose effects are ALL
lane-typed changes no state, so scheduling a repaint for it would be a
re-derivation per 60 Hz event — the exemption is scoped to lane-only
batches; any state effect in the batch repaints exactly once as usual
(single_repaint in effect-dispatch is untouched for state batches).
The lane's draw path (transform/overlay re-draw without a full tree
derive) lands in a later phase; this spec pins the store, the effect
semantics, the reachability seam and the repaint exemption.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| lane_outside_state | invariant | applying a lane effect leaves the app state identity unchanged — the same object make-app's view cache keys on | [[interaction.lane]] |
| lane_update_semantics | invariant | the effect ["lane", key, updateFn] sets lane[key] to updateFn applied to the previous lane[key] value | [[interaction.lane]] |
| lane_ctx_reachable | invariant | the lane store is reachable from every effect application through the effect context under the "lane" key, per app — two apps on one page hold two distinct lane stores | [[interaction.lane]] |
| lane_batch_no_repaint | invariant | a batch whose effects are all lane-typed schedules no repaint, and any batch containing a state effect repaints exactly once as usual | [[interaction.lane]] |

## Model

### States

- `untouched`
- `held`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_write | untouched | held | [[interaction.lane.lane_update_semantics]] |
| t_stay | held | held | [[interaction.lane.lane_outside_state]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_state_identity | unit | [[interaction.lane.lane_outside_state]] | lane batches of one and several effects | the state object is identical before and after each batch |
| p_lane_update | unit | [[interaction.lane.lane_update_semantics]] | lane writes with increments and overwrites | each lane[key] equals the update function applied to the previous value, applied in batch order |
| p_ctx_lane | unit | [[interaction.lane.lane_ctx_reachable]] | two apps driven concurrently | each app's lane is distinct and both are visible in the ctx their handlers receive |
| p_no_repaint | unit | [[interaction.lane.lane_batch_no_repaint]] | lane-only batches | no repaint is scheduled for the batch |
| p_mixed_batch | unit | [[interaction.lane.lane_batch_no_repaint]] | a batch carrying a lane effect and a state update | the state changes, the lane changes, and exactly one repaint is scheduled |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated test;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_state_identity

- **WHEN** lane batches of one and several effects
- **THEN** the state object is identical before and after each batch
- **VERIFIES** [[interaction.lane.p_state_identity]]

#### Scenario: p_lane_update

- **WHEN** lane writes with increments and overwrites
- **THEN** each lane[key] equals the update function applied to the previous value, applied in batch order
- **VERIFIES** [[interaction.lane.p_lane_update]]

#### Scenario: p_ctx_lane

- **WHEN** two apps driven concurrently
- **THEN** each app's lane is distinct and both are visible in the ctx their handlers receive
- **VERIFIES** [[interaction.lane.p_ctx_lane]]

#### Scenario: p_no_repaint

- **WHEN** lane-only batches
- **THEN** no repaint is scheduled for the batch
- **VERIFIES** [[interaction.lane.p_no_repaint]]

#### Scenario: p_mixed_batch

- **WHEN** a batch carrying a lane effect and a state update
- **THEN** the state changes, the lane changes, and exactly one repaint is scheduled
- **VERIFIES** [[interaction.lane.p_mixed_batch]]
