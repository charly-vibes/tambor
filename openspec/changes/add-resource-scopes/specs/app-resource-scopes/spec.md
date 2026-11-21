## ADDED Requirements

### Requirement: Explicit scopes own disposal

The system SHALL provide `createScope()` creating a plain-data scope
that collects disposal callbacks registered via an explicit-scope
`onCleanup(scope, fn)` — no ambient current-scope state — and
`dispose(scope)` SHALL run every registered callback exactly once, in
LIFO order, within one synchronous pass. Disposing an
already-disposed scope SHALL be a no-op.

#### Scenario: callbacks run LIFO in one pass

- **WHEN** a scope collects three disposal callbacks and is disposed
- **THEN** the callbacks run in reverse registration order inside the
  dispose call, each exactly once

#### Scenario: dispose is idempotent

- **WHEN** a scope is disposed a second time
- **THEN** no callback runs again and the second dispose is a no-op

#### Scenario: throwing callback is isolated

- **WHEN** the first of two registered callbacks throws during dispose
- **THEN** the second callback still runs and the first error is
  re-thrown after the disposal pass completes

### Requirement: Scope nesting disposes children first

`createScope(parent)` SHALL register the child scope on its parent;
disposing a parent SHALL dispose child scopes depth-first before the
parent's own callbacks; a child SHALL be disposable independently
without affecting its parent or siblings; and registering a callback
on an already-disposed scope SHALL invoke it immediately so the
resource cannot leak silently.

#### Scenario: parent dispose runs children first

- **WHEN** a parent scope with a child scope, each holding callbacks,
  is disposed
- **THEN** the child's callbacks run before the parent's own callbacks
  (depth-first, LIFO within each scope)

#### Scenario: independent child dispose

- **WHEN** a child scope is disposed directly
- **THEN** the child's callbacks run and neither the parent nor any
  sibling scope is disposed

#### Scenario: registration on a disposed scope runs now

- **WHEN** `onCleanup` registers a callback on an already-disposed
  scope
- **THEN** the callback runs immediately at registration instead of
  being retained

### Requirement: Owned worker boundaries close through the client's dispose

A scope that owns a worker-effect boundary SHALL close that boundary
when the scope is disposed, by disposing the boundary's client. The
dispose contract itself is owned by the components-worker_effect
capability; the observable effect at the scope level is that every
run the scope handed out settles
`{ status: "error", error: "disposed" }`.

#### Scenario: disposing the scope closes the owned boundary

- **WHEN** a scoped worker run is in flight and the scope owning the
  boundary is disposed
- **THEN** the boundary is closed through the client's `dispose()` and
  the run's promise settles `{ status: "error", error: "disposed" }` —
  never stuck pending, with the full dispose contract per the
  components-worker_effect capability

### Requirement: Async computations settle a status envelope

A scoped async run SHALL surface plain data `{ status: "pending" }`
until it settles to `{ status: "ready", value }` on success or
`{ status: "error", error }` on typed failure, SHALL freeze at settle,
and SHALL map the existing per-request transport envelope without
changing it. Scope disposal before settle SHALL settle the envelope to
`{ status: "error", error: "disposed" }`.

#### Scenario: pending settles to ready

- **WHEN** a scoped run's handler returns a value across the existing
  transport envelope
- **THEN** the envelope transitions `{ status: "pending" }` to
  `{ status: "ready", value }` and freezes at settle

#### Scenario: typed failure settles to error

- **WHEN** a scoped run resolves as a typed failure (for example the
  terminated or load-failure message)
- **THEN** the envelope settles to `{ status: "error", error }`
  carrying that message and the transport envelope shape is unchanged

#### Scenario: disposal before settle is not a stuck pending

- **WHEN** a scoped run has not settled and its scope is disposed
- **THEN** the envelope settles to `{ status: "error", error:
  "disposed" }` and no run remains pending

#### Scenario: settled envelopes are frozen

- **WHEN** a settled envelope is mutated by a consumer
- **THEN** the mutation does not take effect (the envelope is frozen
  plain data)

### Requirement: Disposal rides the dispatch, never new scheduling

Scope disposal and envelope settlement SHALL affect app state only
through the existing dispatch path as plain effect data; scope
disposal SHALL NOT schedule repaints, call the DOM backend directly,
or introduce new scheduling; and this capability SHALL hold with or
without the frame-coalescing and runtime-invalidation changes.

#### Scenario: disposal-triggered edit is an ordinary dispatch

- **WHEN** an app merges a settled envelope into state on scope
  disposal
- **THEN** the edit follows the existing dispatch and effect-ordering
  semantics, and dispatch behavior is unchanged from a run with no
  scopes attached

#### Scenario: no direct backend calls from dispose

- **WHEN** a scope holding worker boundaries and callbacks is disposed
- **THEN** only registered callbacks and owned-boundary disposal run —
  no repaint is scheduled and no DOM backend method is called by the
  scope machinery itself

### Requirement: Lifecycle churn leaks nothing

Repeated spawn-then-dispose cycles under load SHALL leave no stuck
promises, no growth in pending-queue size, no untracked workers after
the final dispose, and no retained disposal callbacks on a disposed
scope (the bench B4 anchor).

#### Scenario: repeated cycles leave no workers or stuck promises

- **WHEN** N scoped runs are spawned and their scopes disposed in
  waves, then churned again
- **THEN** every promise has settled, the live worker count returns to
  zero after the final dispose, and no pending request remains

#### Scenario: pending queue stays bounded during churn

- **WHEN** spawn-dispose cycles run while runs are in flight
- **THEN** the boundary's pending-queue size stays bounded by the
  in-flight run count and returns to empty after each dispose

#### Scenario: disposed scope retains nothing

- **WHEN** a scope with registered callbacks is disposed
- **THEN** the scope retains no callbacks afterwards (no retention
  past the disposal pass)

### Requirement: The mount owns a root scope

`mountDemo` (src/spa/mount.ts) SHALL create one root scope per mount,
owned by the mount, and SHALL expose an additive `dispose()` on the
handle that disposes the root scope children-first; a second
`dispose()` SHALL be a no-op. The existing `unmount()` SHALL compose
by disposing the root scope children-first as part of unmounting, so
existing unmount call sites stop everything the mount started.

#### Scenario: handle dispose runs the root scope children-first

- **WHEN** `dispose()` is called on a mount handle whose root scope
  holds child scopes and callbacks
- **THEN** the children's callbacks run before the root's own
  (children-first, LIFO within each scope)

#### Scenario: handle dispose is idempotent

- **WHEN** `dispose()` is called a second time on the mount handle
- **THEN** the second dispose is a no-op — no callback runs again

#### Scenario: unmount composes with the root scope

- **WHEN** `unmount()` is called on a mount handle without a prior
  `dispose()`
- **THEN** the root scope is disposed children-first (existing demo
  switcher and docs call sites stop everything the mount started) and
  unmount's existing teardown — root element removed, focus surface
  cleared, debug handle cleared — proceeds unchanged
