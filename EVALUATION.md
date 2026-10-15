# Using tambor from squint and ClojureScript

**Verdict.** Squint needs no adapter. ClojureScript needs one small injectable seam (five functions, written once) and no per-component wrappers. Both are possible only if the library is designed as a plain-data API, which `interop.model` now requires. A macro is optional sugar, not a dependency.

## What I tested (Node 22, squint-cljs 0.14.211, cherry-cljs 0.6.38)
Cherry stands in for CLJS semantics (persistent collections, Keyword objects). The TS library was **not built yet**, so the `tambor-*.mjs` files are stand-ins with the same call shapes.

| # | Question | Result |
|---|----------|--------|
| 1 | Squint literals vs a JS API | Maps, vectors and keywords compile to plain objects, arrays and strings. `[:update [:todos 1 :complete?] not]` is passed as-is. Clojure fns are real JS functions. |
| 2 | Namespaced keywords in squint | `::counter-increment` becomes `"edges/counter-increment"`, `:ui/select` becomes `"ui/select"`. |
| 3 | Squint's own `assoc-in` / `update` | Copy-on-write with structural sharing, input untouched. Compatible with our path semantics. |
| 4 | Lazy seqs | `map` and `for` return a lazy iterable, **not an array**. `mapv` and `into []` return arrays. An array-only API would break on `(map ...)` children. |
| 5 | Odd keys | `"complete?"`, `"$num"`, `"next-todo-text"` survive. |
| 6 | nil | Squint nil is `null`, a missing key is `undefined`, and `nil?` is true for both. |
| 7 | Squint macros | `:require-macros` plus `defmacro` works. A `defui` macro is feasible. |
| 8 | CLJS persistent data into an array API | **Throws** (`path.reduce is not a function`). Paths are persistent vectors too. |
| 9 | CLJS via `clj->js` | Works, but identity is lost (breaks structural sharing and render caching), keyword namespaces are dropped (`:ui/select` becomes `"select"`, a collision risk), and it cost about 11 ms per conversion of a 5000-todo state. |
| 10 | CLJS via a `DataOps` seam | Persistent map in and out, keyword paths and tags work, namespaces kept, untouched todos stay `identical?`, about 0.067 ms per dispatch on 5000 todos. |
| 11 | Filtered-todo delete from squint, no macro | Active filter shows first and second. Deleting visible index 1 leaves `["first","third"]`. Toggling visible index 0 changes only `first`. |

## Compatibility matrix
| Concern | Squint | CLJS (persistent data) |
|---|---|---|
| State, paths, effects, views | direct | via `DataOps` |
| Keyword tags | become strings | `ops.tag` maps to `ns/name` |
| Lazy `map` / `for` children | library accepts iterables | library accepts seqs via `ops.toArray` |
| Update fns / handlers | direct | direct |
| Reading view objects in user code | `(:type v)` works | needs `(.-type v)` or `goog.object/get` (unverified) |
| `$path` derivation | explicit API now, macro later | explicit API now, macro later |
| Advanced compilation | n/a | **untested risk**, needs externs or quoted keys |

## Recommended design (four tiers, each optional above the first)
0. **Plain-data API.** String tags, array paths, free functions, data-first, iterable inputs, nullish nil, no enums, no `this`.
1. **`DataOps` seam.** `{get, assoc, toArray, tag}` plus `dissoc`, bound once at app creation. The CLJS adapter is about 8 lines (see `experiments/seam.cljs`).
2. **Explicit path functions.** Path concatenation, `filter(pred)`, `each(xs, $xs, fn)`. This passes the todo scenario with no macro.
3. **Optional `defui` macro** in a `.cljc` for squint and CLJS, desugaring to tier 2.

What would count as a "big adapter": converting state per render, wrapping every component, or mirroring node classes. The design avoids all three.

## Spec changes
New `interop.model` (19 constraints, 19 properties). `tambor.md` gains `host_agnostic`. `path.derivation` lists the macro and explicit tiers. The corpus now carries <!-- stamp:spec-count -->25 specs<!-- /stamp:spec-count --> (lint, graph, compile and model-check clean; this report was written when the corpus had 22).

