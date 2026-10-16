# Benchmarks & findings — a cold read (prov style)

*Standalone: you need no prior context. Every section ends with a **Provenance** block saying which activities produced it, which entities it rests on, and how strong the evidence is.*

**Evidence grades** — **O** observed in a file/page · **T** tested (run here, result seen) · **D** derived/synthesised by the assistant · **U** unverified.
IDs refer to [`../prov/`](../prov/): `A` activities, `E` entities, `C` claims.

---

## 1. Context in ten lines

- **tambor** — strict-TypeScript UI library: state is plain data, a view is a pure function of state, handlers are pure and return *effects*, components edit state through paths. Its README says it is a TypeScript take on the pure-data UI model of **membrane**.
- **membrane** (phronmophobic) — a Clojure(Script) UI library where views are values and components/event handlers are pure functions; platform backends (Skia, Java2D, WebGL, virtual DOM, terminal) draw the values.
- **wanna** — a spec-first harness for review sessions where each edge case (stale, duplicate, unavailable, unknown effect) is a typed outcome.
- In one chat session the assistant built three demos (wanna review session, Logo live world, reactive notebook), assessed distribution and squint/cherry, and then — after a newer tambor was supplied — re-checked it, studied membrane, and designed a benchmark programme including business-style workloads.
- **Nothing here is a measured benchmark result.** The benchmarks are a *plan with hypotheses*; the only measurements are the small checks listed in §2.

Provenance: A01–A22 · E01–E15 · grades mixed (stated per row below).

---

## 2. Status snapshot

| Item | Status | Grade | Where |
|---|---|---|---|
| Latest tambor has packaging (barrel, exports map, `private:false`, build tsconfig) | seen in files | O | §3.1 |
| `tsc` emit of latest tambor works (89 JS + 89 `.d.ts`, specifiers rewritten) | ran here | **T** | §3.1 |
| Latest tambor's Logo interpreter reproduces the demo's counts (4, 5, 66, 720, 254) | ran here | **T** | §3.1 |
| tambor's own test suite (vitest) | **not run** (no `node_modules`/network) | U | §3.1 |
| tambor's squint/cherry/macro/`:advanced` re-run results | read from `EVALUATION.md`; not re-run | O (doc) | §3.1 |
| membrane design & event/caching model | read (posts + part of source) | O | §3.2 |
| Benchmarks B1–B8, BZ1–BZ7 | **designed, not built** | D | §4 |
| Reactive notebook example (B9) | built; core tested in Node; UI not browser-tested | T / U | §4.4 |
| Failure modes of tambor under load | **hypotheses** | D | §4.7 |

---

## 3. Findings

### 3.1 tambor — what changed in the latest archive

Compared with the first archive (696 files → 801 files):

| Finding | Detail | Grade |
|---|---|---|
| Distribution packaging implemented | `src/index.ts` barrel; `core.ts` (DOM-free) and `dom.ts` subpath barrels; `package.json` `exports` for `.`, `./core`, `./spa`, `./dom`; `"private": false`; `sideEffects:false`; `files:["dist"]`; `build`/`prepack` scripts | O |
| Emit config | `tsconfig.build.json` with `rewriteRelativeImportExtensions` (turns `.ts` specifiers into `.js`) and declaration emit | O |
| Packaging gates | `tools/emit-check.sh` (≥83 js and ≥83 d.ts), `tools/pack-probe.sh` (pack, clean-room install, import probe), `tools/core-split-check.sh` | O |
| Emit verified here | `tsc -p tsconfig.build.json` (TypeScript 6.0.3) exit 0; 89 `.js` + 89 `.d.ts`; `index.js` re-exports as `./interop/index.js` etc. | **T** |
| Logo world rebuilt on the library | `src/examples/logo/{expr,interpreter,logo}.ts` (≈640 lines), per-app registry (`makeOpsApp`), tests `logo-*.test.ts` | O |
| Interpreter parity | emitted `derive` on the five examples gives 4/5/66/720/254 — identical to the assistant's demo | **T** |
| Real-library re-run of ClojureScript assessment | `EVALUATION.md` §"Re-run against the real built library": R1 squint PASS; R2 cherry PASS after two findings (0.0086 ms/dispatch on 5000 items); R3 macro path-walker PASS; R4 shadow-cljs `:advanced` PASS with caveats; "remaining untested: none" | O (doc), U (not re-run) |
| Two real findings the stand-ins hid | (1) the seam reads paths with JS indexing, so cherry persistent-vector paths recurse — materialise with `to-array` at the boundary; (2) `dissoc` is undefined for CLJS vectors — `DataOps` must own vector deletion | O |
| `:advanced` caveats | keyword-as-function on plain JS data returns nil (use `aget`); `clj->js` degrades to a no-op — build data with `#js` | O |
| Ticket board | epic `tambor-y9d` ("integrate tambor×wanna session findings"); `.y9d.2` (rebuild demos on real library) in progress; `.y9d.4` (browser-test demos) open; 47 closed | O |
| Not seen | a wanna review-session example in the tree (only Logo is new) | O |

