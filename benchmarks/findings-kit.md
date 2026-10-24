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

- **Eviction policy: per-name LRU cap ADOPTED (tambor-4r7, 2026-10-24)** —
  the original 54j.11 verdict deferred the cap until a real app profile
  showed unbounded distinct keys; tambor-4r7 re-opened the decision and the
  cap landed because the hazard probe itself demonstrates the unbounded
  regime is reachable (any app embedding a timestamp/counter in props grows
  the cache linearly), and the cap is a ~10-line Map-order policy with no
  key-cost regression. Cap = `RENDER_CACHE_MAX_ENTRIES` (1024) per
  component name, bump-on-hit + evict-oldest (Map insertion order), in
  `src/model/component-cache.ts`. The cap sits far above the realistic
  long-session working set (soak plateau 485), so the bounded regime is
  unaffected; clear-on-redefine (corpus-specified, `render_cached`)
  remains the full reset path. Property pinned: `tests/component-cache-soak.test.ts`
  fast-check churn generator — retained entries never exceed the cap
  under a never-repeating-props generator; the hazard probe now asserts
  the bound (was: asserted the linear growth as the existing bound).
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
- **Post-merge contract edge (2026-10-19, orchestrator)**: the pre-push
  `p-drawn` contract flaked (~25% solo) — an intersect-then-pad oracle
  NaNs when the intersection is EMPTY (viewport inside a row gap or
  boundary-aligned: `expected[0]` on `[]`). The component's pad-around-gap
  behavior is spec-compliant (`empty_window_zero` scopes to degenerate
  inputs; `overscan_pads_window` pins the pad), so the fix is the oracle:
  an interval scan (rows whose start sits in the viewport interval widened
  by one pitch per pad row — `intervalWindow` helper), exact in all three
  regimes. Corpus sharpened with the `overscan_pads_empty` invariant +
  `p_gap_pad` property; the flake only bites when raw `row-height` 0
  makes the test's oy transform land in a gap with `vh` fitting inside
  it — rare enough to pass ~2000 hunts, common enough to block a push.
## J8 — subtree memo above expensive derives (tambor-54j.8.4)

Meters: `tests/memo-keyed-table.test.ts` (paired in-process meter, both
arms in one run — the paired ratio cancels machine load) and the
`keyed-table-ops` browser scenario (`benchmarks/run.mjs --scenario
keyed-table-ops`), stash/unstash paired at HEAD `e2ef981` (the memo
stashed for the before-run). Component: `src/components/memo/memo.ts`,
public through the interop barrel; corpus
`openspec/specs/components-memo/spec.md` (7 contracts).

### Measured

| Meter | before | after | delta |
|---|---|---|---|
| In-process paired meter (derive + sim-DOM draw per op, keyed-table op cycle, seed 1000 rows) | 6.8–8.5 ms/op | 5.3 ms/op | **ratio 0.63–0.78 (−22–37%)**, stable across three runs on different load states. **Meter honesty note (2026-10-19, CI run 39282222146 post-mortem):** that ratio came from the original *sequential* two-arm meter, which post-hoc analysis showed biases whole arms (arm-order/JIT warmth: CI-shaped 2-core runs measured 0.77–1.00) and never reseeded state (appendRows grew the table 1000→~9700 across samples, diluting the win toward the draw floor, ratio ~1.0). The meter now interleaves arms and reseeds per sample; its steady-state ratio is environment-dependent (~0.5–0.7 quiet, ~1.0 loaded) and is printed unasserted. The *asserted* tripwire is the deterministic fresh-identity derive count (replace 100 / swap 0 / remove 0 / append 1000) — machine-independent, and the win the corpus contract (`p_identity_hit`) already pins at unit scale. The −22–37% claim above should be read as quiet-machine evidence, not a guaranteed floor |
| Browser `keyed-table-ops` (back-to-back stash pair, same load — todo-add floor 66.26 / 66.13 ms) | 216.40 ms | 216.66 ms | **unchanged** (within noise; the floor check says the load was identical, so this is a real null, not a load artifact) |
| `keyed-table-build` after memo (drawn-output guard, expectedDrawn 1000) | — | passes | drawn DOM unchanged by memo |

