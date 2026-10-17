# tambor

**tambor** is a strict-TypeScript, mobile-first UI library. UI is a pure
function of state: views are plain immutable values, event handlers are pure
functions that return effects, and components edit parent state only through
derived paths — invalid combinations fail at compile time. It is a port of
the Clojure library
[phronmophobic/membrane](https://github.com/phronmophobic/membrane), which
serves as the acceptance baseline (see [TRACEABILITY.md](TRACEABILITY.md)).

**Live demo:** <https://charly-vibes.github.io/tambor/> — every element is
drawn by the corpus backend through a real-DOM host adapter (labels are
selectable text, buttons are real `<button>`s). AI agents: start from
[`ai/llms.txt`](https://charly-vibes.github.io/tambor/ai/llms.txt) (generated
from the spec corpus, one page per spec).

## Install

```sh
npm install @charly-vibes/tambor
```

ESM-only, zero runtime dependencies. Subpath exports: `@charly-vibes/tambor` (everything), `…/core` (DOM-free core: model, paths, effect dispatch, events, layout), `…/spa` (browser mounting), `…/dom` (real-DOM host adapter).

## Quickstart

The library is plain data in, plain values out — no classes, no `this`:

```ts
import { todoApp, todoState } from "./src/examples/todo/todo.ts";
import { makeApp } from "./src/effects/dispatch.ts";
import { dispatch } from "./src/events/dispatch.ts";

// 1. an app is a pure view over plain state
const app = makeApp({
  view: (state, context) => todoApp(state as typeof todoState, context),
  state: todoState(),
  backend: { containerSize: [300, 300] },
});

// 2. route an input event against the view tree; get intents back
const intents = dispatch(app.view(), { type: "mouse-down", pos: [15, 15] });

// 3. hand the intents to the dispatcher; state changes, view re-derives
if (intents.length > 0) app.dispatch(intents);
app.view(); // re-render this — it is a pure function of the new state
```

Run the SPA locally:

    npm ci
    npm run build:spa        # esbuild → dist/spa.js (<!-- stamp:bundle-size -->142.3 kB<!-- /stamp:bundle-size -->, ESM, no runtime deps)
    npx serve .              # then open http://localhost:3000

Or run the test suite:

    npm test                 # vitest: components, events, render, spa mount

## When NOT to use tambor

- **You want a mature, production UI toolkit today.** tambor is pre-1.0 with
  an incomplete component set; use [membrane](https://github.com/phronmophobic/membrane)
  itself (Clojure) or an established TS framework.
- **You need DOM ecosystem interop** (CSS frameworks, web components,
  third-party widgets). tambor renders through swappable backends; the real-DOM
  adapter draws simple elements only.
- **You want declarative diffing/reactivity per frame.** tambor re-derives the
  whole view from state; there is no virtual-DOM or fine-grained signal layer.

Choose tambor when you want membrane's pure-data UI model on TypeScript, or a
specification-first corpus (every behavior a linted, model-checked spec row)
as the base for a port.

## Glossary

| Term | Meaning |
|---|---|
| corpus | the specodelic spec set in `openspec/specs/` — the single source of truth, dual-format markdown |
| contract | a derived `.toml` under `.espectacular/` binding one spec property to its test entry (`ah sync` generates it) |
| scaffold | a generated Rust proptest stub (`todo_predicate!`) awaiting executable translation to vitest/fast-check |
| pretender | structural/complexity gate tool run in pre-commit and CI |
| testaruda | test-selection → run → ingest → calibrate loop driven by git-tracked changes |
| intent | the top-level EARS requirement row of a spec file (`kind: intent`) |

## Repository layout

    openspec/specs/    the spec corpus (<!-- stamp:spec-count -->25<!-- /stamp:spec-count --> corpus specs — edit here, gates enforce the rest)
    src/               strict-TypeScript implementation (core is DOM-free)
    src/spa/           browser entry + mount (only DOM-touching files)
    tests/             vitest suite
    tools/             stamp/gen/scaffold-debt scripts
    TRACEABILITY.md    membrane test/example → spec property mapping
    EVALUATION.md      research spike: using tambor from squint/ClojureScript

## Contributing — spec → test correspondence

Single-tree authoring: the corpus IS the openspec tree
(`openspec/specs/<name>/spec.md`, self-contained `## Requirements` mirror).
`ah sync` derives one contract per property; contracts bind to proptest
scaffolds via `tools/scaffold-check.sh` until the executable suite lands.

The full loop for a spec change:

    # 1. edit openspec/specs/<name>/spec.md (rows, constraints, properties,
    #    Requirements mirror)
    spk lint openspec/specs && spk graph openspec/specs
    spk compile openspec/specs      # regenerate *_props.rs scaffolds
    ah sync                         # derive/refresh contracts
    # 2. wire any new contract: append [[tests.shell]] scaffold binding
    #    (copy the pattern from an existing .espectacular/<spec>/*.toml)
    ah check --run-tests            # verify all <!-- stamp:contract-count -->334 contracts<!-- /stamp:contract-count -->

Enforcement (hard gates in `lefthook.yml`, mirrored in CI):

- pre-commit: `ah check`, pretender, testaruda doctor, **contract-drift
  gate** (`ah sync --check`)
- pre-push: `ah check --run-tests`, pretender (full), testaruda exec, and a
  non-blocking **scaffold-debt report** (`tools/scaffold-debt.sh`) counting
  the `todo_predicate!` stubs still awaiting executable translation

specodelic is pinned at `<!-- stamp:spk-version -->0.7.0<!-- /stamp:spk-version -->` (`versions.ddl.toml` is
the source of truth; `verify` is not implemented in specodelic 0.7.0, so
properties are proptest scaffolds, not executed tests; model-check is
exploration-only).

Edits go straight to `openspec/specs/` — it is the authored corpus, there is
no separate deployed copy (tambor-41q retired the `specs/` flat corpus and
`tools/deploy_specs.py`).

## Browser SPA (tambor-2v8 + tambor-e2y)

The SPA runs on the real-DOM host adapter: every element is drawn by the
corpus `DomBackend` through `src/interop/domhost.ts` (the structural
`ElementLike` seam — no `lib.dom` in core). Input stays corpus-native:
events route through the surface → `dispatch` → `makeApp`'s registry-aware
dispatcher, then the tree re-draws from the app view. The mount is
jsdom-tested (`tests/spa-mount.test.ts`). Deployed automatically by
`.github/workflows/deploy-pages.yml` on every push touching the SPA.
