---
id: components.memo
kind: intent
statement: "WHEN a subtree's inputs are identified by a state slice whose identity is unchanged THE memo SHALL return the cached subtree instead of re-deriving it, and SHALL re-derive exactly when the key's identity changes."
---

# components.memo

## Purpose

The memo component (tambor-54j.8.4): `memo(build)` returns a memoized
render function — an app creates it once (module scope, the React
`memo`/`useCallback` shape without a macro) and maps its per-item
subtrees through it. The cache key is the item object's identity, one
`WeakMap` per memoized renderer, so a key that leaves app state lets
its cached subtree be collected. The boundary sits above expensive
derives: a hit costs one WeakMap lookup against the ~4.6–5.1 µs
serialization key the component render cache pays
(benchmarks/findings-kit.md, tambor-54j.11), so cheap boundaries are
harmless but pointless. Identity is the invalidation signal for the
same reason 8xm's route-time view cache is sound: state changes only
through dispatch — including cell-writeback closures, which capture
state and write back through the registry-aware dispatcher — and every
dispatch produces fresh identity for each changed slice with
structural sharing preserving unchanged slices.

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| identity_keyed | invariant | a call with an object key returns the cached subtree when the key's identity is unchanged, and calls build exactly once per distinct key object | [[components.memo]] |  |
| no_deep_equality | invariant | a structurally equal but distinct key object is a miss and re-derives — the equality is identity, never deep equality | [[components.memo]] |  |
| object_keys_only | invariant | a key that is not an object (a primitive or null) is rejected with a TypeError at the call, never silently mis-keyed | [[components.memo]] |  |
| writeback_sound | invariant | identity is a sound invalidation signal because state changes only through dispatch — including cell-writeback closures that write back through the registry-aware dispatcher — so a memoized subtree's handler closures stay valid for as long as the key identity lives and an unchanged sibling slice keeps its cached subtree across a changed parent | [[components.memo]] |  |
| pure_subtree | invariant | the cached subtree is a plain immutable view value and a pure function of its key — the same key object yields the identical node on every derive | [[components.memo]] |  |

## Model

### States

- `cold`
- `warm`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_prime | cold | warm | [[components.memo.identity_keyed]] |
| t_rebuild | warm | warm | [[components.memo.no_deep_equality]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_identity_hit | unit | [[components.memo.identity_keyed]] | the same key object twice | build is called once and both calls return the same node |
| p_invalidate | unit | [[components.memo.identity_keyed]] | a key object then a fresh immutable copy of it | the fresh key re-derives and the repeated call on it is a hit |
| p_sibling_share | unit | [[components.memo.identity_keyed]] | a two-row list where only the second row's object is replaced | the untouched first row is built once across all three derives |
| p_no_deep | unit | [[components.memo.no_deep_equality]] | two distinct objects with equal content | each derives — build is called twice |
| p_keys_only | unit | [[components.memo.object_keys_only]] | keys 1, "x" and null | each call throws TypeError |
| p_writeback | unit | [[components.memo.writeback_sound]] | a memoized row carrying a writeback closure, applied over a two-row list | the writeback preserves the untouched row's identity and the memoized sibling stays cached |
| p_pure | unit | [[components.memo.pure_subtree]] | the same key object derived twice | both derives yield the identical node |

## Requirements

### Requirement: Property coverage mirror

Every property row SHALL be verified by exactly one dedicated test;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_identity_hit

- **WHEN** the same key object twice
- **THEN** build is called once and both calls return the same node
- **VERIFIES** [[components.memo.p_identity_hit]]

#### Scenario: p_invalidate

- **WHEN** a key object then a fresh immutable copy of it
- **THEN** the fresh key re-derives and the repeated call on it is a hit
- **VERIFIES** [[components.memo.p_invalidate]]

#### Scenario: p_sibling_share

- **WHEN** a two-row list where only the second row's object is replaced
- **THEN** the untouched first row is built once across all three derives
- **VERIFIES** [[components.memo.p_sibling_share]]

#### Scenario: p_no_deep

- **WHEN** two distinct objects with equal content
- **THEN** each derives — build is called twice
- **VERIFIES** [[components.memo.p_no_deep]]

#### Scenario: p_keys_only

- **WHEN** keys 1, "x" and null
- **THEN** each call throws TypeError
- **VERIFIES** [[components.memo.p_keys_only]]

#### Scenario: p_writeback

- **WHEN** a memoized row carrying a writeback closure, applied over a two-row list
- **THEN** the writeback preserves the untouched row's identity and the memoized sibling stays cached
- **VERIFIES** [[components.memo.p_writeback]]

#### Scenario: p_pure

- **WHEN** the same key object derived twice
- **THEN** both derives yield the identical node
- **VERIFIES** [[components.memo.p_pure]]
