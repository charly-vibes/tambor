# power-turtle — insights

Context: `power-turtle.com` returned only a JS loading shell (title "Turtle", heading "Power Turtle", "Loading…"); a name search returned unrelated electrical products. The user then supplied the GitHub repo and later a zip. GitHub's `src` tree page was blocked by robots.txt; `project.clj` was readable; the zip was fully read.

| # | Insight | Grade |
|---|---|---|
| P1 | ClojureScript app (Leiningen). Reagent/re-frame UI, CodeMirror + parinfer editor, replumb self-hosted REPL, `clojure-turtle` 0.3.0 for the turtle, Quil for drawing. | O |
| P2 | Turtle state lives in `clojure-turtle`'s atoms (mutable), drawn via a Quil sketch. API functions return `nil` to keep REPL output quiet; `repeat` takes a function. | O |
| P3 | Localization = per-namespace CSV (`existing,alias`) → `cban` generates a `cljs.user` namespace with `:rename`; can also rename `clojure.core` words. | O |
| P4 | **12** translation folders: de en es fr id ko pt_PT ru ta tl zh_CN zh_TW. (Earlier stated "14" — wrong; see F08.) | T (counted) |
| P5 | Lessons are markdown slides: `---` separates slides, header `canvas: turtle`, `???` notes, `--` incremental; code indented 4 spaces; slurped at compile time via macro (no hot reload). English: 17 lessons in 3 levels. Korean: 1. No Spanish lessons. | O |
| P6 | Spanish CSV is missing `color` and `repeat` (English has both). | T (diff) |
| P7 | Translation quality is visibly machine-made: `termiar-llenado` (typo), `asignar-conjuntoxy`; zh `forward`→前锋 (a sports "forward"); de `penup`→`steige-hoch`. | O |
| P8 | Traditional Spanish Logo dialects use forms like `avanza`, `giraderecha`, `repite`. | **U→T** — verified 2026-10-16 (tambor-y9d.5, see provenance below) |
| P9 | Licence EPL 1.0; copyright 2016; dependency versions are old (ClojureScript 1.10, re-frame 0.10). | O (repo page / `project.clj`, as reported in chat; not re-read for this repo) |

## Takeaways
- Use a **runtime keyword table** consulted by the evaluator rather than generated namespaces.
- Make **lesson snippets entries in a fold** and lesson progress a cursor.
- Seed Spanish from the CSV, then have a Spanish speaker review.
- Reusing *code* triggers EPL obligations; reusing *ideas* does not.

## Provenance (tambor-y9d.5, fetched 2026-10-16)

- Repo: https://github.com/timothypratley/power-turtle — CSVs fetched at commit
  `b7a9aafd8ed7c5c7b5c19419de0a203e5e5dc288` (HEAD at fetch):
  `translations/es/power-turtle.api.turtle.csv`, `translations/en/power-turtle.api.turtle.csv`.
- Re-verified P6/P7 verbatim from the fetch: es CSV lacks `color` and `repeat`
  (en has both); es `end-fill`→`termiar-llenado` (typo; corrected form is
  `terminar-llenado`).
- P8 verification (the F08 lesson): `avanza`/`avanzar`, `giraderecha`/`girarderecha`,
  `giraizquierda`/`girarizquierda`, `repite` checked against
  es.wikipedia "Logo (lenguaje de programación)" ("avanzar 100 girarderecha 90
  girarizquierda 30"; "repite 4 [av 100 gd 90]") and es.wikipedia "MSWLogo"
  instruction list ("AV número Avanza la tortuga"; "REPITE número
  [instrucciones]"; "PONCL [R G B] Fija color del lápiz" — the setcolor family).
  `color` (CSV gap) aliased to `poncolor` on the strength of the PON* list.
  `naranja`/`morado`/`negro` (orange/purple/black — the CSV's own gap) are
  dictionary-level standard Spanish, NOT reference-verified — still awaiting a
  Spanish speaker sign-off, per the takeaway above. Words with no tambor
  counterpart (`limpiar`, `setheading`→`asignar-encabezado`, `start-fill`,
  `end-fill`) are recorded as CSV provenance only, not aliased.
- Landing: `src/examples/logo/keywords.ts` (runtime tables + typed lookup),
  `derive(..., dialect)` in `src/examples/logo/interpreter.ts`, dialect toggle
  + ES examples in the demo (`src/examples/logo/logo.ts`); contracts in
  `tests/logo-keywords.test.ts`.
