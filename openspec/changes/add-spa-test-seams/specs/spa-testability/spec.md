## ADDED Requirements

### Requirement: Deterministic demo boot selection

The SPA entry SHALL accept a `demo` query parameter naming a gallery demo
and mount that demo on boot; an absent or unknown value SHALL mount the
first registry demo. The id SHALL be matched exactly, the first
occurrence SHALL win, and a selected demo whose module fails to load
SHALL fall back to the first demo without an unhandled rejection. The
nav SHALL mark the mounted demo's button active and no console error
SHALL be emitted for a fallback.

#### Scenario: known demo id boots that demo

- **WHEN** the entry loads with `?demo=todo`
- **THEN** the todo demo is mounted and its nav button is the active one

#### Scenario: unknown demo id falls back

- **WHEN** the entry loads with `?demo=does-not-exist`
- **THEN** the first registry demo is mounted and no console error is emitted

#### Scenario: duplicate and malformed parameters are deterministic

- **WHEN** the entry loads with `?demo=todo&demo=counter` or a malformed query
- **THEN** the first `demo` value wins and the parser never throws

#### Scenario: selected demo chunk fails to load

- **WHEN** the selected demo's module rejects during `load()`
- **THEN** the first registry demo is mounted and no unhandled rejection
  is recorded

#### Scenario: no parameter keeps current behavior

- **WHEN** the entry loads with no query parameters
- **THEN** the first registry demo is mounted, as before

### Requirement: Opt-in debug snapshot

When the `debug` query parameter is `1`, the SPA mount SHALL expose a
read-only `globalThis.__tambor` handle naming the active demo and
returning the current app state, the raw app view derivation and the
draw count. The handle SHALL be cleared when the current demo unmounts
and published only after the next demo mounts, so it never names a demo
that is not mounted. When the parameter is absent, no such global SHALL
be created.

#### Scenario: debug handle reflects the mounted app

- **WHEN** the entry loads with `?demo=counter&debug=1`
- **THEN** `__tambor.demo` is `counter`, `__tambor.state()` equals the app
  state, `__tambor.view()` equals the app's raw current view, and
  `__tambor.drawCount()` is at least 1

#### Scenario: nav switch never exposes a stale demo

- **WHEN** the user selects another demo and the new module is still loading
- **THEN** `__tambor` is absent (or names no demo), and after the mount it
  names the new demo

#### Scenario: debug is absent by default

- **WHEN** the entry loads without `?debug=1`
- **THEN** `globalThis.__tambor` is undefined

### Requirement: Behavior-inert test seams

The query parameters SHALL NOT alter drawn output, event routing or
dispatch semantics. Enabling debug SHALL leave the drawn projection
equivalent to the debug-off run at the same demo and state.

#### Scenario: debug does not change the drawn tree

- **WHEN** the same demo mounts with and without `?debug=1`
- **THEN** the drawn root's text and element geometry projection are equal

#### Scenario: direct boot matches nav-selected boot

- **WHEN** the todo demo mounts through `?demo=todo` instead of a nav click
- **THEN** its initial state, drawn tree and event routing match the
  nav-selected mount

### Requirement: Fixture query composition

The e2e fixture SHALL parse `demo`, `debug` and the existing `sw`
parameter together, with `sw=1` retaining its registration-attempt
semantics. Successful service-worker registration is covered separately
by the deployed-layout spec, not by the fixture.

#### Scenario: combined flags

- **WHEN** the fixture is served at `?demo=todo&debug=1&sw=1`
- **THEN** the todo demo mounts, `__tambor` exists, and the
  service-worker registration attempt is unchanged from `sw=1` alone