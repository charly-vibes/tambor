# Reactive notebook example (B9)

`artifacts/tambor-notebook.html` — Marimo/Pluto-style cells on a tambor-style core (mini-port, not the library). See `docs/benchmarks-and-findings.md` §4.4 for the full table.

- **Model:** cell = `{id, src}`; `name = expr` defines a name; dependencies inferred from identifiers; one definition per name; cycles/undefined/duplicates reported per cell.
- **Execution:** topological order; edit/slider → re-run the transitive dependents only (Incremental) or everything (Full).
- **State is data:** `cells`, `sliders`, `out` (values by cell id), `info` (parse/deps), `stats`. The view is a pure function of that state.
- **Tested (T, Node):** `tests/notebook-core.test.mjs` — graph correctness, incremental counts (3 and 6), error cases, 200-cell chain, 200k-point array (~37 ms).
- **Not tested (U):** the UI in a real browser (textarea/slider node carry-over in `paint()`, 200+ cards, mobile layout).
- **Design rule worth keeping:** no `eval` — a published page may block it, and arbitrary code execution is a risk; a Worker-based evaluator is the upgrade path (I18).
