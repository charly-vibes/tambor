# Glossary

- **Effect** (tambor): a named piece of data a handler returns, e.g. `["set", ["draft"], "x"]`. Interpreted by a dispatcher.
- **Derived path** (tambor): a path into state through which a component edits its slice; components never mutate state directly.
- **Typed outcome** (wanna): a distinct, named result of an operation (`recorded`, `duplicate`, `stale`, `unavailable`, `unknown_effect`), each carrying an obligation for the consumer.
- **Unknown effect**: a write whose acknowledgement was lost; it may or may not have applied. Rule: reconcile, never retry.
- **Reconcile**: ask the authoritative store whether an operation id was applied.
- **Stale**: the reviewer saw an older revision than the artifact now has. Feedback is never silently retargeted.
- **Mini-tambor**: the ~40-line model port embedded in the demos. *Not* the tambor library.
- **Late binding** (Logo demo): re-running all commands against the newest definitions instead of the ones current at the time.
- **squint / cherry**: ClojureScript-to-JS compilers (squint: plain JS data; cherry: CLJS semantics with persistent collections).
- **replumb**: a self-hosted ClojureScript REPL used by power-turtle.
- **PROV**: W3C provenance model: *entities*, *activities*, *agents* and relations between them.
