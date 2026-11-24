# Design: add-keyed-dom-reconciliation

## Ground truth (verified against the worktree)

- `buildChildWithReuse` (`src/render/dom-painters.ts:138-160`): a
  `reusePrev.get(child)` identity hit AT THE SAME index splices the
  previous frame's elements (appendChild moves them — reorder is
  expressible as append order); a miss builds fresh and records its
  range. The doc comment pins the gap this change fills: "Reorder/
  insert/remove shift positions, so the index check rebuilds
  conservatively — no keyed matching."
- The reuse fields (`src/render/dom-painters.ts:111-121`): reusePrev /
  reuseNext are per-frame `WeakMap<Elem, BuiltRange>`; reuseUsed holds
  "ranges already spliced this frame — a structurally shared Elem may
  only donate its elements once". The backend swaps reuseNext into
  reusePrev after each build (`src/render/dom.ts:148`, `:356`) —
  retention is exactly one frame.
- The reuse gate (`src/render/dom.ts:234-235`): an unknown ChangeSet
  frame or any hintless draw sets reuseDisabled, so reusePrev is
  undefined for the whole build — no subtree is reused, keyed or
  otherwise, and stale output is impossible.
- The whole-view short-circuit (`src/render/dom.ts:211-227`): skip only
  on a known ChangeSet + unchanged ambience + view identity; keyed
  matching operates inside a rebuild and has no bearing on the skip.
- The path vocabulary (`src/effects/paths-core.ts:34-47`): keypath,
  nth, seq-nth, filter, take, drop, nil-to-val, keypath-list,
  collect-one, rest-args-map, path, const — one handler per navigator
  in `paths-walk-navigators.ts` (tambor-272 split), loud failures
  precedent `seq-nth index out of range` (`:186`).