## Not verified
- **Macro path-walker.** I only proved that squint macros work. Porting Membrane's `path-replace` (a few hundred lines, may depend on Specter at expansion time) is unproven. Spike it first.
- **CLJS advanced compilation.** I couldn't run shadow-cljs (no JVM or Maven in the sandbox). Whether node properties survive renaming is open (`interop.model.advanced_compile_safe`).
- **Real CLJS.** Cherry approximates it. Confirm against shadow-cljs.
- **Performance numbers** come from my stand-ins on one machine. Treat them as order-of-magnitude.
- The seam covers state and effects. Reading library-created view objects from CLJS is unproven.

## Suggested spikes
1. Build the real `tambor` core with `DataOps` and rerun `experiments/` against it.
2. Port `defui` to a `.cljc` macro and run it on squint.
3. Build the todo example with shadow-cljs `:advanced`.

## Re-run against the real built library (tambor-y9d.3, 2026-10-15)

Node 26, squint-cljs 0.15.212, cherry-cljs 0.6.38, shadow-cljs 3.5.7.
Every probe below imports the REAL emitted library (`dist/`, built by
`tsconfig.build.json`), not the `.mjs` stand-ins of the original assessment.
Probes: `experiments/real-squint-probe.mjs`, `experiments/real-cherry-probe.mjs`,
`experiments/real-macro-probe.mjs`, `experiments/shadow-probe/` (run
`npx squint compile <f>.cljs && node <f>.mjs`; shadow: `npx shadow-cljs release probe`
from `experiments/shadow-probe`, then `node probe-advanced.cjs`).

| # | Question | Result |
|---|----------|--------|
| R1 | squint data vs the real library | **PASS.** Plain-object maps, vectors and fn preds flow through the real example app (`todoRows`), real path derivation (`filterNav`/`nthNav`/`concatPath`) and the real `makeApp` dispatch tier (rAF-guarded, Node-safe). Filtered delete + toggle correct. |
| R2 | cherry persistent data vs the real seam | **PASS** after two real findings (below). Persistent maps in/out, `identical?` sharing on untouched todos, **0.0086 ms/dispatch** on a 5000-item state (stand-in measured ~0.067). |
| R3 | macro path-walker (tier 3) | **PASS.** squint `defmacro` (`experiments/real_macro_defs.cljc`) desugars a component to the explicit tier-2 API; expansion compiles and derives real paths against the real library. Note: squint resolves macro ns→file with **underscores** (`real_macro_defs.cljc`, not hyphens). |
| R4 | shadow-cljs `:advanced` | **PASS with one recorded surface.** Paths, state, filter/select and dispatch survive munging on plain `#js` data. Keyword-as-fn reads on plain JS data **break** (`(:description item)` → nil; `aget` works) — the matrix's unverified row is now confirmed: use `aget`/`goog.object` under `:advanced`. Also: `clj->js` under `:advanced` munges to a no-op vector pass-through — materialize data with `#js` literals, not `clj->js`. |

### Real findings the stand-ins masked (filed as follow-up tickets)

1. **Seam path materialization.** The seam tier (`seamSelect`/`seamSet`) reads
   paths with JS indexing (`path[i]`), so cherry persistent-vector keyword
   paths recurse infinitely (undefined step). Probes materialize paths with
   `to-array` at the boundary; state stays persistent. Only the *internal path
   representation* converts.
2. **Vector deletion in ops.** `dissoc` is not defined for CLJS vectors; the
   DataOps `dissoc` must own vector-deletion semantics (`into (subvec c 0 k)
   (subvec c (inc k))` — prefix stays structurally shared). The stand-in's
   dissoc silently accepted vectors.

### Remaining untested
None. All items in the original assessment and this matrix now have recorded
results. Open follow-up: first-class host-vector path support in the seam
(beads ticket, see the epic's board).
