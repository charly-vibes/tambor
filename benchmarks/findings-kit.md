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

## H7 — virtual list (tambor-54j.8.2)

Meter: `tests/e2e/bench-apps.bench.ts` scenarios `virt-list-10k-whole`
(failing-before) and `virt-list-10k-window` (after), declared in
`tests/e2e/bench-scenarios.ts`, raw JSON at `benchmarks/results/`.
App: `src/examples/bench/virtual-list.ts` (10k rows derived from the
index — the state is the summary triple count + offset + mode; the row
stream is never materialised). Component:
`src/components/virtual_list/` (barrel `index.ts`, pure geometry
`geometry.ts`, component `virtual_list.ts` composed over the
scrollview assembly), public contracts
`tests/components-virtual_list-geometry.test.ts` (6) +
`tests/components-virtual_list-render.test.ts` (2) — fast-check
properties over an independent O(count) intersection oracle, one per
spec row of `openspec/specs/components-virtual_list/spec.md` — and
bench-app contracts `tests/bench-virtual-list.test.ts` (7: window-vs-
whole draw parity, readout pins, summary-only state, dispatcher wire).
Whole-view baseline run 2026-10-19 (commit b0de073, the 54j.8.2 meter
first-commit), windowed + HEAD re-run 2026-10-19 (commit d7d5b19),
chrome 156.0.8078.4, CPU ×4 via `Emulation.setCPUThrottlingRate`,
n=180 (15 runs × 12 ops) per scenario. Machine: loader-cpu-throttled
Chromium; the todo-add floor rode both runs as the load control.

### Measured

| Probe | Result |
|---|---|
| 10k-row list, +1-row scroll op, whole-view redraw (failing-before) | median **1233.4 ms**, p25/p75 1148.6/1355.9, p90 1573.9 (n=180, commit d7d5b19; the original b0de073 baseline: median **1274.6 ms**, p90 1604.9 — the offset-units refactor to pixels left the draw work identical, parity confirmed) |
| 10k-row list, the same +1-row op, windowed through `components.virtual_list` (after) | median **50.0 ms**, p25/p75 49.7/50.3, p90 50.5 (n=180, commit d7d5b19) |
| Win ratio | **24.7×** the whole-view median; p90 31× |
| Floor check | todo-add on the same run: 50.4 ms median (first run) / 66.6 ms (second, different machine load) — the windowed op sits **at the empty-app floor**: the scroll itself is now free; the residual cost is the click→dispatch→repaint frame |
| Op-contract guard | `expectedText` "window from 13 at 13" passed on every run — the window really slid 13 rows (both readout lines are ratios of the row pitch, so they are metric-independent); whole-view's "drawn 10000" guard unchanged |
| Windowing is real (drawn DOM) | whole-view draws 10 000 row labels per op (`expectedDrawn: 10000`); windowed draws only the visible window (in-process default metrics ~133 rows, bundle real metrics ~20) — the vitest parity contracts pin the windowed indices as a contiguous slice of the whole stream's positions, each at its arithmetic offset |
| Offsets = pure fn of data + bounds | `rowOffset` / `contentExtent` / `windowFor` are closed-form arithmetic over declared row height + gap — no DOM measurement consulted (`offsets_arithmetic`, property-tested against the independent oracle) |
| Windowed state | the summary record only — count, step, extent, offset, half-open window — never the item stream (`count_summary_state`, shape-tested: numeric fields only) |

### Verdict

PASS — the acceptance is a benchmark that failed before and passes
after: 1274.6 → 50.0 ms median on the identical +1-row op, 10k rows,
CPU ×4. The windowed mode's per-op cost is the empty-app floor, so
windowing (not some cheaper repaint) is what pays: the op still
re-derives the whole view's state (one offset update), but the drawn
tree is the ~20-row window instead of the 10k-row stream. This is the
tambor-superiority lever over membrane (virtualisation ABSENT in
membrane's UI layer, scrollview clip-only — cold-read §3.2 M9) now
landed as a PUBLIC component with contracts, not a bench-only trick.

Adopted levers:

- **Fixed row pitch arithmetic** — offsets are `i * (row-height +
  gap)`; window bounds are closed-form over the offset. No DOM
  measuring anywhere in the draw path. This is what makes the window a
  pure function of data + bounds and the per-op work O(window).
- **Component composition over the scrollview assembly** — the
  virtual-list reuses the scrollview's clip gate, wheel rule, range
  formula and scrollbar with the total set to `[viewport width,
  extent]` (~40 lines of view code over tested machinery; the range/wheel
  contract rows cite the scrollview rows directly).
- **Extents as summaries** — an extent-sized spacer carries the scroll
  range so the scrollbar/clip math never needs the item stream.
- **Metric-independent readout guards** — the bench's expectedText is
  derived from ratios of the row pitch (first window index, offset in
  rows), so the op-contract guard survives the replay-vs-bundle text
  metric divergence that forced `drawnSetup` elsewhere.

Rejected levers:

- **Row-height DOM measurement** — the obvious "measure one row then
  multiply" needs a mounted row before first paint and re-measures on
  font changes; the declared-pitch contract covers the kit's fixed-row
  cases and keeps the geometry pure. Variable-row-height virtualisation
  is explicitly out of scope (would reintroduce measurement).
- **Canvas-level row culling** (draw only visible rows inside one big
  translate) — rejected: it hides the windowing inside the renderer
  instead of a public component, and the drawn DOM would still carry
  the 10k nodes for the event layer.
- **Overscan by default** — the component supports `overscan` (contract
  tested: pads ±N clamped, reaches the tail past the end) but the bench
  runs overscan 0 so the window bounds stay exactly the visible rows
  (keeps the readout's `from` guard == the scrolled row).
- **Keeping the raw stream in state with a drawn-index map** — rejected
  outright: the acceptance requires summaries only; the app stores
  count/offset/mode and pulls rows per index through the `row` renderer.

Residuals / follow-up candidates:

- Variable row heights (measured once, cached per range) — the natural
  `.3` follow-up; needs a measure boundary that is not per-op DOM.
- Horizontal windowing (columns) for grids — the component is a list;
  a grid variant would window both axes over the same geometry.
- The notebook-chain-200 card stack (B9, 814.7 ms median) is the next
  candidate consumer: its whole-view redraw is the same shape at 209
  heterogeneous cards.
