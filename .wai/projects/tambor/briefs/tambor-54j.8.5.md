# Lane brief: tambor-54j.8.5 — Perf kit: ring-buffer bounded series store (public component)

You are a lane agent implementing this ticket in a dedicated worktree.
**Never touch `bd`** (the orchestrator has already claimed the ticket).
**Never push.** Commit incrementally in your worktree; the orchestrator
merges and runs the full gates.

## Ticket

I17 child (4/5). Failing-before evidence (BZ5, `benchmarks/findings-bz.md`
§BZ5): naive per-line ingest climbs ~+70ms/1000 lines vs flat 83ms
ring-buffer append; the BZ5 lane proved the pattern inside the bench app
(`src/examples/bench/log-stream.ts` — `ringAppendOp`) but no public
component exists.

**Acceptance:**
- public bounded-series component with contracts (capacity, append O(1)
  amortized, window fold)
- BZ5 ingest scenario passes with the public component as with the inline
  pattern

## Read first (in order, skim — do not dump)

1. `src/examples/bench/log-stream.ts` — the proven inline ring-buffer
   pattern you are promoting to a public component
2. `openspec/specs/components-memo/spec.md` and
   `openspec/specs/components-virtual_list/spec.md` — dual-format spec
   shape (frontmatter intent + Constraints/Model tables). Copy the shape,
   not the content.
3. `src/components/memo/memo.ts` + `tests/components-memo.test.ts` —
   recent component + test wiring shape
4. `benchmarks/findings-kit.md` — verdict-section format (add your own §)
5. `tests/e2e/bench-scenarios-shared.ts` (+ `-bz.ts`) — scenario registry
   shape if you add/repin a scenario

## Design guidance

- Component name/location: `src/components/ring_buffer/` (or a cleaner
  seam name — e.g. a bounded-series store). Keep files cohesive and small:
  script-role pretender budget is cyc ≤ 10, ≤ 300 lines/file; split early.
- Semantics: fixed-capacity FIFO of items with drop-oldest; append is O(1)
  amortized and allocation-bounded (no immutable copy of the whole corpus
  per append — this is exactly what BZ5 measured); expose a window fold /
  newest-n view for rendering. Follow the corpus's immutable-view +
  summary-state discipline: app state stays immutable at the slice
  boundary; the buffer's internal ring is the bounded store.
- Think carefully about how a bounded, mutating store fits the corpus
  state model (state changes only through dispatch; structural sharing).
  If a pure ring-in-state (slice) implementation already meets the O(1)
  amortized bound with bounded allocation, prefer it — do not add
  mutability the corpus does not have without a strong reason, and record
  the decision either way in the spec prose.
- Bench: re-run or adapt the BZ5 ingest scenario with the public
  component and confirm parity with the inline pattern; record honest
  numbers + verdict section in `benchmarks/findings-kit.md`.

## Spec + contracts flow

1. Author `openspec/specs/components-ring_buffer/spec.md` (dual-format,
   frontmatter `id: components.ring_buffer`, intent statement with SHALL,
   Constraints table, Model with States + Transitions — every transition
   carries a guard; lint with `spk lint openspec/specs`).
2. `ah sync` to derive contracts into `.espectacular/components-ring_buffer/`.
3. Wire vitest tests named to the contract ids; `ah check` must be clean
   (`ah check --run-tests` is the orchestrator's pre-push gate).
4. Run `bash tools/stamp-docs.sh` only if the bundle surface changed
   (orchestrator re-stamps at merge anyway).

## Working discipline

- Commit incrementally (model+tests → bench+findings → spec+contracts) —
  crash-resilient shape; each commit coherent.
- Vitest is your local gate: `npx vitest run tests/<your files>`.
- Do NOT run the full pre-push suite or lefthook (not wired in the
  worktree); orchestrator handles gates.
- **Progress file (important):** append a one-line note to `progress.md`
  at the worktree root after each meaningful step (small, frequent writes
  keep the session alive).
- If a step fails twice, move on to the next coherent piece and note it in
  progress.md — do not stall.
- Final report: ≤ 20 lines — what landed, commit hashes, measured numbers,
  corpus/contract counts, any residuals.