Provenance: A15, A16 · E12 · C21–C26.

### 3.2 membrane — how it manages the things benchmarks care about

Sources: README, the two design posts, the WebGL doc, a community chat log, and the first ~1000 of 4549 lines of `membrane/ui.cljc`. **Not read:** `component.cljc`, backends, `basic-components` source.

| Concern | What membrane does | Grade |
|---|---|---|
| Repaint | Event loop waits for input (≤0.5 s), repaints after each input callback; the view function is re-run in full, then drawn. No diffing is described. | O |
| Caches | The backend binds image, font and draw caches during each repaint. | O |
| Bounds | `bounds` is memoised (`memo1`): JVM = per-thread weak-keyed map; ClojureScript = plain `memoize` (no eviction). | O |
| Pointer events | Check element bounds, walk children from topmost, stop at the first handler returning intents. | O |
| Key events | Delivered to *all* children and merged; "does anything handle keys?" queries traverse the whole tree. | O |
| State | `defui` traces derived values back to arguments to produce references; nested updates via specter; incidental state (e.g. cursor) is stored in the normal application state. | O |
| Large content | `scrollview` needs explicit scroll bounds (community log); app-level answer is `viscous`, an inspector built to run in constant space, time and screen space. | O |
| Backends | Skia, Java2D, WebGL, virtual DOM, terminal. WebGL needs images preloaded with sizes and font layout info (one default font). | O |
| Performance stance | Design first; fast benchmarks are explicitly not a current priority; author reports UIs feel responsive compared with a browser (a claim, not a measurement). | O |
| Subtree memoisation / virtualisation | **Not found in what was read.** Absence in these pages is not absence in the code. | U |

Provenance: A18 · E13 · C27–C33, C38.

### 3.3 Where tambor already differs from, or mirrors, membrane (checked in tambor's code)

| Observation | Grade |
|---|---|
| tambor has a component-level render cache: `model/component-cache.ts`, a global `Map` keyed by component name then a string key from the props; cleared whenever any component is redefined; no eviction seen. | O/T (grep) |
| tambor's `bounds()` (`views/geometry.ts`) is **not memoised**; `grep` for memo/WeakMap/cache in `views/` found nothing. | T |
| Pointer dispatch forwards to children in reverse order, like membrane. | O |
| How the DOM backend reconciles updates (keyed diff or rebuild) | **U** — not read |

Provenance: A19 · E12 · C34–C36.

---

## 4. The benchmark programme

### 4.1 Purpose and principles
1. **Find where tambor's design bends** (whole-view re-derivation per dispatch, immutable copies, linear event traversal) before comparing it with others.
2. **Then contrast** with React, Vue and Elm using idiomatic escape hatches (virtualisation, `memo`, `v-memo`/`shallowRef`, `Html.Lazy`/keyed).
3. Report **negative results**; label every number T/D/U; publish raw JSON; pin versions; Chrome via Playwright with CPU throttling; production builds; identical HTML/CSS.
4. Separate the **harness** from the apps. Review each framework port for idiom to avoid straw men.
5. For plots/whiteboards add domain libraries (uPlot, tldraw) as ceilings, labelled *not like-for-like*; what is measured is how cleanly each framework hosts them.

