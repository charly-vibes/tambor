# Findings — component performance kit (tambor-54j.8–.11)

Per-ticket profile evidence for the kit tickets. Format follows
findings-bz.md: measured numbers first, verdict, then the adopted/rejected
lever. Benchmarks are reproducible via the named test/spec files.

## H6 — component render cache (tambor-54j.11)

Meter: `tests/component-cache-soak.test.ts` (in-process soak + key-cost;
quiet-machine numbers below, run 2026-10-18).

### Measured

| Probe | Result |
|---|---|
| Bounded-variant soak (1M renders, fresh call objects, props from a 485-distinct-state space) | retained cache entries plateau at **exactly 485**; heap growth **2.3 MB** over the full 1M renders (start 12.8 MB → end 15.1 MB) |
| Hazard probe (props keys never repeat, 50k renders) | entries grow **linearly** (50k entries retained) until any component redefinition resets the whole cache to 0 (`render_cached` reset is the existing bound) |
| Key cost (cache-hit path = canonical serialization of the props map + two Map lookups) | **~4.6–5.1 µs/op** for a tiny 2-prop component |
| Unserializable props (function values) | canonical() returns null → render bypasses the cache entirely (resolve called every time; no retention) |

### Verdict

- **Eviction policy: none needed, with evidence** — in the realistic
  long-session regime an app's distinct rendered props maps are bounded by
  its state cardinality, and the soak shows the cache retains exactly that
  many entries with flat heap. Clear-on-redefine (corpus-specified,
  `render_cached`) remains the reset path.
- **Hazard documented, not fixed**: apps whose props embed ever-changing
  values (timestamps, monotonic counters) grow the cache linearly. The
  recorded trigger condition for a future per-name LRU cap: a real app
  profile showing unbounded distinct keys in a long session. Until then a
  cap would be machinery without a measured need (same bar as the BZ4/BZ6
  rejections).
- **Key-cost finding (programme-level)**: ~5 µs/op means the render cache
  only pays off when re-resolving a component body costs more than ~5 µs —
  cheap bodies are net-negative to cache (serialization + lookup exceeds
  the resolve). Relevant to 54j.8's memo kit design: memo boundaries should
  sit above expensive derives, not around trivial renders.

### Test shape notes

- `renderCacheStats()` was added to `src/model/component-cache.ts` as a
  diagnostic introspection seam — that file sits outside the public barrel
  (`src/index.ts`), so no app-facing API changed.
- Heap is asserted with a 64 MB leak guard rather than a tight bound:
  without `--expose-gc` the sampled heap includes uncollected garbage and
  parallel-worker jitter. The deterministic flatness proof is the entry
  plateau; a real leak (unbounded retention) would retain hundreds of MB
  and trip the guard.

## I12 — spatial hit-test index (tambor-54j.10)

Meter: `tests/spatial-index.test.ts` (equivalence property + move
maintenance property + the named pointer-move meter), component at
`src/model/spatial-index.ts`. Run 2026-10-18, quiet machine.

### Measured

| Probe | Result |
|---|---|
| Pointer-move meter, 10k-shape scene (100×100 grid of overlapping 14×14 rects), bucket query | median **2.4 µs**, p90 **2.4 µs** — the recorded 2 ms bound has ~830× headroom |
| Same queries, linear reverse walk reference | O(n) per query by construction (the baseline the index removes; hitLinearRef kept as the equivalence oracle) |
| Equivalence property (fast-check, 200 runs × ≤40 points) | hitAt == hitLinearRef on every point, including boundary/half-open edges and no-hit cases |
| Move-maintenance property (60 runs, up to 5 moves, 36-point sweep each) | index == fresh linear walk of the moved scene after re-registration |

### Verdict

- **Adopted as a reusable internal accelerator** (`src/model/spatial-index.ts`):
  grid buckets + original-position topmost rule, byte-identical to the
  dispatch walk's reverse-scan-first semantics ("last containing wins" =
  "greatest original position" — the generalization of whiteboard's
  max-id rule to arbitrary item order). Half-open containment
  (hit_half_open) preserved and pinned.
