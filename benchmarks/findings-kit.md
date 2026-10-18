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
