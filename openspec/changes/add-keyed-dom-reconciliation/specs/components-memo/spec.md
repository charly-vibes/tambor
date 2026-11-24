## ADDED Requirements

### Requirement: Selector memoization keys on the picked slice

The memo module SHALL provide `createSelector(pick, build)` returning
`(state) => build(pick(state), state)` memoized on the picked slice's
identity: unchanged slice ⇒ cached value, changed slice ⇒ build re-runs
exactly once, non-object slice ⇒ the memo TypeError, weak retention.
`build` SHALL be pure over the picked slice; `state` is context only —
a build reading beyond the picked slice is unsound (memo's
pure_subtree precedent). Per-row consumption stays O(1).

#### Scenario: unchanged slice returns the cached answer

- **WHEN** the selector is called across derives whose picked slice
  keeps its identity
- **THEN** build runs once and every call returns the same derived
  value

#### Scenario: changed slice rebuilds once

- **WHEN** the picked slice's identity changes and the selector is
  called again
- **THEN** build runs exactly once for the new identity and the new
  answer is cached for it

#### Scenario: non-object picked value is rejected

- **WHEN** pick returns a primitive or null
- **THEN** the call throws the memo TypeError — identity is the
  invalidation signal, never silently mis-keyed

#### Scenario: per-row consumption stays O(1) after one derive

- **WHEN** a 1,000-row list re-derives with one selection change and
  each row's render consults the selector
- **THEN** build runs once for the frame and each row's comparison
  against the derived selection is a constant-time operation
