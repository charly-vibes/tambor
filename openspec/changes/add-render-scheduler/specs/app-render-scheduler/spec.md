## ADDED Requirements

### Requirement: One host-owned scheduling authority

When a host installs its scheduler through the App's scheduling seam,
the mount SHALL route every repaint request, routed-event paint tail,
and non-routed rerender drain into one pending frame slot owned by
that host, so at most one animation-frame callback is queued per
frame.

#### Scenario: burst schedules one frame

- **WHEN** 80 routed dispatches arrive within one animation frame
  under the default coalesced mount
- **THEN** the host frame queue holds exactly one callback, the
  backend draws exactly once for the frame, and the state equals 80
  sequential single-dispatch applications

#### Scenario: request dedupes with the wire tail

- **WHEN** a routed dispatch's repaint request and the wire's paint
  tail land in the same frame
- **THEN** the frame runs one draw closure — the wire's tail
  supersedes the request's — not one callback per request plus one per
  tail

### Requirement: Repaint requests mirror dispatch

When a scheduler is installed, `makeApp` SHALL deliver exactly one
repaint request per top-level state-effect dispatch to it and SHALL
NOT queue an animation-frame callback of its own; empty batches,
lane-only batches, and internal dispatches SHALL emit no request.

#### Scenario: one request per dispatch, no self-queued callback

- **WHEN** a single state-effect dispatch runs with a spy scheduler
  installed
- **THEN** the spy receives exactly one request and the host frame
  queue gains no callback from makeApp

#### Scenario: lane-only batch emits no request

- **WHEN** a lane-only batch dispatches under an installed scheduler
- **THEN** no repaint request is emitted, while the wire's lane draw
  still paints the cached tree under the transform for the frame

### Requirement: Default scheduling preserved

Absent an installed scheduler, `makeApp` SHALL keep today's default:
exactly one `requestAnimationFrame` view re-derivation per top-level
state-effect dispatch where `requestAnimationFrame` exists, none where
it does not, with effects applied synchronously in dispatch order
regardless — so DOM-less consumers and the headless corpus are
unchanged.

#### Scenario: bare makeApp queues one rebuild per dispatch

- **WHEN** three state-effect dispatches run on a bare makeApp with
  animation frames stubbed and the frame is pumped
- **THEN** exactly three callbacks are queued, and pumping all three
  performs exactly three `appView` re-derivations in total (the view
  function spy counts exactly 3)

#### Scenario: no-rAF host schedules nothing

- **WHEN** a dispatch runs on a host without `requestAnimationFrame`
  and no scheduler is installed
- **THEN** no callback is queued, none fires, and the state is applied

### Requirement: Immediate mode opt-out unchanged

The "immediate" mode SHALL keep one synchronous draw per dispatch as
landed, and the installed authority SHALL absorb repaint requests as
no-ops in that mode so no deferred work and no frame callback exist.

#### Scenario: immediate dispatches draw synchronously

- **WHEN** 80 dispatches arrive in "immediate" mode with animation
  frames stubbed
- **THEN** the backend performs 80 synchronous draws and the frame
  queue stays empty

#### Scenario: flush is a no-op in immediate mode

- **WHEN** the handle's flush is called in "immediate" mode after a
  dispatch
- **THEN** nothing is pending and no draw runs

#### Scenario: no-rAF host installs the absorbing authority

- **WHEN** the mount runs on a host without `requestAnimationFrame`
- **THEN** the absorbing authority is installed — draws stay
  synchronous, repaint requests are absorbed as no-ops, and no
  never-flush state exists

### Requirement: Non-routed dispatch drains the authority

A dispatch outside the routed event wire SHALL paint synchronously
exactly once through the authority's single draw path (the pending
slot where it defers, a synchronous draw where it absorbs); any queued
frame callback SHALL find the slot empty and perform no draw, so no
dispatch double-draws and no queued callback re-draws.

#### Scenario: non-routed dispatch draws once

- **WHEN** `app.dispatch` runs outside the routed wire under the
  coalesced mount and the frame is pumped afterwards
- **THEN** the backend draws exactly once, synchronously at dispatch
  time, and the pumped callback performs no draw

#### Scenario: flush after drain is a no-op

- **WHEN** the handle's flush is called after a non-routed dispatch
  has drained the pending frame
- **THEN** nothing further is pending and no additional draw runs

### Requirement: Flush drains the pending frame exactly once

The handle's flush SHALL drain the single pending frame exactly once
regardless of whether requests, wire tails, or both dirtied it.

#### Scenario: flush drains a request-and-tail frame once

- **WHEN** a dispatch dirtied the pending slot with both a repaint
  request and the wire's tail and the handle's flush is called before
  the frame is pumped
- **THEN** exactly one draw runs synchronously and the pumped frame
  callback performs no draw

### Requirement: Unmount discards pending work

Unmount SHALL discard pending work so a post-unmount frame never
re-derives or draws into the detached tree.

#### Scenario: unmount discards the pending frame

- **WHEN** the mount unmounts while a request-dirtied frame is pending
  and the frame is pumped afterwards
- **THEN** no derivation runs and no draw reaches the detached tree

### Requirement: The headless wire schedules through one authority

The headless wire SHALL install its span-closing repaint as the
scheduler: a framework-mode send runs exactly one callback AND the
phase record closes via `finishDraw` on that repaint; a raw-mode send
with no repaint intent SHALL run exactly one callback and no second
rAF is queued anywhere.

#### Scenario: framework send schedules one callback closing the phase

- **WHEN** a framework-mode send runs with phase timers on and the
  frame is pumped
- **THEN** exactly one callback runs and the phase record closes via
  `finishDraw`

#### Scenario: raw send schedules exactly one callback

- **WHEN** a raw-mode send with no repaint intent runs and the frame
  is pumped
- **THEN** exactly one callback runs
