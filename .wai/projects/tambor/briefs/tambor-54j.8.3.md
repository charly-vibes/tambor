# Lane brief: tambor-54j.8.3 — Perf kit: canvas layer taking data by reference

You are a lane agent implementing this ticket in a dedicated worktree.
**Never touch `bd`** (the orchestrator has already claimed the ticket).
**Never push.** Commit incrementally in your worktree; the orchestrator
merges and runs the full gates.

## Ticket

I17 child (2/5). Failing-before evidence (BZ2, `benchmarks/findings-bz.md`
§BZ2): 1600 drawn path nodes/op → 606ms pan-op vs 400 nodes → 183ms
(3.3× cost per 4× nodes); decimation was adopted as the interim,
canvas-layer-by-reference deferred to the §4.8 canvas seam. Membrane
precedent: opt-in backend `Cached` image wrapper (skia.clj:1584-1635,
cold-read §3.2 — see `insights/membrane.md`) = analog seam.

**Acceptance:**
- public canvas-layer component (state holds data by reference,
  drawn-tree derivation skipped for the wrapped subtree)
- a bench with >10k drawn primitives passes after vs fails before
- corpus contracts in the public API surface (openspec spec + `.espectacular`
  contracts + wired vitest tests)

## Read first (in order, skim — do not dump)

1. `src/components/virtual_list/` — canonical recent public-component shape
2. `openspec/specs/components-virtual_list/spec.md` and
   `openspec/specs/components-memo/spec.md` — the dual-format spec shape
   (frontmatter intent + Constraints/Model tables). Copy the shape, not the content.
3. `tests/bench-virtual-list.test.ts` + `tests/components-memo.test.ts` —
   test/contract wiring shape
4. `benchmarks/findings-kit.md` — where prior perf-kit children recorded
   verdicts (add your own section)
5. `tests/e2e/bench-scenarios-shared.ts` (+ `-bz.ts`) — scenario registry
   shape if you add an e2e scenario
6. BZ2 app for comparison: `src/examples/bench/plot-points.ts`

## Design guidance

- Component name/location: `src/components/canvas_layer/` (pick the cleanest
  seam name; keep it cohesive and small — script-role pretender budget is
  cyc ≤ 10, ≤ 300 lines per file; split early rather than trimming).
- Semantics: an opt-in wrapper that takes the big data by reference and
  draws it through a raster/cache path so the drawn-tree derivation is
  skipped for that subtree. The wrapper's *state* holds the data by
  reference (no per-op immutable copy) and re-derives only on an explicit
  invalidation (reference change), mirroring the memo identity rule.
- It does NOT replace decimation in the BZ2 app; it is a public seam that
  the plots app (or any app) could adopt. Prove it with a bench.
- Bench: prefer a unit-level or e2e bench scenario that builds >10k drawn
  primitives and shows the fails-before/passes-after delta (paired, same
  machine state). Record honest numbers + a verdict section in
  `benchmarks/findings-kit.md` (follow the existing section format).
- If the seam requires a small backend capability (e.g. an image/raster
  primitive), keep the core DOM-free and follow the domsim/domhost
  structural-interface precedent (`src/interop/domhost.ts`); do not reach
  for lib.dom in core.

## Spec + contracts flow

1. Author `openspec/specs/components-canvas_layer/spec.md` (dual-format,
   frontmatter `id: components.canvas_layer`, intent statement with SHALL,
   Constraints table, Model with States + Transitions — every transition
   carries a guard; lint with `spk lint openspec/specs`).
2. `ah sync` to derive contracts into `.espectacular/components-canvas_layer/`.
3. Wire vitest tests named to the contract ids; `ah check` must be clean
   (`ah check --run-tests` is the orchestrator's pre-push gate).
4. Update `docs` coverage stamps if the bundle surface changes: run
   `bash tools/stamp-docs.sh` if any `src/` change alters the bundle.

## Working discipline

- Commit incrementally (model+tests → bench+findings → spec+contracts) —
  crash-resilient shape; each commit coherent.
- Vitest is your local gate: `npx vitest run tests/<your files>`.
- Do NOT run the full pre-push suite or lefthook (not wired in the worktree);
  orchestrator handles gates.
- **Progress file (important):** append a one-line note to `progress.md`
  at the worktree root after each meaningful step (small, frequent writes
  keep the session alive). e.g. `read pattern files`, `component drafted`,
  `tests green`, `spec authored`, `contracts synced`.
- If a step fails twice, move on to the next coherent piece and note it in
  progress.md — do not stall.
- Final report: ≤ 20 lines — what landed, commit hashes, measured numbers,
  corpus/contract counts, any residuals.
