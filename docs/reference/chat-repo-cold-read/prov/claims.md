# Claims ledger

Grades: O observed · T tested · D derived · U unverified. Status: holds · corrected · open.

| ID | Claim | Grade | Source entity | Status |
|---|---|---|---|---|
| C01 | wanna submit returns `recorded`/`duplicate`/`stale`/`unavailable`/`unknown_effect` | O | E02 | holds |
| C02 | The seven "wanna principles" | D | E02 | open (I02) |
| C03 | wanna's reuse decision is "narrow"; distribution `wanna-zbn` may not proceed | O | E02 | holds |
| C04 | wanna is headless (no DOM/authorization) | O | E02 | holds |
| C05 | publishable candidates `composition-shell`, `review-indexeddb`; additive 0.1→0.3 | O | E02 | holds (not re-read) |
| C06 | tambor: `private:true`, `noEmit`, `.ts` specifiers, no barrel, no runtime deps | O/T | E01 | holds |
| C07 | tambor model: pure view, effects, derived paths, global registry + per-app seam | O | E01 | holds |
| C08 | `EVALUATION.md`: squint no adapter; cherry needs ~8-line seam | O (doc) | E01 | holds; results U |
| C09 | Demos use a model port, not the library | O | E06, E08 | holds (F01) |
| C10 | Demo 1 UI works in a browser | U | E06 | open (F05) |
| C11 | Logo interpreter correct on 5 examples; late binding differs from early; errors reported | T | E08 | holds |
| C12 | Demo 2 UI works in a browser | U | E08 | open (F05) |
| C13 | cherry/squint have a usable browser build within artifact CSP | U | — | open |
| C14 | power-turtle.com content unreadable by fetch (JS shell) | O | E04 | holds |
| C15 | power-turtle: CLJS, replumb, clojure-turtle 0.3.0, Reagent/re-frame, EPL 1.0 | O | E03, E05 | holds |
| C16 | power-turtle has "14 languages" | — | — | **corrected → 12** |
| C17 | Spanish CSV lacks `color`, `repeat`; has typos | T/O | E03 | holds |
| C18 | Spanish Logo dialect words (`avanza`, …) | U | — | open (I04) |
| C19 | Distribution plan will build as described | U | — | open (I07) |
| C20 | Cherry/squint lighter than replumb | U | — | open |

## Added in the second half of the session

| ID | Claim | Grade | Source | Status |
|---|---|---|---|---|
| C21 | Latest tambor has barrel, `core`/`spa`/`dom` subpaths, `private:false`, `tsconfig.build.json` | O | E12 | holds |
| C22 | `tsc -p tsconfig.build.json` (TS 6.0.3) emits 89 js + 89 d.ts with `.js` specifiers | T | E12 | holds |
| C23 | Emitted Logo `derive` gives 4/5/66/720/254 on the five examples | T | E12 | holds |
| C24 | `EVALUATION.md` records R1–R4 PASS and two seam findings | O (doc) | E12 | holds; not re-run (U) |
| C25 | Board: epic `tambor-y9d`; `.y9d.2` in progress; `.y9d.4` open | O | E12 | holds |
| C26 | tambor's vitest suite passes | — | — | **open (U)**, not run |
| C27 | membrane is phronmophobic/membrane and tambor's README calls it the model source | O | E12, E13 | holds |
| C28 | membrane re-derives the view per repaint; repaints after input; ≤0.5 s wake | O | E13 | holds |
| C29 | membrane `bounds` memoised; CLJS uses unbounded `memoize` | O | E13 | holds |
| C30 | membrane key events broadcast; pointer events hit-test by bounds, first handler wins | O | E13 | holds |
| C31 | membrane state via `defui` references, specter updates, incidental state in app state | O | E13 | holds |
| C32 | membrane scrollview needs explicit bounds | O (community log) | E13 | holds |
| C33 | membrane author deprioritises benchmarks; claims responsiveness | O | E13 | holds (claim unmeasured) |
| C34 | tambor has a global component render cache keyed by name+props string, cleared on redefinition | O/T | E12 | holds |
| C35 | tambor `bounds()` unmemoised; no memo/WeakMap/cache in `views/` | T | E12 | holds |
| C36 | tambor DOM backend reconciliation strategy | — | — | **open (U)** |
| C37 | Failure modes under load (H1–H7) | D | — | open — to be falsified |
| C38 | membrane has no subtree memoisation/virtualisation | U | E13 | open (only "not found") |
| C39 | Notebook core: graph, incremental counts (3, 6), errors, 200-chain, 200k array | T | E14, E17 | holds |
| C40 | Notebook UI works in a browser | U | E14 | open (F14) |