- `memo` (`src/components/memo/memo.ts:40-63`): WeakMap identity cache,
  loud TypeError on non-object keys ("identity is the invalidation
  signal"); corpus rows identity_keyed / object_keys_only pin it.
- List items are addressed by index today: derived paths bind rows as
  the list plus `seq-nth(i)` (`src/effects/counter.ts:9,38`) — the
  handler-stability hazard behind the keyed navigator.

## Decisions

1. **Keys are app-declared plain data on the drawable, via
   `keyed(key, drawable)`.** `keyed` returns a fresh keyed wrapper per
   call — `keyed(k, x) !== keyed(k, x)` — so the wrapper is never an
   identity signal: the renderer's identity guard unwraps it and tests
   the TARGET's Elem identity. The key is a non-empty string or finite
   number carried as plain frozen data
   (`immutable_nodes` preserved). The renderer reads `child.key`
   uniformly and looks through the wrapper to `x`. Alternatives: renderer-side content matching — rejected,
   the renderer guessing identity from element content is exactly the
   fresh-but-equal rebuilds rule and the VDOM-lite creep M1 rejected;
   keys are app-declared by definition. An Elem→key side registry —
   rejected, a mutable global registry; keys must ride the plain view
   data like every other view fact. A `keyed` NODE TYPE in the drawable
   vocabulary — rejected, spec + backend-parity surface (a draw type
   must draw on every backend, primitive_set parity) for what is a
   render hint; the `keyed` helper is a wrapper the renderer unwraps,
   not a draw type, so no backend parity burden. Keys only on
   memo components — rejected, keys are list-assembly data, not memo's.
   Groups (readonly arrays) cannot carry a field, so `keyed` rejects
   them loudly: key a node (the row's handler/translate node), not the
   bare group.
2. **The key locates; the inner Elem identity confirms; splice on
   both.** Matching rule: a child with declared key k splices the
   previous frame's range for k at this container only when the
   previous child's TARGET Elem is identity-equal to this child's
   TARGET Elem (the guard unwraps the keyed wrapper before lookup —
   the key locates the candidate slot, the inner drawable's Elem
   identity confirms it). A keyed wrapper is fresh each call and never
   compared by its own identity; a keyed child whose inner Elem
   differs from its key match rebuilds — the memo boundary owns Elem
   stability, a discipline M1 already requires of per-derive rows
   (`keyed(item.id, rowOf(item))` works whenever `rowOf` is
   memo-stable). The key
   extends the LOOKUP domain (O(1) position-free lookup); identity
   remains the SOUNDNESS guard, precisely as M1 pinned. Alternatives:
   key-only splice — rejected, stale: editing a message's text under a
   stable id derives a fresh row Elem, and splicing the old DOM would
   show the old text (violates stale-output-impossible-by-construction);
   identity-anywhere matching (no keys, position-free identity scan) —
   rejected, no app-declared logical domain to share with the path
   navigator, O(n²) scans, and structurally shared Elems make "which
   instance" ambiguous — reuseUsed limits donation, not selection.
3. **Composition with M1: keyed splice fires only inside M1's reuse
   gate, scoped per container.** Keyed records exist only on a hinted,
   known-ChangeSet frame — unknown or hintless ⇒ no keyed maps ⇒ every
   child follows the positional/fresh rules (keys don't rescue unknown
   frames). Keyed matching happens only WITHIN a rebuild; it never
   enables the whole-view short-circuit (M1's skip conditions
   unchanged). Key maps are per-parent: a key never matches across
   containers (a row moved between parents rebuilds). Duplicate keys
   degrade by FIRST MATCH WINS on the previous frame too: the first
   candidate donates, further same-key children fall through to
   positional/fresh — drawn output never depends on key hygiene (the
   LOUD exactly-one rule lives in the state layer,
   decision 5). Frame retention stays one build: the swap; a removed
   row's record is dropped there.
4. **`reconcile(prev, next, key)` is a pure plan function next to
   buildChildWithReuse.** Given the previous children of a container
   and the next children plus a key extractor (default: read `.key`),
   it returns per-next-child steps — reuse(prevIndex) or build — plain
   data, unit-testable with no DOM. The painter computes the plan once
   per container and buildChildWithReuse consumes the step for its
   index; splice donation still flows through M1's reusePrev/reuseUsed
   (keyed matching extends the key domain; the range machinery is
   M1's). BuildCtx gains the per-parent record this needs — the
   previous children array plus key→prevIndex — threaded and swapped
   whole-structure per build, with keyed records held per container
   index-path (this change ADDS those records; the landed code swaps a
   single global reuse map). Alternatives: the matcher embedded
   only in the painter loop — rejected, untestable without a DOM and
   the ticket names reconcile(prev, next, key) as the deliverable; a
   generic list-diff utility — rejected, keyed sibling matching IS the
   whole algorithm; LCS machinery is diff-library creep.

   Container identity: keyed records are per-parent, swapped
   whole-structure per build (this change ADDS the per-parent records —
   the landed code swaps a single global reuse map, which the proposal
   Impact now states correctly). Container identity is an index-path
   stack pushed on entering and popped on leaving the sequence/array
   build branch, so a key is never looked up against a previous-frame
   record from a different index path — a key never matches across
   containers, which makes task 2.2's cross-container scenario a
   direct test of the stack rather than a global-map accident.
5. **Navigator: `["by-key", field, value]`, exactly-one, loud.**
   Addresses the unique element of a sequence whose `element[field]`
   equals `value` by Object.is. Select continues into the matched
   element; update/set write through it preserving its position and the
   sequence shape (structural sharing via the existing clone helpers);
   delete splices the matched element. Zero matches throw
   keyed-not-found, several throw keyed-ambiguous — in select and write
   alike, mirroring seq-nth's loud out-of-range (`:186`). The stability
   property: the same path addresses the same logical item whenever it
   exists; when the item is gone the path fails loudly instead of
   silently retargeting — today's index path edits the WRONG row after
   an insert above, the exact bug class this kills. Handler paths stay
   plain data keyed by app ids (the same ids the rows are keyed with),
   so a row's effect list survives insert/remove unchanged.
   Alternatives: `filter` with an id predicate — rejected, filter is
   set-oriented (zero-or-more, silent empty on missing) with merge
   write-back semantics; addressing wants exactly-one and loud failure.
   Tolerant multi-match — rejected, silent wrong-target edits. Map
   support — rejected, maps address by keypath; no keyed analog worth
   the spec surface. Name `by-id` with an assumed id field — rejected,
   the state layer owns no schema; field+value stays explicit.
   Sequences only; the field is a plain property name in v1.
6. **Selector: `createSelector(pick, build)` over memo.** Returns
   `(state) => build(pick(state), state)` memoized on the picked
   slice's object identity — memo's exact cache shape (WeakMap, loud
   non-object rejection, weak retention). Identity-unchanged picked
   slice ⇒ cached answer; changed slice ⇒ build exactly once. The
   Solid createSelector correspondence: theirs memoizes the selected
   key so only the flipped rows re-run; tambor derives whole-view per
   frame, so the equivalent win is deriving the selection ONCE per
   slice change instead of once per row — pick a slice, derive the
   answer, compare per row at O(1). Composes with keyed rows: rows
   keyed by id keep element identity across selection changes; the
   selector's answer changes only for the affected rows. Alternatives:
   a boolean-only isSelected shape — rejected, subsumed (build returns
   the selection); deep-equality keys — rejected, the 4.6–5.1 µs
   serialization-key precedent, identity is the sanctioned signal; a
   reactive selector cell — rejected, signals are on the NOT-copy list.
7. **Boundaries consumed, not restated.** M1's pins stand untouched:
   identity is the only reuse key within positional matching
   (fresh-but-equal rebuilds); any unknown ChangeSet forces the
   conservative full rebuild; the whole-view short-circuit's
   visible-reason defeats hold. This change extends the key domain:
   same key + same Elem + any position ⇒ splice; every M1 conservative
   rule remains the fallback. Inherited-envelope honesty: keyed reuse
   inherits M1's reuse-soundness envelope exactly — it relaxes only the
   position constraint, so anything the previous DOM painted under
   inherited context behaves precisely as positional reuse behaves
   today, no wider.
8. **Typed test seam.** (a) reconcile plan unit tests — pure, no DOM.
   (b) Spy backend element-identity assertions on M1's seam
   (drawCount/rebuildCount plus element reference equality across
   frames — reuse observable). (c) Path unit tests through by-key,
   including the insert-shift stability case. (d) Selector call-count
   tests. (e) Bench B2 registry scenario: reorder/insert/remove churn
   under CPU×4, findings-bz.md conventions, focus/selection
   preservation verified in a real browser (focus an input inside a
   keyed row, insert above, the focused element keeps its identity).

## Pins

- `keyed` accepts a non-empty string or a finite number and rejects
  anything else — object keys, null, empty string, NaN, group
  drawables — with a TypeError at construction, mirroring memo's loud
  contract.
- A keyed draw builds identically to the unkeyed draw (the key is
  metadata; output-equality test pinned).
- Keyed splice requires ALL of: same parent container, key equality
  (Object.is), Elem identity with the previous child at the matched
  index, that range not already donated this frame, and a known
  ChangeSet hint. Any miss ⇒ positional rule ⇒ fresh build.
- Duplicate keys: first candidate donates; further same-key children
  never splice; the renderer never throws on key bugs.
- Per-parent keyed records retain exactly one frame (the swap); a
  removed row's record and range drop at the swap.
- by-key compares a plain property of sequence elements with Object.is;
  exactly-one is enforced in select and write; errors carry the field
  and the value; writes preserve sequence length/shape and unmatched
  elements' identity.
- createSelector keys are object slices (memo's contract), weakly
  retained; build runs at most once per distinct picked-slice identity.
- Focus/selection preservation is an outcome of element identity,
  verified by B2 in a real browser; no focus API ships in this change.
- The whole-view short-circuit and unknown-ChangeSet rules are
  app-runtime-invalidation's, consumed as boundaries; keyed matching
  disables itself under the same gate rather than restating them.

## Test shape (inputs/outputs pinned first)

- Input: prev [a,b,c] keyed k1/k2/k3 with identity-stable Elems, next
  [c,a,b]. Output: plan = reuse 2, reuse 0, reuse 1, zero build steps;
  the painter splices the same three elements in the new order
  (element references equal across frames, rebuildCount unchanged).
- Input: prev [a,b,c], next [x,a,b,c] with x fresh-keyed. Output: plan
  = build, reuse 0, reuse 1, reuse 2; exactly one new element range;
  subsequent rows keep element references.
- Input: prev [a,b,c], next [a,c]. Output: plan = reuse 0, reuse 2; b's
  record dropped at the swap.
- Input: a next child keyed k2 whose Elem is fresh. Output: build for
  that row only — never splice (content changed under a stable key).
- Input: an unknown-ChangeSet frame with keyed children. Output: full
  rebuild, no splice anywhere (M1 gate, re-asserted with keys present).
- Input: select ["keypath","messages"], ["by-key","id","m-2"],
  ["keypath","text"] before and after inserting a message above.
  Output: the same logical message's text both times; after removing
  m-2 the same path throws keyed-not-found; a duplicate-id state throws
  keyed-ambiguous.
- Input: createSelector over a 1,000-row list with one selection
  change. Output: build called once for the frame; per-row booleans
  are O(1) comparisons against the derived selection.

## Alternatives rejected

- Renderer-side content matching: keys must be app-declared; content
  equality is the fresh-but-equal rule's territory and VDOM-lite creep.
- Key-only splice: stale content when a stable id's row content
  changes; identity stays the guard.
- Identity-anywhere matching (no keys): no logical domain to share with
  the navigator, O(n²), structurally shared Elems ambiguous.
- A `keyed` wrapper NODE type: backend-parity + spec surface for a
  render hint; the plain-data field needs none.
- filter-based addressing: set-oriented, silent empty; addressing is
  exactly-one, loud.
- Deep-equality or reactive selector keys: serialization-cost precedent
  and NOT-copy list respectively.

## Deployment anchoring

The `app-runtime-invalidation` delta is authored directly against the
DEPLOYED spec shape (option (a)): it is a wholesale MODIFIED of the
deployed `### Requirement: Property coverage mirror` requirement — the
row whose `reuse_identity_positional` constraint and
p_stream_tail / p_fresh_rebuilds / p_reorder_rebuilds /
p_unknown_no_reuse properties carry the per-child reuse behavior —
retargeting the header from the previously authored
`### Requirement: Per-child identity reuse` (which does not exist in
the deployed spec). Every VERIFIES link and all unrelated scenarios are
preserved verbatim; only the reuse-scenario predicates are rescoped to
unkeyed children, with a pointer sentence to this change's keyed
capability delta for keyed matching.
