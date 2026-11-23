# Design: add-host-interoperability

## Ground truth (verified)

- The mount handle exposes the live drawn tree to the embedding page:
  `SpaHandle.root`/`surface`/`backend`/`app`
  (`src/spa/mount.ts:75-90`) — read and write are indistinguishable
  at this surface, and nothing on it is typed for host use.
- `RealDomElement` mirrors every attribute/style write onto the real
  element through write-through proxies
  (`src/interop/domhost.ts:163,174`): the drawn tree IS the real DOM,
  so a host write inside the island is indistinguishable from a
  tambor write until identity reuse or a rebuild disagrees with it.
- Real DOM events already bridge inward: `addEventListener` maps
  pointer/keyboard/clipboard events to the SimEvent shape on
  registration (`src/interop/domhost.ts:227-247`), and `dispatch()`
  keeps the shim path invoking the original listeners
  (`src/interop/domhost.ts:266`).
- Host programs reach tambor state only through the interop seam:
  `makeOpsApp` routes every dispatch through `interDispatch`
  (`src/interop/app.ts:32`), which normalizes tags via ops, applies
  batches strictly in order, and reports-and-skips unknown tags
  (`src/interop/seam.ts`).
- Teardown is by-convention: the demo switcher's `current?.unmount()`
  (`src/spa/main.ts:190`) and the docs shell's unmount wrapper
  (`src/docs/main.ts:352-358`); post-unmount coalesced frames already
  discard and no-op (`src/spa/mount.ts:176-182`).
- add-resource-scopes (tambor-9qo) lands the disposal model this
  change builds on; add-runtime-invalidation (tambor-1cr) lands the
  ChangeSet/per-child-identity model the invalidation story rides.

## Decisions

1. **The boundary is the island handle, and intents are plain data
   with string tags.** `mountIsland(doc, host, create, options)`
   returns a handle with `status` (either `"live"` or `"disposed"` —
   these are the only observable values), `dispose()`, and one intent
   entry
   taking a batch of `HostIntent` — a plain-data union tagged with
   namespaced strings (`interop/dispatch` carrying effect vectors,
   `interop/external-mutation` carrying an optional reason), matching
   interop-model's plain_data_api and string_tags conventions. One
   entry point keeps the surface auditable and lets unknown intent
   tags reuse the seam's established reported-and-skipped rule.
   Alternatives rejected: exposing the drawn `RealDomElement` tree on
   the handle (the poke-surface this capability exists to close —
   today's `SpaHandle.root`/`surface` stay for the in-repo demo/docs
   shells, which own their embeds); a stringly-typed DOM-command API
   (`setAttr(nodeId, ...)`) — that is VDOM-as-public-API creep and
   would rebuild tambor around foreign writes.
2. **The island mount is its own mount.** `mountIsland` creates the
   island mount's own root scope (app-resource-scopes, "The mount
   owns a root scope"); every island-owned resource — worker-effect
   clients, timers via `onCleanup` — registers there, and the island
   scope nests beneath it. `dispose()` on the handle disposes that
   scope (children-first, LIFO — semantics owned by
   app-resource-scopes and cited, not restated) and then releases the
   drawn subtree: the island's drawn root leaves the host document
   and no later draw writes into the host through the island (the
   unmount seam's pending-frame discard at `src/spa/mount.ts:176-182`
   becomes the island rule). Fail-safe composition comes from that
   capability unchanged: registration on a disposed scope invokes
   immediately, so a resource created after dispose closes on the
   spot, and an intent filed after dispose is reported-and-skipped —
   an island cannot be resurrected (contrast worker terminate's lazy
   respawn, the contract dispose deliberately does not share).
   Alternative rejected: reusing an existing tambor mount's root
   scope for the island (that couples foreign hosts to tambor mounts —
   a standalone foreign page has no tambor mount to reuse, and
   embedding inside one would make island teardown a property of the
   embedder's mount instead of the island's own lifecycle).
3. **External mutation is conservative and island-local.** The
   `interop/external-mutation` intent marks the island's next drawn
   frame as an unknown ChangeSet and schedules that next drawn frame
   through the existing coalescer — a paint happens even when no
   dispatch was pending — under add-runtime-invalidation's
   conservative rule (full rebuild, per-child identity reuse disabled
   for that frame) — with the rebuild confined to the island's own
   subtree: sibling islands and the surrounding host-owned DOM follow
   their ordinary identity rules. Tambor never reads host-mutated
   nodes back: a forced rebuild builds purely from the derived view,
   so foreign writes are erased, never absorbed. The capability holds
   standalone — without add-runtime-invalidation, every draw is
   already a full rebuild, so the requirement is met trivially and
   the guard is a no-op; with it, the island's unknown frame is
   exactly the fallback its B1 scenario pins. Alternatives rejected:
   fine-grained mutation reports (hosts cannot name tambor's subtree
   identities without the boundary leaking internals, and a wrong
   report would splice stale output — the one outcome identity reuse
   must never produce); MutationObserver auto-detection (an implicit
   effect — NOT-copy list; per-node cost on the host's whole page;
   and detection cannot restore correctness anyway, since the tree
   is already desynced when the observer fires — only a rebuild
   fixes it).