Boundary evidence carried in: the render-cache key-cost finding
(54j.11) put the cache-hit path at ~4.6–5.1 µs/op, so memo only pays
when the body resolve costs more than the key — the memo key here is
one WeakMap lookup (~0.1 µs), and the boundary sits above the per-row
label derive, not above trivial renders elsewhere.

### Verdict

- **Adopted as the public memo component** (`memo(build)` — one
  memoized renderer per call site, WeakMap keyed on the key object's
  identity). The keyed-table demo maps its row labels through it: the
  ops preserve the identity of every row they don't touch, so the
  whole-view re-derive after an op rebuilds only the changed rows.
- **The browser scenario's median does NOT move, and the findings
  record says so plainly**: at 1000–4000 drawn rows the per-op cost is
  dominated by the DOM draw/layout floor (the same derive-vs-draw
  split B9 recorded), which memo does not touch. The measurable win is
  on the derive stage — the in-process paired meter isolates it and
  pins the ratio. This is the honest reading of 8xm's open memo item:
  component-level memo recovers the derivation half of the whole-view
  re-derive cost; the draw floor is a separate lever.
- **Identity/equality semantics are the corpus contract**
  (openspec/specs/components-memo/spec.md): identity-keyed, object keys
  only (primitives rejected with a TypeError rather than silently
  deep-equalled — deep equality is the ~5 µs serialization key the
  render cache already pays), and identity is a *sound* invalidation
  signal for the same reason 8xm's route-time cache is: state changes
  only through dispatch — including cell-writeback closures, which
  write back through the registry-aware dispatcher — and every
  dispatch produces fresh identity for changed slices with structural
  sharing preserving unchanged ones. The writeback interaction is
  pinned by contract (`p_writeback`): a cached subtree's handler
  closures keep routing through dispatch and survive sibling state
  changes.
- Anti-goal held: no memo semantics that break cell-writeback/closure
  semantics (the closure contract test exercises exactly that path),
  and no benchmark rigging — the null browser result is recorded
  alongside the positive meter rather than massaged.

## K3 — canvas layer taking data by reference (tambor-54j.8.3)

Meter: `tests/canvas-layer-bench.test.ts` (paired in-process meter,
interleaved arms, fresh seed per sample — the J8 meter honesty rules
apply) plus the deterministic tripwires in the same file. Component:
`src/components/canvas_layer/` (layer factory + DOM-free raster seam),
public through the interop barrel; corpus
`openspec/specs/components-canvas_layer/spec.md` (7 contracts, wired
vitest patterns in `.espectacular/components-canvas_layer/`).

### Measured

| Meter | before | after | delta |
|---|---|---|---|
| Paired meter, 12-op pan cycle over 12k drawn path primitives (one per point, BZ2 band-chart shape), 3 interleaved samples | quiet machine (first runs): naive 19.5–23.2 ms/op, layered 3.7–4.5 ms/op — **ratio 0.16–0.19 (5–6×), stable across four runs**. Loaded machine (same session, other lanes building — both arms inflate): naive 26.5–28 ms/op, layered 17–18 ms/op — ratio 0.64–0.66. The layer's per-op cost is ONE 11.5 MB drawImage (memory-bandwidth bound — it degrades most under contention); the naive arm's is 12k derives + 12k painter dispatches (CPU-bound) | |
| Drawn-node budget (deterministic, machine-independent) | naive per-op view carries **12 002 drawn primitives** (>10k — the fails-before wire, the BZ2 scaling law) | layered per-op view carries **exactly 1 image node** | the acceptance floor |
| Draw-once (deterministic) | chartBody invoked **once per op** unlayered | invoked **exactly once across the whole 12-op cycle** layered (the raster object is identical across the cycle) | the identity rule at bench scale |
| Drawn-output parity (deterministic) | — | the cached raster equals a fresh rasterization of the same subtree (pixel-equal) | drawn DOM unchanged by the layer |
| Load op (fresh data reference) | — | one re-derive + re-rasterize, then cached | the invalidation cost is paid exactly once per reference |

### Verdict

