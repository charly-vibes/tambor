## ADDED Requirements

### Requirement: Hosts drive islands only through the typed intent boundary

An island handle SHALL expose one typed intent entry whose inputs are
plain data with namespaced string tags — effect vectors through the
app's existing dispatch and an external-mutation intent — and SHALL
NOT expose drawn-tree mutation: attribute, style, class, or child
writes through the handle are outside this capability. Intent batches
SHALL apply strictly in order, and an unknown intent tag SHALL be
reported and skipped with the rest of the batch still running.

#### Scenario: effects intent applies like an in-app dispatch

- **WHEN** a host files a typed effects intent on a mounted island
- **THEN** the island's app state advances exactly as an in-app
  dispatch of the same effect vectors would, and the drawn subtree
  reflects the new state

#### Scenario: unknown intent tag is reported and skipped

- **WHEN** a host files an intent batch whose middle entry carries an
  unknown tag
- **THEN** that entry is reported and skipped, the entries before and
  after it still apply in order, and the island stays usable

#### Scenario: the handle exposes no drawn-tree write path

- **WHEN** the handle's public surface is inspected at runtime
- **THEN** no attribute, style, class, or child mutation surface for
  the drawn tree exists on it, and the drawn tree is not reachable
  from the handle

### Requirement: Island lifecycle is mount, live, dispose on the scope model

Each island mount SHALL own one root scope — its own mount root (its
island scope nests beneath it) — per the app-resource-scopes
capability ("The mount owns a root scope"), with island-owned
resources registered on it. The handle SHALL expose
`dispose()`: it SHALL dispose the island scope children-first
(semantics owned by app-resource-scopes) and SHALL release the drawn
subtree — the island's drawn elements leave the host document and no
later draw SHALL write into the host through the island.

#### Scenario: dispose releases the drawn subtree

- **WHEN** a live island is disposed while a coalesced frame is
  pending
- **THEN** the island's drawn root is removed from the host document,
  the pending frame is discarded, and no later draw writes into the
  host through the island

#### Scenario: island-owned boundary closes through the scope

- **WHEN** an island-owned worker-effect boundary has a run in flight
  and the island is disposed
- **THEN** the boundary closes through the island scope with the
  full dispose contract per the components-worker_effect capability,
  and the run settles the typed disposed envelope — never stuck
  pending

#### Scenario: post-dispose intent is inert

- **WHEN** a host files an intent on a disposed island
- **THEN** it is reported and skipped, no island-owned resource
  respawns, no redraw occurs, and the handle's `status` remains
  `"disposed"`

#### Scenario: page unmount composes with the island scope

- **WHEN** the island is embedded inside a parent tambor mount and
  that parent mount is unmounted without the island's own dispose
  having been called
- **THEN** the island scope is disposed children-first as part of the
  parent root scope's disposal (per app-resource-scopes' unmount
  composition), stopping everything the island started

#### Scenario: standalone island owns its lifecycle

- **WHEN** the island mount owns its own root scope and no parent
  tambor mount exists
- **THEN** only the handle's `dispose()` (or host-document teardown)
  stops the island, and nothing else on the page claims its scope

### Requirement: External mutation forces a conservative island rebuild

The external-mutation intent SHALL make the island's next drawn frame
rebuild its entire drawn subtree (the app-runtime-invalidation
unknown-ChangeSet rule, applied island-locally), SHALL schedule that
frame through the existing coalescer (a paint happens even with no
pending dispatch), SHALL NOT extend the rebuild past the island's
boundary, and SHALL rebuild purely from the derived view, erasing
host-mutated nodes. This holds with or without
add-runtime-invalidation.

#### Scenario: intent forces an island-wide rebuild

- **WHEN** a host mutates an attribute inside a live island, files the
  external-mutation intent, and the next frame draws
- **THEN** the island's whole drawn subtree is rebuilt (no identity
  reuse fires inside the island for that frame) and the drawn output
  equals a from-scratch build of the same derived view — never stale

#### Scenario: rebuild is island-local

- **WHEN** the external-mutation intent is filed on one island while a
  sibling island and surrounding host-owned DOM exist
- **THEN** only the mutated island's subtree is forced to rebuild; the
  sibling island and the surrounding view follow their ordinary
  identity rules

#### Scenario: without the intent, tambor performs no repair

- **WHEN** a host mutates the drawn subtree without filing the intent
- **THEN** tambor's draws follow the ordinary identity rules and
  perform no repair of the foreign write — which is why filing the
  intent is the host's obligation under this contract

#### Scenario: coalesced intents rebuild once

- **WHEN** a host files N external-mutation intents before the next
  drawn frame
- **THEN** exactly one island-wide rebuild happens for that frame, and
  normal identity rules resume on the frame after

#### Scenario: intent paints an idle island

- **WHEN** the intent is filed on an idle island with no pending
  dispatch
- **THEN** exactly one rebuild happens and the foreign write is
  erased

### Requirement: Internal node types do not cross the boundary

The island handle's public surface SHALL expose only plain data,
functions, and the host-owned seam values the host passed in (its own
document and element seams); tambor-internal node types — the drawn
adapter elements, backend element records, and shim event surfaces —
SHALL NOT be exposed by, accepted by, or required by the intent API.
Host-event bridging remains the existing host-events → SimEvent path
and is unchanged by this capability.

#### Scenario: the handle surface is internally typed

- **WHEN** the handle's public properties and method signatures are
  checked at the type level
- **THEN** only plain data, functions, and host-owned seam types
  appear — no tambor-internal node types

#### Scenario: plain-data hosts drive an island fully

- **WHEN** a host holds only plain data and its own document/element
  seams and drives a counter island exclusively through typed intents
- **THEN** the island mounts, renders, advances state, and disposes
  with no tambor-internal type ever required at the call site
