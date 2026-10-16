# membrane — insights (summary; detail in `docs/benchmarks-and-findings.md` §3.2)

Source: phronmophobic/membrane README, design posts "Implementing a Functional UI Model" and "Reusable UI Components", `docs/webgl.md`, a community chat log, and the first ~1000 of 4549 lines of `src/membrane/ui.cljc`. tambor's README states it brings membrane's pure-data UI model to TypeScript.

| # | Insight | Grade |
|---|---|---|
| M1 | Whole view re-derived on each repaint; repaint after each input callback; loop wakes at least every 0.5 s | O |
| M2 | Backend binds image/font/draw caches during repaint | O |
| M3 | `bounds` memoised (JVM: thread-local weak map; CLJS: plain `memoize`, unbounded) | O |
| M4 | Pointer events: bounds check + reverse-order child walk, first handler wins; key events broadcast to all children; whole-tree `has-key-event` queries | O |
| M5 | `defui` macro traces derived values to args → references; specter for nested updates; incidental state lives in app state | O |
| M6 | scrollview needs explicit bounds; `viscous` inspector runs in constant space/time/screen space | O |
| M7 | Author: performance is not a current priority; design first; UIs feel responsive vs a browser (claim) | O |
| M8 | No subtree memoisation/virtualisation seen in what was read | U |
| M9 | Remaining sources unread: `component.cljc`, backends, `basic-components` | — |

Takeaways for tambor: memoise `bounds` with a `WeakMap` (not an unbounded map); benchmark hit-testing against sibling count; add an ephemeral state lane for high-rate interaction state; adopt the viscous windowing pattern for big data.