- **Adopted as the public canvas-layer component** — the §4.8 canvas
  seam candidate the BZ2 lane pointed at and rejected for scope: an
  opt-in wrapper whose state holds the big data BY REFERENCE, drawn
  through a raster/cache path so the drawn-tree derivation is skipped
  for that subtree. API mirrors memo (`memo(build)` →
  `canvasLayer({width, height, draw})` returns a render function called
  per derive with the data object; one WeakMap per layer keyed on the
  data reference). It does NOT replace decimation in the BZ2 app — it is
  the public seam the plots app (or any app) can adopt.
- **The win is the per-op drawn work, asserted deterministically**: the
  failing-before arm re-derives >10k drawn primitives and re-paints them
  every op; the pass-after arm derives one image node and replays one
  raster (backend drawImage). The wall-clock paired ratio (0.16–0.19
  quiet, 0.64–0.66 loaded — see the table) is recorded, not asserted —
  the J8 lesson (meter honesty note) holds: machine-independent
  tripwires carry the claim, the ratio is context. The loaded-regime
  degradation is itself informative: the layer's per-op cost is one
  buffer copy, so it is the arm a memory-bandwidth-starved machine
  hurts most — on a loaded host the deterministic drawn-node budget,
  not the wall clock, is what the adoption case rests on.
- **Raster replay is honest about what it costs**: the first derive of a
  data reference pays one subtree derivation + rasterization (the same
  primitive_set traversal the backend's draw performs, ~33 ms at 12k
  paths) — a data-invalidating op (load) pays it once, and a pan/zoom
  op never does. The pan translate sits OUTSIDE the layer, so the drawn
  pixels still move while the raster replays — no benchmark rigging.
- **Two structural findings landed with the component**:
  1. **The resolver leaf rule** (`src/model/component.ts`): the
     component-model resolver treated typed arrays (ArrayBuffer views)
     as plain containers — walking an ImageBuffer's 2.88M index entries
     exploded to ~4.3 GB and seconds per derive the moment a raster
     buffer flowed through a component body. Typed arrays are now leaf
     values (`isContainer` guard); contract-pinned by the component-wire
     test in `tests/components-canvas_layer.test.ts`.
  2. **Never `expect(buffer).toBe(other)`**: vitest's toBe machinery on
     two ImageBuffer objects takes **~56 s** (11.5 MB buffer) even on a
     PASSING assertion. Reference identity must be asserted via a
     boolean (`expect(a === b).toBe(true)`) — the bench tests note this
     inline.
- **Why the layer is a function, not a defui component call** (the memo
  precedent): a defui call routes its props through the render cache's
  canonical serialization key — measured 40 ms/op with a 12k-point
  array in props — which would re-pay the serialization cost the seam
  exists to remove, every op. The WeakMap hit is one lookup.
- **Backend seam precedent**: the DOM-free raster seam reuses the
  backend's own painters (canvas-painters PAINTERS dispatch + headless
  Painter into ImageBuffer), mirroring the membrane `Cached` image
  wrapper (skia.clj:1584-1635, insights/membrane.md §3.2) — the
  rasterization target is the module's own buffer, no window, no DOM.
- Anti-goal held: the layer is opt-in and does not touch decimation or
  the BZ2 app's built mode; no benchmark-specific fast paths (the bench
  app drives its pan op through the ordinary dispatcher wire, pinned by
  a contract test).

## RB — bounded-series ring-buffer store (tambor-54j.8.5)

The public promotion of the BZ5 candidate: `src/components/ring_buffer/
ring_buffer.ts` (`boundedSeries` / `appendSeries` / `newestSeries` /
`foldSeries`), corpus `openspec/specs/components-ring_buffer/spec.md`
(7 contracts), public through the interop barrel alongside memo. The
BZ5 log-stream demo's ring arm now rides the component (state slice
`BoundedSeries<LogLine>`, append = `appendSeries`, drawn window =
`newestSeries`, kept-histogram and ring search = window folds).

### Measured

Paired browser runs, same machine ~1 h apart, cpu ×4, Chrome
156.0.8078.4, production bundle (`benchmarks/run.mjs --scenario
log-stream-ring-append`, 15 runs × 12 ops + todo-add floor each run):

