# Add host interoperability

## Why

Foreign hosts (the docs shell, the demo switcher, and eventually
third-party pages) embed tambor as an island — a drawn DOM subtree
inside DOM the host owns — and both directions of that seam are
untyped today. Outbound, the mount handle hands the embedding page
the live drawn tree itself (`SpaHandle.root`/`surface`/`backend`,
`src/spa/mount.ts:75-90`), so nothing distinguishes read from write:
a host that sets an attribute or appends a child inside the island
(`RealDomElement.attrs` is a write-through proxy onto the real
element, `src/interop/domhost.ts:163`) silently desyncs the drawn
tree from the derived view — and once add-runtime-invalidation's
per-child identity reuse lands, a host-poked subtree could be spliced
forward frame after frame as if tambor had drawn it, the stale output
the unknown-ChangeSet full-rebuild rule exists to forbid. Inbound,
the host has no way to tell tambor anything: real DOM events already
bridge to SimEvent (`src/interop/domhost.ts:227-247`), but a host
program that wants to drive the island's app can only poke the DOM or
reach for backend/app internals. And an island inside a foreign page
has no lifecycle owner at all — the demo switcher and docs shell stop
embeds only by convention (`src/spa/main.ts:190`,
`src/docs/main.ts:352-358`), the exact gap add-resource-scopes closes
for the mount ("The mount owns a root scope") but that a removable
island has no counterpart of. An island mount is a full mount:
standalone foreign pages — with no parent tambor mount at all — are
the primary audience. The roadmap sequences this as T5,
ticket tambor-8yl, depending on tambor-9qo (add-resource-scopes), and
gates it: Gate D — general integration readiness (DOM islands, docs,
inspector, a11y) — before wider adoption.

## What Changes

- A typed intent boundary: a host mounts an island with
  `mountIsland(...)` and gets a handle whose only entry point is
  typed, plain-data intents — effect vectors dispatched through the
  app's existing dispatch path, using plain string tags — the app
  registry's form (island dispatch resolves tags by raw registry
  lookup with no ops normalization; the interop-model ops equivalence
  holds only for this string form at the island boundary) — and an
  external-mutation intent. Hosts stop poking the DOM: drawn-tree
  mutation through the handle is not part of the contract, and
  tambor-internal node types do not appear in the boundary's
  signatures.
- Island lifecycle = mount → live → dispose on the resource-scopes
  model: each island mount owns one root scope — its island scope
  nests beneath it, and standalone foreign pages (no parent tambor
  mount) are the primary audience (per the app-resource-scopes
  capability, cited not duplicated), dispose
  runs that scope children-first, closes island-owned boundaries, and
  releases the drawn subtree out of the host document. Disposal stays
  fail-safe: intents filed after dispose are reported and skipped and
  never resurrect the island.
- An external-mutation invalidation story: the typed mutation intent
  marks the island's next drawn frame `unknown` (the
  add-runtime-invalidation conservative rule) scoped island-locally —
  the island's whole drawn subtree rebuilds, nothing outside the
  island does, and tambor never adopts host-mutated nodes into its
  tree.
- The event bridging direction completed: host events → SimEvent
  already exists (domhost); what is added is intent-out — the host
  program calling typed intents in through the existing dispatch. No
  new event channel, no listener API.

## Non-goals

- No signals, no automatic dependency tracking, no mutable reactive
  state, no virtual DOM as a public abstraction, no JSX requirement,
  no implicit effects, no Solid dependency — the roadmap's NOT-copy
  list, restated in full.
- No two-way binding: the host reads island state when it chooses
  (pull through the seam); tambor never pushes subscriptions at the
  host or reactively syncs host state.
- No shadow-DOM requirement: islands render inline in the light DOM
  the host gave them; style isolation stays the host's concern.
- No implicit external-mutation detection (no MutationObserver and no
  DOM diffing against foreign writes) — the typed intent is the
  contract; detection would be an implicit effect and could not
  restore correctness anyway (a desynced tree is only fixed by a
  rebuild).
- No adoption of host-mutated nodes into the drawn tree, and no
  tambor writes into host DOM outside the island's own subtree.
- No keyed reconciliation (tambor-ap8 territory) and no scheduler
  changes (tambor-ry3) — islands ride the existing dispatch,
  coalescing, and draw seams unchanged.

## Impact

- Affected specs: `host-interop` (new capability spec). Disposal
  semantics are cited from `app-resource-scopes`, never duplicated;
  rebuild conservatism rides `app-runtime-invalidation` ChangeSet
  semantics and holds with or without that change (without it, every
  draw is already a full rebuild).
- Affected code: new `src/interop/island.ts` (handle + typed intents
  routed through the app's dispatch); `src/spa/mount.ts` (island
  mount path — additive; the island mount's own root scope follows
  the app-resource-scopes model that change lands);
  `src/interop/domhost.ts` untouched
  (event bridging and the structural adapter stay as-is); barrel
  exports in `src/index.ts` + `src/interop/index.ts` (`src/core.ts`
  re-exports only).
- Risk: a host mutates the drawn subtree without filing the intent —
  the contract cannot detect it (see non-goals), so the boundary rule
  is normative for hosts: file the intent; tambor's conservative
  rebuild then makes stale output impossible once the intent-driven
  paint lands — filing the intent schedules the island's next drawn
  frame through the existing coalescer, so the rebuild happens even
  when no dispatch was pending. A
  disposed island that kept drawing would leak — mitigated by scope
  disposal closing island-owned boundaries (add-resource-scopes) and
  the post-release no-redraw rule pinned in tests (unmount seam
  precedent, `src/spa/mount.ts:176-182`).
