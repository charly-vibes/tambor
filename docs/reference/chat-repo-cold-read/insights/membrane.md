# membrane — insights (summary; detail in `docs/benchmarks-and-findings.md` §3.2)

Source: phronmophobic/membrane README, design posts "Implementing a Functional UI Model" and "Reusable UI Components", `docs/webgl.md`, a community chat log, the first ~1000 of 4549 lines of `src/membrane/ui.cljc`, and (I21 follow-up, 2026-10-18) the remainder of `ui.cljc` plus `component.cljc`, `basic_components.cljc`, `toolkit.cljc`, `component/present.cljc` and the backends (java2d, skia, webgl, skija, ios), read at upstream HEAD. tambor's README states it brings membrane's pure-data UI model to TypeScript.

| # | Insight | Grade |
|---|---|---|
| M1 | Whole view re-derived on each repaint; repaint after each input callback; loop wakes at least every 0.5 s | O |
| M2 | Backend binds image/font/draw caches during repaint | O |
| M3 | `bounds` memoised (JVM: thread-local weak map; CLJS: plain `memoize`, unbounded) | O |
| M4 | Pointer events: bounds check + reverse-order child walk, first handler wins; key events broadcast to all children; whole-tree `has-key-event` queries | O |
| M5 | `defui` macro traces derived values to args → references; specter for nested updates; incidental state lives in app state | O |
| M6 | scrollview needs explicit bounds; `viscous` inspector runs in constant space/time/screen space | O |
| M7 | Author: performance is not a current priority; design first; UIs feel responsive vs a browser (claim) | O |
| M8 | Subtree memoisation EXISTS, two layers: args-keyed `defui` render cache in `component-cache` (component.cljc:944, 1147–1159; all defui protocol methods route through it; `::basis` bump on redefinition 962–981/1267–1273) + opt-in backend `Cached` image wrapper (skia.clj:1584–1635, webgl.cljs:74–131; disabled in java2d:532–551). No generic memo beyond these. Was U because only ui.cljc had been read | O |
| M9 | Virtualisation ABSENT: scrollview is clip-only (ui.cljc:3317–3412; full drawable translated under scissor, java2d.clj:516–528, skia.clj:1290–1296); no virtual/cull logic in the UI layer or backends; constant-space windowing lives in the separate `viscous` repo. Sources read 2026-10-18: `component.cljc`, `basic_components.cljc`, `toolkit.cljc`, `present.cljc`, backends | O |

Takeaways for tambor: memoise `bounds` with a `WeakMap` (not an unbounded map); benchmark hit-testing against sibling count; add an ephemeral state lane for high-rate interaction state; adopt the viscous windowing pattern for big data.
