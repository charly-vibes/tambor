---
id: interaction.lane
kind: intent
statement: "WHEN a handler returns a lane-typed effect THE dispatcher SHALL apply it to the app's ephemeral lane store and SHALL leave the persistent state unchanged."
---

# interaction.lane

## Purpose

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
The draw boundary (Phase 2): the mount wire re-draws the
already-derived cached tree for a lane-only batch — zero
re-derivations, one transform draw — and every wire draw (cached or
freshly derived, routed or async re-render) carries the lane's
pan/scroll offset as a translate wrapper, so a state change
mid-interaction keeps the lane's position (lane wins on position,
state wins on structure; the BZ2 pan-as-transform verdict promoted to
a corpus seam). The drag overlay (Phase 4, lane_overlay_drawn): a lane
entry may carry an overlay renderer `(entry) => Elem` — the dragged
shape re-drawn from the lane position — and the wire renders it ON TOP
of the transformed tree on every wire draw (lane-only, state
re-derive, async re-render alike), draw-only so the routing semantics
are untouched; single-drag scope v1. The draw-boundary constraints live here rather than
in backend-render because the boundary is SPA-wire plumbing — the
backend port (draw/measure/subscribe) is unchanged.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| lane_outside_state | invariant | applying a lane effect leaves the app state identity unchanged — the same object make-app's view cache keys on | [[interaction.lane]] |
| lane_update_semantics | invariant | the effect ["lane", key, updateFn] sets lane[key] to updateFn applied to the previous lane[key] value | [[interaction.lane]] |
| lane_ctx_reachable | invariant | the lane store is reachable from every effect application through the effect context under the "lane" key, per app — two apps on one page hold two distinct lane stores | [[interaction.lane]] |
| lane_batch_no_repaint | invariant | a batch whose effects are all lane-typed schedules no repaint, and any batch containing a state effect repaints exactly once as usual | [[interaction.lane]] |
| lane_draw_no_derive | invariant | a routed batch whose effects are all lane-typed re-draws the already-derived cached tree with no view re-derivation, and any batch containing a state effect re-derives exactly once as usual | [[interaction.lane]] |
| lane_transform_drawn | invariant | every wire draw — cached or freshly derived, routed or async re-render — applies the lane's pan/scroll offset as a translate over the drawn tree, and an app whose lane holds no offset draws the tree unwrapped | [[interaction.lane]] |
| lane_replay_history | invariant | replaying a drag's routed intent log with the lane-typed effects removed reproduces the committed state exactly, and the replay runs with an empty lane — the lane contributes nothing to the persistent history or the committed drawn output | [[interaction.lane]] |
| lane_overlay_drawn | invariant | while a lane entry carries an overlay renderer `(entry) => Elem`, every wire draw — lane-only, state re-derive or async re-render — renders the renderer's Elem called with its lane entry on top of the lane-transformed tree, and a lane whose entries carry no renderer draws the tree alone | [[interaction.lane]] |

## Model

### States

- `untouched`
- `held`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_write | untouched | held | [[interaction.lane.lane_update_semantics]] |
| t_stay | held | held | [[interaction.lane.lane_outside_state]] |
| t_lane_draw | held | held | [[interaction.lane.lane_draw_no_derive]] |
| t_commit | held | untouched | [[interaction.lane.lane_replay_history]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_state_identity | unit | [[interaction.lane.lane_outside_state]] | lane batches of one and several effects | the state object is identical before and after each batch |
| p_lane_update | unit | [[interaction.lane.lane_update_semantics]] | lane writes with increments and overwrites | each lane[key] equals the update function applied to the previous value, applied in batch order |
| p_ctx_lane | unit | [[interaction.lane.lane_ctx_reachable]] | two apps driven concurrently | each app's lane is distinct and both are visible in the ctx their handlers receive |
| p_no_repaint | unit | [[interaction.lane.lane_batch_no_repaint]] | lane-only batches | no repaint is scheduled for the batch |
| p_mixed_batch | unit | [[interaction.lane.lane_batch_no_repaint]] | a batch carrying a lane effect and a state update | the state changes, the lane changes, and exactly one repaint is scheduled |
| p_lane_draw_no_derive | unit | [[interaction.lane.lane_draw_no_derive]] | a routed lane-only pointer-move stream | each event costs zero derivations and exactly one draw of the cached tree, wrapped in the lane transform |
| p_lane_transform_drawn | unit | [[interaction.lane.lane_transform_drawn]] | a lane-only pan followed by a state change, and a state change with an empty lane | the state draw carries the lane's pan translate; with no lane offset the drawn tree is unwrapped |
| p_lane_replay | unit | [[interaction.lane.lane_replay_history]] | a scripted drag (mouse-down, move stream, mouse-up commit) | the replayed state equals the original state and the replay's lane is empty while the original lane held the interaction values mid-drag |
| p_lane_overlay_drawn | unit | [[interaction.lane.lane_overlay_drawn]] | a scripted drag with an overlay renderer over the mounted wire (start, move stream, mid-drag state change, commit) | the stream draws the overlay on top with zero re-derivations, the mid-drag state change keeps the overlay over the re-derived tree, and the commit draw carries no overlay |

## Requirements

### Requirement: Property coverage mirror

Every property row SHALL be verified by exactly one dedicated test;
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

#### Scenario: p_lane_draw_no_derive

- **WHEN** a routed lane-only pointer-move stream
- **THEN** each event costs zero derivations and exactly one draw of the cached tree, wrapped in the lane transform
- **VERIFIES** [[interaction.lane.p_lane_draw_no_derive]]

#### Scenario: p_lane_transform_drawn

- **WHEN** a lane-only pan followed by a state change, and a state change with an empty lane
- **THEN** the state draw carries the lane's pan translate; with no lane offset the drawn tree is unwrapped
- **VERIFIES** [[interaction.lane.p_lane_transform_drawn]]

#### Scenario: p_lane_replay

- **WHEN** a scripted drag (mouse-down, move stream, mouse-up commit)
- **THEN** the replayed state equals the original state and the replay's lane is empty while the original lane held the interaction values mid-drag
- **VERIFIES** [[interaction.lane.p_lane_replay]]

#### Scenario: p_lane_overlay_drawn

- **WHEN** a scripted drag with an overlay renderer over the mounted wire (start, move stream, mid-drag state change, commit)
- **THEN** the stream draws the overlay on top with zero re-derivations, the mid-drag state change keeps the overlay over the re-derived tree, and the commit draw carries no overlay
- **VERIFIES** [[interaction.lane.p_lane_overlay_drawn]]