### 4.2 Core suite (framework-comparison basics)

| ID | App | Tests | Contrast |
|---|---|---|---|
| B1 | Keyed table 1k/10k rows (create, update every 10th, swap, select, remove) | list update path | js-framework-benchmark ops |
| B2 | TodoMVC | simplicity, LOC | Elm is the nearest architecture |
| B3 | 200-field form, typing latency | cost of re-deriving the whole view per keystroke | likely tambor's weak spot — included on purpose |
| B4 | Turtle canvas, 20k segments, animated | fold-derived world vs incremental draw | Logo demo as stress test |
| B5 | Time travel (10k steps, scrub, undo) | where tambor should win | React needs tooling; Elm debugger |
| B6 | Save/restore 5k-item state | serialise + rehydrate | plain data vs component state |
| B7 | Dashboard with many derived values | derived paths vs `useMemo`/`computed`/`lazy` | memoisation ergonomics |
| B8 | wanna review session with fault injection | correctness under stale/duplicate/lost-ack | Elm custom types strongest rival |
| **B9** | **Reactive notebook** (built — §4.4) | dependency graph, incremental propagation, many-cell view cost | Marimo/Pluto semantics; React/Vue reactivity |

### 4.3 Business suite (designed to surface limits)

| ID | App | Stress | Likely failure | Candidate response |
|---|---|---|---|---|
| BZ1 | Streaming finance dashboard (500 tickers × 10 updates/s; sparklines; order book) | ≈5k msg/s | one dispatch + full re-derive per message | coalesce to one dispatch per frame; canvas sparklines; per-row memo |
| BZ2 | Interactive plots (100k points; zoom, pan, brush; linked charts) | pointer events 60+ Hz; hit-testing | re-deriving while panning; copying point data | canvas layer taking data by reference; spatial index; decimation; pan/zoom as transform |
| BZ3 | Whiteboard (10k shapes; drag, resize, undo; remote cursors) | drag, undo history | O(n) array copies; linear hit-testing | persistent collections (cherry seam); scene vs interaction layers; native text-input bridge |
| BZ4 | Jira-like tracker (5k issues; board drag-drop; filters; optimistic edits) | big lists; derived filters; conflicts | rendering every row; recomputed filters | virtual list; memoised derived paths; **wanna outcomes for conflicts** |
| BZ5 | Log/metrics streaming (100k lines/min; search; histograms; flame graph) | unbounded append; search over millions | memory growth; main-thread search | bounded ring buffer; fixed-height virtual log; Worker filtering/aggregation |
| BZ6 | Smalltalk-like environment (inspector; 100k objects; live edits; rewind) | huge trees; long history | re-folding all entries each repaint (as the Logo demo does) | checkpointed/incremental fold; lazy tree; Worker with kill switch |
| BZ7 | Spreadsheet (1M cells; formulas) | dependency recompute | recomputing everything | dependency graph over derived paths (cf. B9) |

Provenance: A17 · C37 · grade **D** (design; no measurements).

### 4.4 B9 — the reactive notebook example (built)

*Artifact:* `artifacts/tambor-notebook.html` (published; see README). Marimo/Pluto-style: each cell defines at most one name; dependencies are inferred from identifiers; editing a cell or moving a slider re-runs only the affected cells in topological order.

| Aspect | Detail | Grade |
|---|---|---|
| Language | small expression language, **no `eval`**: numbers, arrays (vectorised ops), `+ - * / % ^`, `sin cos tan abs sqrt exp log floor round`, `sum mean len min max range linspace plot`, `slider(min,max,step,value)` | O (code) |
| Graph semantics | undefined-name, duplicate-definition, built-in-name, self/mutual cycle and upstream-error are reported per cell | T |
| Incremental run | `amp` slider re-runs 3 cells; `freq` slider re-runs 6; untouched cell values are reused by identity | T |
| Chain/fan-out | 200-cell chain propagates (201 ran); 200k-point `linspace+sin+sum` ≈ 37 ms in Node | T |
| Instrumentation | header shows `cells ran / total`, compute ms, paint ms; Mode toggle (Incremental vs Full); buttons: +200 chained, +200 fan-out, xs → 200k pts | O |
| Why it is a benchmark | separates **compute** cost (graph) from **view** cost (re-deriving 200+ textarea cards on every dispatch) — the central tambor question | D |
| Limits | structural edits (add/delete) force a full run; UI not browser-tested; expression language is deliberately small | O / U |

