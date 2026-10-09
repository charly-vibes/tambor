# tambor — specs (v2)

Specodelic corpus for **tambor**, a strict-TypeScript, mobile-first UI
library. The Clojure library
[phronmophobic/membrane](https://github.com/phronmophobic/membrane) is the
inspiration and the acceptance baseline: the corpus is modelled from that
repo's tests, examples and component source, and every row cites the Membrane
source it was derived from (see TRACEABILITY.md and EVALUATION.md).

    spk lint openspec/specs && spk graph openspec/specs
    spk compile openspec/specs && spk model-check openspec/specs

24 corpus specs (including the scrollytelling bridge: components.pinned_panel
and scrollytelling.pin). Intended test stack: vitest + fast-check for
properties, expectTypeOf for type tests. `verify` is not implemented in
specodelic 0.4.0, so properties are proptest scaffolds
(specodelic/*_props.rs), not executed tests; model-check is exploration-only.

## Spec → test correspondence (espectacular)

Single-tree authoring (specodelic Rev 18): the corpus IS the openspec tree
(`openspec/specs/<name>/spec.md`, dual-format: `id: spec`, self-contained,
`## Requirements` mirror with one scenario per property). `ah sync` derives
one contract per property into `.espectacular/<spec>/`; while the port has
no executable suite yet, each contract is bound to its proptest scaffold via
`tools/scaffold-check.sh` (traceability gate — upgraded to vitest /
fast-check entries as the implementation lands).

The full loop for a spec change:

    # 1. edit openspec/specs/<name>/spec.md (rows, constraints, properties,
    #    Requirements mirror)
    spk lint openspec/specs && spk graph openspec/specs
    spk compile openspec/specs      # regenerate *_props.rs scaffolds
    ah sync                         # derive/refresh contracts
    # 2. wire any new contract: append [[tests.shell]] scaffold binding
    #    (copy the pattern from an existing .espectacular/<spec>/*.toml)
    ah check --run-tests            # verify all 329+ contracts

Enforcement (all wired as hard gates in `lefthook.yml`):

- pre-commit: `ah check` (structural lint of the single tree — includes the
  spk relay under Rev 18), pretender, testaruda doctor, **contract-drift
  gate** (`ah sync --check`)
- pre-push: `ah check --run-tests`, pretender (full), testaruda exec, and a
  non-blocking **scaffold-debt report** (`tools/scaffold-debt.sh`) counting
  the `todo_predicate!` stubs still awaiting executable translation

Edits go straight to `openspec/specs/` — it is the authored corpus, there is
no separate deployed copy (tambor-41q retired the `specs/` flat corpus and
`tools/deploy_specs.py`).