| arm | commit | median | p90 | todo-add floor |
|---|---|---|---|---|
| inline slice pattern (`[...ring, ...batch].slice`, the BZ5 lane's proven op) | `21cd520` | 66.20 ms | 67.24 ms | 66.63 ms |
| public component (`appendSeries`, O(1) amortized) | `54ec059` | **50.33 ms** | 67.19 ms | 66.71 ms |

Parity holds and then some: the component arm's median is at the same
draw floor as the inline pattern (both arms sit on the todo-add
floor ~66–67 ms — the per-op cost is the view re-derive + DOM write +
paint of the fixed 300×300 surface, not the ingest), and the component
arm's median landed 16 ms *below* the inline baseline because
`appendSeries` pays O(batch) consing instead of the slice's
O(capacity) window copy. Both arms leave the identical drawn state
(`"kept 2000"` guard). Honest caveats: single paired pair, not 3×
repeats; the historical 83 ms (findings-bz §BZ5) was a different
machine/load — today's floor is ~66 ms, so both arms are floor-bound
and the ingest difference shows up as p25 (49.91 vs 50.36, both
sub-floor in the fast tail) rather than a large median gap.

Separately noted: `log-stream-search` failed its expectedText guard on
BOTH arms under today's load (verified at `21cd520` before blaming the
change) — 13 ingest-then-search ops ≈ 5 s of measured work against the
spec's 5 s `toContainText` timeout. Pre-existing marginality, not a
regression of this lane; left for the orchestrator to schedule (slower
expect timeout or fewer ops).

## WE — public worker effect (tambor-54j.8.6)

The public promotion of the logo/notebook worker boundary precedent:
`src/components/worker_effect/` (`envelope.ts` typed plain-data envelope
+ pure `runWorkerEffect`, `client.ts` WorkerLike-seam client with the
optional terminate and lazy respawn, `effect.ts` the effect-dispatch
bridge), corpus `openspec/specs/components-worker_effect/spec.md`
(8 contracts), public through the interop barrel. The scope decision
(BZ6) is followed exactly: no kill-switch-as-universal-mechanism — the
only stop is the one optional `terminate()` on the client's own spawned
worker (in-flight runs resolve as the typed terminated failure, the next
run lazily respawns); typed result/error effects are in, spawn/reply/
error shapes are plain effect data
(`["worker-effect", handler, input]` → `["worker-effect-reply", id,
value]` / `["worker-effect-error", id, message]`).

### Measured

The responsiveness contract, verified against a real Worker (node
worker_threads against the esbuild-built harness,
`tests/components-worker_effect.test.ts` p_wire): the same 1000 ms
busy-loop, three runs each, main-wire 5 ms timer probes measuring the
worst requested-vs-actual firing drift (5 ms requested):

| arm | worst timer drift over the spin |
|---|---|
| blocking equivalent (same burn in-thread) | 996 ms ×3 |
| worker effect (same spin off-thread) | 1 ms ×3 |

The blocked run's drift covers ~the compute's whole duration (the wire
stalls); the off-thread run's drift stays at timer-jitter scale — three
orders of magnitude under — and the wire serves further requests during
and after the spin (the test also asserts the reply's value lands and a
second request answers). The test asserts the shape, not the exact
numbers: in-thread drift ≥ 0.5× the compute, off-thread < 150 ms, and
off-thread ×5 under the blocked run.

### Verdict

The worker boundary pays its way exactly where the B9 finding located it
(findings-kit §B9): the cost is the serialization of the envelope, and
the win is that nothing on the main wire feels a runaway compute. Honest
caveats: single-machine node worker_threads runs (3× each arm), not a
browser measurement — the browser Worker gets the same structure
(structural WorkerLike seam, no lib.dom), but the absolute jitter
numbers will differ; the 1 ms drift is node timer-jitter scale, so the
contract asserts the two-orders-of-magnitude separation, not a specific
value. Scope honesty: terminate is optional and end-of-the-boundary only
— no universal kill-switch (BZ6 rejected that), and the in-thread
fallback covers every host without a Worker at the same typed contract.
