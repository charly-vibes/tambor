# Tests

`node tests/logo-interpreter.test.mjs` — extracts the interpreter from `artifacts/tambor-logo.html` and checks: segment counts for the five examples, late-vs-early binding differ, and the three error paths (unknown word, recursion depth, step budget).

Provenance: the first five checks and the binding/unknown-word/recursion checks were run ad hoc during the session (T); the step-budget case was added and the whole file run when this repo was generated.

**Not covered:** any UI behaviour, and everything in demo 1 (see `log/failures-and-errors.md` F05).

## notebook-core.test.mjs
`node tests/notebook-core.test.mjs` — extracts the reactive core from `artifacts/tambor-notebook.html`: full vs incremental run counts (8 / 3 / 6), reused-by-identity values, error cases (undefined, cycle, duplicate, self-cycle, syntax, unknown function), a 200-cell chain, and a 200k-point array timing. Run when the repo was generated: pass.
