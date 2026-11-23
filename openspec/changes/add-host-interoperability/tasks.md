# Tasks: add-host-interoperability

## 1. Island handle + typed intents

- [ ] 1.0 Red: unit test (jsdom structural host, domhost precedent) —
      `mountIsland(doc, host, create, options)` returns a handle with
      `status` (observable values pinned to `"live"` | `"disposed"`),
      `dispose()`, and the typed intent entry; a typed
      effects intent advances the island's app state exactly like an
      in-app dispatch of the same vectors (state-equivalence) and the
      drawn subtree reflects the new state.
- [ ] 1.1 Green: implement `src/interop/island.ts` — the handle and
      intent routing over the app's existing dispatch (interop-model
      seam semantics: plain data, namespaced string tags, strict
      in-order application, no new scheduling); export from
      `src/index.ts` + `src/interop/index.ts` barrels (`src/core.ts`
      re-exports only).
- [ ] 1.2 Red→Green: an unknown intent tag is reported and skipped
      with the rest of the batch still running in order (interDispatch's
      unknown-tag rule restated at the island boundary).
- [ ] 1.3 Red→Green: island intents do not change existing dispatch,
      effect-ordering, or repaint semantics — the pinned
      state-equivalence contract stays green with an island attached
      and intents interleaved with in-app dispatches.

## 2. Island lifecycle on the scope model

- [ ] 2.0 Red: a fake worker-like boundary registers on the island
      scope; disposing the island with a run in flight closes the
      boundary through the scope and settles the run with the typed
      disposed envelope (observing the app-resource-scopes
      boundary-dispose requirement through the island).
- [ ] 2.1 Green: `mountIsland` creates the island mount's own root
      scope (the add-resource-scopes task 4 seam) and wires the
      handle's `dispose()` to it — disposal ordering, idempotency, and
      fail-safe registration inherited from that capability, not
      reimplemented.
- [ ] 2.2 Red→Green: dispose releases the drawn subtree — the island's
      drawn root leaves the host document, a coalesced frame pending
      at dispose time is discarded (unmount seam precedent,
      `src/spa/mount.ts:176-182`), and no later draw writes into the
      host through the island.
- [ ] 2.3 Red→Green: an intent filed after dispose is reported and
      skipped — no respawn of the fake boundary, no redraw, `status`
      remains `"disposed"` (never the terminate-style lazy respawn).
- [ ] 2.4 Red→Green: page unmount composes — when the island is
      embedded inside a parent tambor mount, unmounting that parent
      disposes the island scope children-first without the island's
      own dispose being called, stopping everything the island started
      (app-resource-scopes' root-scope/unmount composition, cited);
      standalone islands (no parent mount) are covered by the island's
      own root scope from 2.1.

## 3. External-mutation invalidation

Conditional-dependency note for this section: when
add-runtime-invalidation is present, rebuild assertions use its
ChangeSet/identity-reuse seams; when it is absent, every draw is
already a full rebuild, so tests degrade gracefully — assert the
output equals a from-scratch build of the same derived view
(drawCount, plus the intent forcing exactly one draw per the H1
scheduling fix) rather than rebuildCount/identity-reuse deltas. The
requirements still hold trivially; only the observable assertions
change.

- [ ] 3.0 Red: spy backend distinguishes draws from island-subtree
      rebuilds — a host attribute poke inside a live island followed
      by the external-mutation intent makes the next drawn frame
      rebuild the island's whole subtree (rebuildCount increments, no
      identity reuse inside the island for that frame) and the output
      equals a from-scratch build of the same derived view.
- [ ] 3.1 Green: the intent marks the island's next frame as an
      unknown ChangeSet island-locally (riding the
      add-runtime-invalidation publication seam where present; without
      that change the guard is a no-op — every draw is already a full
      rebuild and the requirement holds trivially).
- [ ] 3.2 Red→Green: island-local scoping — a sibling island and the
      surrounding view follow their ordinary identity rules; the
      forced rebuild never extends past the mutated island's boundary.
- [ ] 3.3 Red→Green: N mutation intents filed before the next drawn
      frame coalesce into exactly one island-wide rebuild; normal
      identity rules resume on the frame after.
- [ ] 3.4 Red→Green: no adoption — a forced rebuild builds purely from
      the derived view (foreign writes erased, never absorbed into the
      drawn tree), and the same poke without the intent produces no
      tambor-side repair (identity rules unchanged; the intent is the
      host's obligation).

## 4. Boundary type containment

- [ ] 4.0 Red: type tests (expectTypeOf) — the handle's public
      surface carries only plain data, functions, and host-owned seam
      types; no tambor-internal node types (drawn adapter elements,
      backend records, shim event surfaces) appear in any signature.
- [ ] 4.1 Green: narrow the handle type — the drawn tree is not
      exported on it; host document/element pass through the
      structural seams `src/interop/domhost.ts` already defines.
- [ ] 4.2 Red→Green: runtime containment — a property scan finds no
      drawn-tree write path on the handle and the drawn tree is not
      reachable from it; a counter island driven with only plain data
      plus the host's own document/element seams mounts, renders,
      advances, and disposes.

## 5. Gates

- [ ] 5.1 Full suite green (`just test-full`); `ah check
      --run-tests` green.
- [ ] 5.2 `openspec validate add-host-interoperability --strict`
      exits 0.
- [ ] 5.3 On approval, spec delta deployed to
      `openspec/specs/host-interop/` with every scenario mapped to a
      contract test; `ah check` clean.
