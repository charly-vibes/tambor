# tambor — specs (v2)

Specodelic corpus for **tambor**, a strict-TypeScript, mobile-first UI
library. The Clojure library
[phronmophobic/membrane](https://github.com/phronmophobic/membrane) is the
inspiration and the acceptance baseline: the corpus is modelled from that
repo's tests, examples and component source, and every row cites the Membrane
source it was derived from (see TRACEABILITY.md and EVALUATION.md).

    specodelic lint specs && specodelic graph specs
    specodelic compile specs && specodelic model-check specs

24 corpus specs (including the scrollytelling bridge: components.pinned_panel
and scrollytelling.pin). Intended test stack: vitest + fast-check for
properties, expectTypeOf for type tests. `verify` is not implemented in
specodelic 0.4.0, so properties are proptest scaffolds
(specodelic/*_props.rs), not executed tests; model-check is exploration-only.

## Spec → test correspondence (espectacular)

The corpus is deployed into the openspec layout as dual-format specs
(`id: spec`, self-contained, `## Requirements` mirror with one scenario per
property). `ah sync` derives one contract per property into
`.espectacular/<spec>/`; while the port has no executable suite yet, each
contract is bound to its proptest scaffold via
`tools/scaffold-check.sh` (traceability gate — upgraded to vitest /
fast-check entries as the implementation lands).

The full loop for a spec change (edit the corpus, never
`openspec/specs/` by hand):

    # 1. edit specs/<name>.md (rows, constraints, properties)
    specodelic lint specs && specodelic graph specs
    specodelic compile specs        # regenerate *_props.rs scaffolds
    tools/deploy_specs.py           # redeploy dual-format copies
    ah sync                         # derive/refresh contracts
    # 2. wire any new contract: append [[tests.shell]] scaffold binding
    #    (copy the pattern from an existing .espectacular/<spec>/*.toml)
    ah check --run-tests            # verify all 329+ contracts

Enforcement (all wired as hard gates in `lefthook.yml`):

- pre-commit: `ah check`, pretender, testaruda doctor, **spec-drift gate**
  (regenerates `openspec/specs/` from the corpus and fails on any diff —
  an edited corpus file without redeploy cannot slip past), **contract-drift
  gate** (`ah sync --check`)
- pre-push: `ah check --run-tests`, pretender (full), testaruda exec, and a
  non-blocking **scaffold-debt report** (`tools/scaffold-debt.sh`) counting
  the `todo_predicate!` stubs still awaiting executable translation

Edits go to the corpus (`specs/`), then redeploy — never edit
`openspec/specs/` by hand.