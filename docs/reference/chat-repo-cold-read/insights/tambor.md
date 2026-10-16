# tambor — insights

| # | Insight | Grade | Source |
|---|---|---|---|
| T1 | State is plain data; a view is a pure function of state producing an immutable value tree. | O | README, `src/interop/*` |
| T2 | Handlers are pure `(state, event) → effects`; a dispatcher applies effects and the whole view is re-derived. | O | README, examples (`todo`) |
| T3 | Components edit state only through derived paths. | O | README |
| T4 | Effects are looked up by name (`defeffect`) in a **global** registry; the interop tier has a per-app seam (`makeOpsApp`, ops/registry passed in). | O | `effects/dispatch.ts`, `interop/app.ts` |
| T5 | Backends are swappable (DOM, canvas). | O | README |
| T6 | No runtime dependencies; esbuild builds `dist/spa.js`; demo deploys to GitHub Pages; ships `ai/llms.txt`. | O | `package.json`, repo tree |
| T7 | `package.json` has `"private": true`; tsconfig uses `noEmit` and `.ts` import specifiers; **no `src/index.ts` barrel** (confirmed by directory check). | T | files |
| T8 | README describes itself as pre-1.0 with an incomplete component set. | O | README |
| T9 | `EVALUATION.md` assessed squint/cherry: squint needs no adapter; cherry needs a ~8-line `DataOps` seam (`experiments/seam.cljs`). | O (doc) / U (results never re-run) | `EVALUATION.md` |
| T10 | `EVALUATION.md` itself lists untested items: the macro path-walker, shadow-cljs `:advanced`, and testing against a *built* tambor (it used stand-in `.mjs` files). | O | `EVALUATION.md` |

## Why it suits a "live world"
Plain-data state + named late-bound effects + whole-view re-derivation = liveness by construction. See [`dynamic-environment.md`](dynamic-environment.md).

## Caveat
The global effect registry (T4) is the main obstacle to multiple isolated worlds; prefer the per-app seam.
