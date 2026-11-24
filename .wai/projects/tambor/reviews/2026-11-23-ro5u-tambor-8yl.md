# RO5U Review — tambor-8yl add-host-interoperability (Y8lReview agent)

Verdict: FIX-FIRST (converged, stable by stage 4). 1 Critical, 1 High, 2 Medium, 2 Low. All other line cites verified verbatim; dependency citations (app-resource-scopes root scope, unknown-ChangeSet pin, coalescing pin) valid and non-duplicative; capability name host-interop resolved as deliberate (domain-thing pattern; app- prefix = runtime/rendering family only).

## Critical
- C1: island scope parenting undefined for standalone mountIsland — spec SHALL pins "child of the mount's root scope" unconditionally, but mountIsland's signature carries no parent, the dependency's root-scope requirement is scoped to mountDemo only, and design decision 2 REJECTS fresh-root-per-island (the only shape the standalone audience can use). Task 2.1 unimplementable as written. FIX: option (b) chosen — mountIsland is its own mount (own root scope, island scope nests beneath it); rejection deleted; embedded case re-scoped.

## High
- H1: the external-mutation intent only marks the next drawn frame — paints happen exclusively on dispatches, so on an IDLE island the foreign write stays on screen indefinitely; proposal's "stale output impossible by construction" false for poke-then-notify. FIX: normative scheduling SHALL (intent schedules the next drawn frame through the existing coalescer) + idle-island scenario + proposal claim weakened.

## Medium
- M1: ops-tag normalization claimed on a dispatch path that does raw registry lookup (dispatch.ts:246-251; normalization exists only in interDispatch which no island task wires). FIX: honest doc amendment — plain string tags at the island boundary.
- M2: §3 red→green tests presuppose 1cr observables (rebuildCount/identity reuse) — vacuous if 1cr lands later. FIX: conditional-dependency preamble in §3.

## Low
- L1: mount.ts pending-frame discard cite off by four (:177-179 is the comment; :180-182 the code). FIXED in cite pass.
- L2: island status values never pinned (two scenarios + three tasks assert on them). FIX: pin "live" | "disposed".

## Dependency note (passed to tambor-1cr)
add-runtime-invalidation's spec delta carried a leftover template scenario ("probe heading xyz" + placeholders) — removed by the orchestrator before gate 5.2; strict re-validated exit 0.