Provenance: A20, A21 · E14, E15 · C39–C40.

### 4.5 Metrics
- **Performance:** median and p90 over ≥15 runs per operation; p95 frame time; heap after operations; time to first paint; gzipped bundle (measure a *minimal* entry — the README's 82.9 kB figure includes the gallery).
- **Phase split (tambor-specific):** handler · view derivation · reconcile/layout · paint · GC — needs phase timers in dispatch (not present).
- **Simplicity:** LOC; distinct APIs used; dependencies; build steps; diff size for fixed change requests (add undo, add filter).
- **Testability:** share testable without a DOM.
- **Generation:** can an LLM, given the same prompt (and tambor's `llms.txt`), produce a correct app first try.
- **Failure handling (B8):** injected faults survived, scored by one shared test suite.

### 4.6 Proposed SLOs (D — to be calibrated, not claims)
Frame p95 ≤ 16.7 ms at the stated scale; BZ1 sustain 5k msg/s at 500 rows; BZ5 ingest 50k lines/s with search over 1M lines < 200 ms (Worker); BZ3 drag 5k shapes at 60 fps; B9 slider-to-paint < 50 ms at 200 chained cells in Incremental mode.

### 4.7 Hypotheses (each should be falsifiable)

| # | Hypothesis | Grade | How to falsify |
|---|---|---|---|
| H1 | Per-dispatch cost grows linearly with view size; the knee is reached at ~10³–10⁴ nodes | D | B1/B3/B9 scaling curves |
| H2 | Event-rate workloads (stream, pointer) need coalescing to one dispatch per frame; the existing rAF guard may defer without coalescing | D/U | BZ1 with message counter vs frames |
| H3 | Immutable updates on large plain arrays are O(n) and dominate BZ3/BZ5 | D | BZ3 with/without cherry persistent data |
| H4 | Missing subtree memoisation (beyond the component cache) dominates B3/B9 | D | B3/B9 with a `memo` node prototype |
| H5 | Unmemoised `bounds` makes deep-tree hit-testing super-linear | D (code reading) | BZ3 hit-test microbench |
| H6 | Component-cache key construction and memory growth hurt with large props | U | profile `cacheKey` on 10k-element props |
| H7 | tambor wins B5/B6/B8 (time travel, serialisation, typed faults) | D | B5/B6/B8 against React/Vue/Elm |

### 4.8 Candidate components and constraints

**Components:** `memo`/lazy node · virtual list & grid (row offsets from data, no DOM measuring) · canvas layer taking data by reference · bounded series (ring-buffer) store · worker effect (pure function off-thread, result returns as an effect) · spatial index · lazy tree · native text-input bridge.
**Constraints (state them explicitly):** state holds windows and summaries, never the raw stream · at most one dispatch per frame · rich text/IME stay native · per-view node budget · ephemeral lane for 60 Hz interaction state (pan, drag, scroll) — membrane keeps these in app state, which is a gap to avoid.
**Deliverable after measuring:** a green/amber/red *suitability matrix* per app type.

Provenance: A17, A18, A19 · C34–C37.

---

## 5. Failures and limits (summary)
Full list in [`../log/failures-and-errors.md`](../log/failures-and-errors.md). The ones that matter for this document: no measurements beyond small checks (F14); membrane source only partly read (F12); tambor's test suite and pinned TypeScript not run (F16); notebook and other demos not browser-tested (F05, F15); older insight files superseded by the updated tambor (F11).

## 6. Next steps (ordered)
1. Add phase timers to tambor's dispatch (I15), then build B1/B3/B9 in a Playwright harness (I16).
2. Prototype `memo`, memoised `bounds`, and a spatial index; re-measure (I11, I12, I17).
3. Build BZ5 (logs) first — it needs no new components and tests ingest, bounded state and list size together.
4. Read the remaining membrane sources (I21); run tambor's own tests in a full environment (I20).
