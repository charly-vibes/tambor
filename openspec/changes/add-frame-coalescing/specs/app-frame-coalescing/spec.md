## ADDED Requirements

### Requirement: Default frame coalescing

The SPA mount SHALL coalesce multiple dispatches that arrive within one
animation frame into exactly one view derivation and draw for that
frame, while applying every dispatch's effects synchronously and in
dispatch order.

#### Scenario: burst of dispatches paints once

- **WHEN** 80 dispatches arrive within one animation frame
- **THEN** the backend draws exactly once for the frame and the state
  equals 80 sequential single-dispatch applications

#### Scenario: state ordering preserved

- **WHEN** two dispatches arrive within one frame, the second carrying
  an effect that reads state written by the first
- **THEN** the second dispatch observes the first dispatch's applied
  state, as with uncoalesced dispatch

### Requirement: Opt-out mode

The SPA mount SHALL offer an opt-out mode that restores per-dispatch
repaint scheduling, and the existing custom-dispatch escape hatch SHALL
remain untouched by the coalescing layer.

#### Scenario: opt-out restores current behavior

- **WHEN** the mount is created with coalescing disabled and 80
  dispatches arrive
- **THEN** each dispatch schedules its own repaint, matching today's
  measured naive path

#### Scenario: custom dispatch bypasses coalescing

- **WHEN** an app passes a custom dispatch to the mount
- **THEN** the coalescing layer never wraps it