- **Router wiring deliberately NOT done** (same verdict as BZ3 wave 3):
  the shared ~300 ms click-wire/derive floor dominates at 10k, and the
  dispatch tree is a translated element tree, not a flat scene — wiring
  the index under `dispatchGroup` changes the hot path every app pays
  for. Recorded trigger condition: a real app profile where linear
  pointer-move over the drawn tree is the visible bottleneck (i.e. after
  tambor-8xm drops the wire floor). The BZ3 whiteboard keeps its
  app-local index (whiteboard-index.ts), which this component now
  generalizes; app-local copies may migrate to it opportunistically.
- Item contract: items carry their own bbox geometry (rectangles only,
  anti-goal honored); moves re-register through `hitIndexMove`, which
  preserves the item's original position so the topmost rule never
  changes under moves.

## B9 — reactive notebook (tambor-54j.9)

Meter: `tests/e2e/bench-apps.bench.ts` scenario `notebook-chain-200`
(declared in `tests/e2e/bench-scenarios.ts`), raw JSON at
`benchmarks/results/notebook-chain-200.json`. App:
`src/examples/notebook/` (core `notebook-core.ts` + `notebook-eval.ts`,
killable Worker boundary `worker-main.ts`/`worker.ts`/
`worker-client.ts`, demo `notebook.ts`/`notebook-state.ts`/
`notebook-view.ts`), contracts `tests/notebook-core.test.ts` (21),
`tests/notebook-worker.test.ts` (6), `tests/notebook-app.test.ts` (20),
fault paths `tests/e2e/notebook.spec.ts` (4 behaviors × desktop/380px).
Run 2026-10-18, chrome 156.0.8078.4, commit 5500ae3.

### Measured

| Probe | Result |
|---|---|
| Incremental re-run count (contract, `tests/notebook-core.test.ts`) | slider move on the 8-cell demo re-runs **3** (slider, dependent, its plot); the freq slider re-runs **6** — untouched values reused **by identity** (`out[2] === full.out[2]`) |
| Full vs incremental ran on the 209-cell notebook | full run **209/209**; every chain-slider move in incremental mode **ran 201/209** (the bench's `expectedText` misroute guard) |
| 200-cell chain slider→paint, CPU ×4 | median **814.7 ms**, p25/p75 767.3/861.0, p90 906.0 (n=180; todo-add floor on the same run: 83.3 ms) |
| 200k-point budget (in-process) | `linspace(0, 6.283, 200000)` + `sum(sin(xs * 3))` well under the 2 s contract bound (~tens of ms unthrottled) |
| Worker kill (node worker_threads + browser e2e) | a 201-cell/1M-point-array run spins off-thread with **no reply and no main-thread block**; `terminate()` stops it mid-flight with **no late reply**; the killed run reports the typed `killed` error per cell and the notebook stays usable — the next run **respawns** the worker and the full pass re-evaluates the killed cells (previously-errored re-run), recovering all values |

### Reading

- The 815 ms/op median is dominated by the **honest whole-view
  redraw**: every op re-derives and re-draws all 209 cards (~1.5k drawn
  nodes) on top of the 201-cell Worker round trip — the todo-add floor
  on the same machine/run is 83 ms, so the notebook's per-op cost is
  ~10× the empty-app floor at 209 cards. That is the B9 point: the
  EXECUTION is incremental (201 of 209 cells, identity-preserved
  values), the DRAW is whole-view — the same derive-everything shape
  the form-200 row measures, now with a dependency-graph execution
  under it.
- The kill switch is a round trip, not end-of-life: `kill()`
  terminates, resolves in-flight runs as the typed killed failure, and
  the next run lazily respawns a fresh Worker (the Logo boundary's
  one-way stop extended for a notebook that must stay editable).
- Harness note: the scenario clicks ride the drawn-DOM ground truth
  (`drawnOps` + a new `drawnSetup` field, the tambor-54j.17 SIDE BAND
  mechanism) — the demo's title/stats labels replay at unit measure
  above the control row, so view-space points land off the drawn
  buttons.

### Test shape notes

- The identity-reuse merge lives in `applyRunReply`
  (`notebook.ts`): a Worker reply merges **by `touched`** (the
  core's not-reused set), so the main thread keeps the previous entry
  OBJECTS for untouched cells even though the boundary clones every
  reply — the app-level half of the incremental contract.
- Textarea editing intents route through the per-app handler via
  `applyTextareaIntents` (the todo/new-todo wire leaves `insert-text`
  unapplied on the makeApp path — the recorded typing finding); text
  changes mark the cell dirty and launch, cursor moves launch nothing.