4. **Event bridging stays one-directional; intents are the missing
   direction.** Host events → SimEvent exists
   (`src/interop/domhost.ts:227-247`) and is untouched. What is added
   is intent-out from the host program: typed plain-data intents
   through the existing dispatch, using plain string tags — the app
   registry's form (island dispatch resolves tags by raw registry
   lookup with no ops normalization,
   `src/interop/dispatch.ts:246-251`; interop-model's ops equivalence
   holds only for this string form at the island boundary) — so the
   same effect vector means the same state
   change from TypeScript, squint, and ClojureScript. No new event
   channel, no listener-registration API, no tambor→host pushes — the
   host pulls state through the seam when it chooses (push
   notifications would be two-way binding, a non-goal).
   Alternative rejected: generalizing the SimEvent bridge into a
   command bus — effects already are the command channel, and a
   second one would duplicate dispatch semantics beside them.
5. **Test seam: jsdom hosts, fake boundaries, mutation counters.**
   The domhost precedent carries over (structural `HostDoc`, jsdom
   satisfies the seams in tests): islands test against jsdom hosts; a
   fake worker-like boundary registers on the island scope to observe
   disposal; attribute-poke and child-insert helpers simulate host
   mutation; a spy backend distinguishes draws from island-subtree
   rebuilds (drawCount vs rebuildCount precedent,
   add-runtime-invalidation task 3.0) and type tests pin the handle
   surface with expectTypeOf.

## Pins

- Intent batches apply strictly in order through the existing
  dispatch; an unknown intent tag is reported and skipped and the
  rest of the batch still runs (interDispatch's unknown-tag rule,
  restated at the island boundary).
- An intent filed after dispose is reported-and-skipped: it never
  respawns island-owned resources, never redraws, and never
  resurrects the disposed scope.
- A coalesced frame pending at dispose time is discarded; no draw
  begins after the drawn subtree is released
  (`src/spa/mount.ts:176-182` precedent).
- One rebuild per drawn frame, not per intent: N external-mutation
  intents filed before the next drawn frame coalesce into exactly one
  island rebuild (coalescing merges paints, never commits —
  add-runtime-invalidation pin, inherited).
- Filing the external-mutation intent schedules the island's next
  drawn frame through the existing coalescer: a paint happens even
  when no dispatch was pending, so an idle island still redraws once
  and erases the foreign write.
- The island mount owns its own root scope: an embedding inside a
  parent tambor mount composes — that parent's unmount disposes the
  island scope children-first without the island's own dispose being
  called (citing app-resource-scopes' root-scope/unmount
  composition); standalone foreign pages are the primary audience and
  carry no parent mount.
- The handle carries no tambor-internal node types: its public
  surface is plain data, functions, and the host-owned seam values
  the host passed in (`HostDoc`, the host's own `HostElement`); the
  drawn `RealDomElement` tree is not reachable from the handle.

## Test shape (inputs/outputs pinned first)

Standalone foreign pages are the primary audience: an island mount is
a full mount with its own root scope, tested without any parent
tambor mount (the parent-embed composition is tested separately per
the spec's conditional scenario).

- Input: a jsdom host mounts a counter island and files a typed
  `interop/dispatch` intent; output: the island's app state advances
  exactly as an in-app dispatch would (state-equivalence) and the
  drawn subtree reflects the new state.
- Input: the host pokes an attribute inside the island, then files
  `interop/external-mutation`; output: the next drawn frame rebuilds
  the island's whole subtree (rebuildCount increments; no reuse
  inside the island) and the output equals a from-scratch build of
  the same derived view — never stale, never absorbing the foreign
  write. Without the intent, the same poke produces no tambor-side
  repair (identity rules unchanged) — which is why filing the intent
  is the host's obligation in the contract.
- Input: dispose with a fake worker-like boundary mid-run; output:
  the boundary closes through the island scope per
  app-resource-scopes, the in-flight run settles the typed disposed
  envelope, the drawn subtree is removed from the host document, a
  subsequent intent is reported-and-skipped, and no later draw writes
  into the host.
