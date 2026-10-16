# A Smalltalk / Papert-Logo style environment on tambor (design, D)

| Ingredient | tambor provides | Missing |
|---|---|---|
| Inspectable everything | plain-data state, view values, derived paths | generic inspector/"halo" |
| Late binding | named effects resolved at dispatch (`defeffect`; prefer per-app seam) | per-world namespaces |
| Liveness | whole-view re-derivation after each dispatch | code editor beyond a textarea |
| Time travel | pure handlers → replayable history | UI (built in the Logo demo) |
| Image/persistence | JSON-serialisable state | durable store (wanna fits: conditional commit, reconcile, restart) |
| Objects/messages | — | would be data + dispatch tables |

## Core idea realised in the Logo demo
`world = fold(entries[0..cursor])` — the world is never stored. Rewind = change the cursor. Late binding = apply all definitions first, then re-run all commands. Procedures are data, so they can be loaded back into the editor and redefined.

## Plan
1. Logo world as fold *(done, demo 2)* → 2. runtime keyword tables EN/ES → 3. halo via a `select-path` effect → 4. persist through wanna's durable store (each live edit a typed, recorded change) → 5. interpreter in a Worker with terminate → 6. squint/cherry for a real Clojure evaluator.
