# Add keyed DOM reconciliation

## Why

M1 (add-runtime-invalidation, landed) made a streaming tail into a long
memo-stable history cheap with positional identity reuse: a child whose
Elem is identity-equal to the child at the SAME position splices that
frame's DOM subtree, and anything else rebuilds conservatively
(`src/render/dom-painters.ts:138-160` — its own doc comment: "Reorder/
insert/remove shift positions, so the index check rebuilds
conservatively — no keyed matching"). Two costs survive by design. A
long list with an insert or a removal re-derives and rebuilds every row
at or after the touched position — insert one message at the top of a
1,000-row memo-stable history and 999 unchanged rows rebuild. A reorder
rebuilds wholesale, so focus, selection and scroll anchoring inside the
moved rows' DOM die with the rebuild — the roadmap pins this as Gate B
("keyed identity, focus preservation") with bench B2 ("DOM
reconciliation: keyed node identity, focus/selection preservation")
assigned to M2. And addressing is positional downstream of the renderer:
chat handlers bind list items by index today (the `nums` plus
`seq-nth(i)` path shape, `src/effects/counter.ts:9,38`), so a handler
built for message i silently retargets to a DIFFERENT message after an
insert above it — the wrong row edits, and nothing fails. Keyed matching
(Solid's `<For>` payoff, without its mechanisms) keeps Elem identity
across position changes; a keyed path navigator (address by id) keeps
handler paths stable across insert/remove; a createSelector-style
selector keeps per-item derivation to one compute per slice change.

## What Changes

- A `keyed(key, drawable)` declaration helper
  (`src/views/nodes.ts`): attaches an app-declared key — a non-empty
  string or finite number — to a drawable as plain frozen data the
  renderer reads. Keys are app-declared; the renderer never infers
  identity from element content.
- A pure `reconcile(prev, next, key)` matcher + keyed sibling matching
  in `buildChildWithReuse` (`src/render/dom-painters.ts`): a child
  whose declared key matches a previous child of the SAME container AND
  whose Elem is identity-equal splices the previous subtree at its NEW
  position (appendChild moves elements, so reorder is append order);
  unkeyed children keep M1's positional rule unchanged; everything else
  builds fresh. Keyed matching composes with — never replaces — M1's
  conservative rules.
- A keyed path navigator in the state.paths vocabulary:
  `["by-key", field, value]` addresses the unique element of a sequence
  whose field equals the value (Object.is), exactly-one with loud
  failures (missing → keyed-not-found, ambiguous → keyed-ambiguous).
  Chat handler paths address rows by id, so the same path selects,
  updates and deletes the same logical item across insert/remove —
  handlers stop retargeting.
- A createSelector-style selector over the memo primitive
  (`src/components/memo/`): `createSelector(pick, build)` memoizes a
  derived answer on the picked slice's object identity — derived once
  per slice change, not once per row; per-row consumption (a selected
  boolean) is O(1).
- Bench B2 (DOM reconciliation) is registered per the roadmap: baseline
  recorded BEFORE keyed matching lands (findings-bz.md conventions),
  then the keyed re-run — moved rows moved, not rebuilt — with
  focus/selection preservation verified in a real browser.

## Non-goals

- No signals as state model, no automatic dependency tracking, no
  mutable reactive state, no virtual DOM as a public abstraction, no
  JSX requirement, no implicit effects, no Solid dependency — the
  roadmap's NOT-copy list, restated in full.
- No content-matching in the RENDERER: keys are app-declared plain
  data; the backend never guesses that a fresh-but-equal child "is" a
  previous one (that is the fresh-but-equal rebuilds rule, unchanged).
- No change to M1's delivered rules: identity is the only reuse key
  within positional matching, the unknown-ChangeSet conservative
  rebuild stands, and the whole-view short-circuit is untouched. Keyed
  matching extends the key domain; keys never rescue an unknown frame.
- No focus-management API: focus/selection preservation is an OUTCOME
  of element identity (B2 verifies it in a real browser), not a new
  subsystem.
- No scheduler ownership changes (add-render-scheduler) and no general
  structural diffing / VDOM-lite beyond keyed sibling matching (M1's
  rejected alternative stays rejected).
- No map-keyed addressing: `by-key` addresses sequences; maps keep
  keypath. No nested-keypath field in v1.

## Impact

- Affected specs: `app-keyed-dom-reconciliation` (new capability);
  `app-runtime-invalidation` (MODIFIED — the Property coverage mirror
  requirement rescoped so its per-child reuse predicates govern unkeyed
  children, with the keyed capability cited as the boundary);
  `state-paths` (ADDED — keyed element addressing);
  `components-memo` (ADDED — selector memoization).
- Affected code: `src/views/nodes.ts` (keyed(); the Elem union admits
  the wrapper — RO5U §1 review CORR-001);
  `src/views/geometry.ts` (keyed read-through in the
  origin/bounds/children/makeNode tables — the wrapper is transparent);
  `src/render/dom-painters.ts` (reconcile + keyed maps in BuildCtx and
  buildChildWithReuse; this change ADDS the per-parent records and the
  container index-path stack — the landed code swaps a single global
  reuse map, which `src/render/dom.ts` continues to swap per frame); `src/effects/paths-core.ts` +
  `src/effects/paths-walk-navigators.ts` (by-key; `src/effects/
  paths.ts` stays a thin re-export); `src/components/memo/`
  (createSelector); barrels `src/index.ts` + `src/interop/index.ts`
  (`src/core.ts` re-exports only).
- Risk: a wrong keyed splice shows stale UI. Mitigated by the identity
  guard (a keyed child whose Elem differs from its key match rebuilds —
  output never depends on keys) and by duplicate-key degradation to the
  positional/fresh rules in the renderer, while the state layer fails
  loudly on the same key bug. Keyed splice fires only inside M1's reuse
  gate (known ChangeSet hint), so the unknown frame stays fully
  conservative.
- Benchmarks: B2 registered with its baseline recorded BEFORE the
  mechanism lands (regression policy), verdict in
  `benchmarks/findings-b2.md`; M1's B3 streaming scenario remains the
  positional-reuse anchor and must stay green.
