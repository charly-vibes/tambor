# Project Context

## Purpose
Tambor is a strict-TypeScript, mobile-first port of
[phronmophobic/membrane](https://github.com/phronmophobic/membrane) — a
pure, data-first UI library. The repo currently holds the specification
layer: a Specodelic corpus modelled from membrane's tests, examples and
component source (see `TRACEABILITY.md` and `EVALUATION.md`), deployed
into the openspec layout and enforced by espectacular contract gates.
Implementation work lands as openspec changes; each archived change
deploys scenarios the gates then enforce.

## Tech Stack
- **Specification**: Specodelic (four-layer markdown → TOML / proptest / TLA+)
- **Spec-test correspondence**: espectacular (`ah`) + openspec
- **Target implementation** (planned): strict TypeScript, no DOM dependency
  in the core, plain-data API with a `DataOps` seam for squint/CLJS interop
- **Test stack (intended)**: vitest + fast-check for properties,
  expectTypeOf for type tests
- **Quality gates**: lefthook (pretender complexity gates, testaruda
  test-selection, ah spec/contract checks)

## Project Conventions

### Code Style
- Specs live in the single-tree corpus `openspec/specs/<name>/spec.md`
  (specodelic Rev 18 dual-format) — the single source of truth, authored
  directly (tambor-41q: no flat `specs/` corpus, no deploy script).
- Contract `.toml` files under `.espectacular/` are derived by `ah sync`;
  human-owned fields are `[[tests.*]]` entries and `status` only.

### Architecture Patterns
- Corpus → dual-format single tree → derived contracts → scaffold/behavior
  tests, each layer checked by the next.
- Deliberate Membrane quirks are preserved and flagged as `advisory`
  constraints in the specs (see TRACEABILITY.md).

### Testing Strategy
- Every Properties row must have exactly one covering scenario
  (`VERIFIES` bullet) and one contract.
- While the library is unimplemented, contracts bind to specodelic
  proptest scaffolds (`tools/scaffold-check.sh`); the remaining
  `todo_predicate!` count is tracked by `tools/scaffold-debt.sh`.
- Both commit and push are hard gates — see `lefthook.yml`.