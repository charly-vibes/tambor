# tambor — membrane-js specs (v2)

Specodelic corpus for a strict-TypeScript, mobile-first port of
phronmophobic/membrane, modelled from the repo's tests, examples and
component source. See TRACEABILITY.md and EVALUATION.md.

    specodelic lint specs && specodelic graph specs
    specodelic compile specs && specodelic model-check specs

23 corpus specs (including the scrollytelling bridge: components.pinned_panel
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

    tools/deploy_specs.py        # specs/*.md -> openspec/specs/<spec>/spec.md
    ah sync                      # derive/refresh contracts from Properties rows
    ah check                     # structural spec-test correspondence (hard gate)
    ah check --run-tests         # execute contract tests (hard push gate)

Gates are wired in `lefthook.yml`: `ah check` + pretender + testaruda
doctor on pre-commit; `ah check --run-tests` + pretender (full) + testaruda
exec on pre-push. Edits go to the corpus (`specs/`), then redeploy — never
edit `openspec/specs/` by hand.