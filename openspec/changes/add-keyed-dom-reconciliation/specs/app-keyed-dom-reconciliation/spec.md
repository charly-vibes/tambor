## ADDED Requirements

### Requirement: Keyed sibling matching splices across positions

The DOM backend SHALL splice the previous frame's DOM subtree for a
child whose declared key matches a previous child of the same container
(Object.is) and whose Elem is identity-equal to it, regardless of
position, donating each range at most once per frame. Unkeyed children
follow the positional rule of app-runtime-invalidation; no keyed match
builds fresh; a keyed child whose Elem differs from its key match
rebuilds — drawn output never depends on keys.

#### Scenario: keyed reorder splices

- **WHEN** children `[a, b, c]` keyed k1, k2, k3 are rebuilt as
  `[c, a, b]` with unchanged Elems
- **THEN** all three rows splice their previous elements — the same
  element references appear in the new order and no row rebuilds

#### Scenario: keyed insert splices subsequent rows

- **WHEN** a keyed row is inserted mid-list into a memo-stable history
- **THEN** only the inserted row builds fresh and every subsequent
  keyed row keeps its previous element references — positions shifted,
  DOM not rebuilt

#### Scenario: keyed remove splices the remainder

- **WHEN** a keyed row is removed from a keyed list
- **THEN** the remaining keyed rows keep their previous element
  references and the removed row's record is dropped

#### Scenario: content change under a stable key rebuilds

- **WHEN** a child's declared key matches the previous frame but its
  Elem is a fresh object (the row's content changed)
- **THEN** that child rebuilds — the previous DOM is never spliced

### Requirement: Keyed matching is conservative at the boundaries

Keyed matching SHALL fire only inside app-runtime-invalidation's reuse
gate (a hinted frame with a known ChangeSet) and only within a rebuild:
keys never enable the whole-view short-circuit and SHALL NOT rescue an
unknown ChangeSet. A key SHALL match only within the same parent
container, and duplicate keys SHALL degrade: the first match donates,
further same-key children follow the positional/fresh rules.

#### Scenario: unknown change disables keyed splice

- **WHEN** a frame's ChangeSet is `unknown` and its children carry
  declared keys
- **THEN** no subtree is spliced for the frame — the full conservative
  rebuild happens exactly as app-runtime-invalidation pins

#### Scenario: keys never enable the short-circuit

- **WHEN** a derived view is identity-equal to the last drawn view and
  the frame is known, and when a later unknown frame matches too
- **THEN** the known frame skips exactly as app-runtime-invalidation
  pins and the unknown frame still rebuilds regardless of keys

#### Scenario: duplicate keys degrade to rebuild

- **WHEN** two children of one container declare the same key
- **THEN** the first splices its key match and the second follows the
  positional/fresh rules — the drawn output equals a build of the same
  children with no keys at all

#### Scenario: a key never crosses containers

- **WHEN** a child's key matched under a different parent container in
  the previous frame
- **THEN** the child rebuilds (keyed matching is per-container)

### Requirement: Keys are app-declared plain data

A `keyed(key, drawable)` helper SHALL attach a declared key — a
non-empty string or a finite number — to a drawable as plain frozen
data the renderer reads, SHALL reject a non-primitive key, an empty
string, a non-finite number, or a group drawable loudly (a TypeError at
construction, mirroring the memo contract), SHALL NOT change the
drawable's drawn output (the key is metadata to every builder), and
children without keys SHALL keep app-runtime-invalidation's positional
rule unchanged.

#### Scenario: keyed attaches plain data

- **WHEN** an app wraps a row as `keyed("m-7", rowOf(item))` and the
  list is drawn twice with the row's inner Elem unchanged
- **THEN** the keyed draw's output equals the unkeyed row's output and
  the second frame splices the first frame's subtree by key — the
  identity subject is the inner drawable's Elem, never the wrapper

#### Scenario: a fresh wrapper splices against the inner Elem's identity

- **WHEN** the same child is derived twice as `keyed(k, x)` — two
  wrapper objects that are NOT identity-equal to each other — over an
  inner Elem `x` that is identity-stable across frames
- **THEN** both wrappers splice the previous frame's range for `k`
  against `x`'s Elem identity: `keyed(k, x) !== keyed(k, x)` per call,
  but the key locates the slot and the unwrapped Elem identity
  confirms the splice

#### Scenario: an unstable inner Elem rebuilds under a stable key

- **WHEN** a per-derive wrapper `keyed(item.id, rowOf(item))` meets a
  frame where `rowOf(item)` returns a fresh Elem (the memo boundary
  was not stable)
- **THEN** that child rebuilds — the wrapper is fresh every call by
  design, so Elem stability is owned by the memo boundary exactly as
  M1 requires of per-derive rows, never by the wrapper

#### Scenario: invalid keys are rejected loudly

- **WHEN** `keyed` is called with an object key, null, an empty string,
  NaN, or a group drawable
- **THEN** construction throws a TypeError and nothing is built

#### Scenario: unkeyed children keep the positional rule

- **WHEN** a frame's children carry no declared keys
- **THEN** reuse behaves exactly as app-runtime-invalidation pins —
  same-position identity splice, conservative rebuild otherwise
