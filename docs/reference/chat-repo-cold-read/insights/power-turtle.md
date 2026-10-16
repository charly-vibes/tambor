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
| P8 | Traditional Spanish Logo dialects use forms like `avanza`, `giraderecha`, `repite`. | **U** — from memory, not checked against a reference |
| P9 | Licence EPL 1.0; copyright 2016; dependency versions are old (ClojureScript 1.10, re-frame 0.10). | O (repo page / `project.clj`, as reported in chat; not re-read for this repo) |

## Takeaways
- Use a **runtime keyword table** consulted by the evaluator rather than generated namespaces.
- Make **lesson snippets entries in a fold** and lesson progress a cursor.
- Seed Spanish from the CSV, then have a Spanish speaker review.
- Reusing *code* triggers EPL obligations; reusing *ideas* does not.
