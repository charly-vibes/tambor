# squint / cherry — assessment

> **Updated 2026-10-16:** the latest tambor re-ran this assessment against the real built library (squint, cherry, macro path-walker, shadow-cljs `:advanced`) — see `tambor-latest.md`. The text below is the earlier, stand-in-based assessment; the 'bundle-size' and 'nothing was run' statements describe *this session's* sandbox, not tambor's current state.


Basis: tambor's `EVALUATION.md` (squint-cljs 0.14.211, cherry-cljs 0.6.38). **Nothing here was compiled or run** — the sandbox had neither tool nor network.

- **squint** — maps/vectors/keywords compile to plain JS objects/arrays/strings; tambor accepts them as-is. `assoc-in`/`update` align with tambor path semantics. (O, from doc)
- **cherry** — real CLJS persistent data; needs the `DataOps` seam (~8 lines); `clj->js` loses identity and keyword namespaces; reported ~11 ms on a 5000-item state. (O, from doc; U as to re-measurement)
- **Opportunity** — cherry/squint can compile Clojure at runtime in the browser, which would give a real REPL instead of the hand-written Logo interpreter, similar to power-turtle's replumb role but plausibly much lighter. **Bundle-size claim: U.**
- **Risks** — evaluating user code needs a Worker/iframe with a kill switch; a published claude.ai artifact can load scripts only from a short allow-list (jsDelivr's npm path is one) and it is **U** whether cherry/squint ship a usable browser build there.
- **Recommendation (D)** — keep the TS core as substrate; write the world + language in squint first; add cherry only if persistent-data semantics or the REPL are needed.
