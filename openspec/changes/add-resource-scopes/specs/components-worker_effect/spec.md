## ADDED Requirements

### Requirement: Permanent dispose closes the boundary

The Worker-backed client (`worker: true`) SHALL expose an additive
`dispose()` beside the OPTIONAL `terminate()`: dispose SHALL
terminate the live worker, answer every in-flight request with the
typed disposed failure, and close the boundary permanently — later
runs SHALL resolve that failure without respawning a worker or
evaluating the handler in-thread. `terminate()` SHALL keep its
existing contract unchanged. On the in-thread fallback client
(`worker: false`), `dispose()` SHALL be a no-op.

#### Scenario: dispose answers in-flight and closes

- **WHEN** a run is in flight on a Worker-backed client and
  `dispose()` is called
- **THEN** the in-flight promise resolves with the typed disposed
  failure and no worker remains spawned

#### Scenario: post-dispose runs never respawn or degrade

- **WHEN** `run()` is called after `dispose()` on a Worker-backed
  client with a handler table available
- **THEN** it resolves with the typed disposed failure, the spawn count
  does not change, and the handler is never evaluated in-thread
  (disposal is not the load-failure degrade path)

#### Scenario: dispose is idempotent

- **WHEN** `dispose()` is called a second time on an already-disposed
  Worker-backed client
- **THEN** the second dispose is a no-op — no worker action, no state
  change, and later runs still resolve the typed disposed failure

#### Scenario: dispose on the in-thread fallback is a no-op

- **WHEN** `dispose()` is called on the in-thread fallback client
  (`worker: false`)
- **THEN** the dispose is a no-op and a later `run()` still evaluates
  the handler in-thread as before (mirroring terminate's fallback
  no-op contract)

#### Scenario: terminate keeps lazy respawn

- **WHEN** `terminate()` is called and `run()` follows
- **THEN** in-flight runs resolve with the typed terminated failure and
  the next run respawns a fresh worker — the existing optional_terminate
  contract intact and distinct from dispose
