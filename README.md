# membrane-js specs (v2)

Specodelic v0.4.0 corpus for a strict-TypeScript, mobile-first port of phronmophobic/membrane,
modelled from the repo's tests, examples and component source. See TRACEABILITY.md.

    specodelic lint specs && specodelic graph specs
    specodelic compile specs && specodelic model-check specs

21 specs. Intended test stack: vitest + fast-check for properties, expectTypeOf for type tests. `verify` is not implemented in
specodelic 0.4.0, so properties are proptest scaffolds (specodelic/*_props.rs),
not executed tests; model-check is exploration-only.
