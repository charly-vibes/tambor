# Bombadil exploration suite

Property-based browser exploration for the demo SPA. Bombadil drives a real
Chrome, picks actions from the generators this suite exports, evaluates
temporal properties over the captured states, and writes a replayable trace.

This is **local exploration, not a gate**: it is not in `lefthook.yml`, not in
`ci.yml` required checks, and not part of `ah check --run-tests` or the vitest
suite. Tests in `tests/` pin that boundary (`tests/bombadil-scope.test.ts`).

## Provenance and pins

- CLI: `@antithesishq/bombadil@0.7.10`, pinned **exactly** in `package.json`
  (no caret) and in `package-lock.json`.
- The package ships TypeScript declarations and platform binaries only (no
  runtime JS): the CLI bundles `bombadil/*.spec.ts` and supplies the
  `@antithesishq/bombadil` runtime while evaluating the bundle.
- Formulas (`always`, `now`, `next`, `not`, `eventually`) come from the root
  entry `@antithesishq/bombadil`. `extract`, `actions`, `weighted` and
  `getFingerprint` come from `@antithesishq/bombadil/browser`. The browser
  entry does **not** re-export the formula operators.
- A custom spec must export at least one `ActionGenerator`; a spec that only
  exports properties fails at load with an unhelpful runtime error. The stage
  actions below satisfy this.

## Layout

| Path | Role |
| --- | --- |
| `bombadil/counter.spec.ts` | counter property + exports of actions/safety properties |
| `bombadil/lib/stage.ts` | `#demo > div` geometry and `mounted` cells; point containment |
| `bombadil/lib/actions.ts` | stage-scoped click/drag/scroll/key generators |
| `bombadil/lib/model.ts` | `globalThis.__tambor` reader + JSON-safe derived values |
| `bombadil/tsconfig.json` | DOM-lib, strict, no-emit typecheck (`npm run typecheck:bombadil`) |
| `tools/bombadil-run.sh` | build → serve → run → clean up ([`just bombadil <demo>`](../justfile)) |

Extractors run inside the page and must return JSON, so helpers never return a
DOM node or an `Elem`. `model.ts` never returns `view()`: it carries handler
functions and cannot be serialized.

## Minimal spec skeleton

```ts
// bombadil/<demo>.spec.ts
import { always, next, now } from "@antithesishq/bombadil";
import { extract } from "@antithesishq/bombadil/browser";

// Re-export only the safety properties + stage actions. Do NOT write
// `export * from "@antithesishq/bombadil/browser/defaults"`: it also
// re-exports `defaultActions`, whose clicks leave the selected demo.
export {
  noConsoleErrors,
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
} from "@antithesishq/bombadil/browser/defaults/properties";
export { stageActions } from "./lib/actions.ts";

const value = extract<number | null>((state) =>
  /* JSON-safe projection; null before mount */ 5,
);

export const myProperty = always(
  now(() => {
    const previous = value.current;
    return previous === null ? true : next(() => value.current !== null);
  }),
);
```

`stageActions` is always exported by the existing helpers; a spec that exports
no action generator cannot run.

## Run

```sh
just bombadil counter                 # build + serve + run + clean up
CHROME="$(ls "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | head -1)" just bombadil counter
BOMBADIL_TIME_LIMIT=30s just bombadil counter
BOMBADIL_PORT=4602 just bombadil counter
npm run typecheck:bombadil            # tsc -p bombadil/tsconfig.json
```

Defaults: port `4601`, time limit `60s`, output `target/bombadil/counter/`
(gitignored). The runner fails loudly when the port is taken, waits for the
fixture server, removes the previous output directory, preserves the CLI exit
status, and kills the server on every exit path (EXIT/INT/TERM). Two
consecutive runs need no manual cleanup.

The gallery shell has its own spec but no registry demo id of its own: the
runner keys `bombadil/<demo>.spec.ts`, so `just bombadil gallery` sends
`?demo=gallery`, which `boot-selection.ts` resolves to the first registry
entry (`todo`). The shell — nav, `#demo` container, fixture stage CSS — is
whatever demo mounts behind it, so the spec measures shell geometry only.

```sh
BOMBADIL_TIME_LIMIT=20s just bombadil gallery   # shell spec, demo falls back to todo
npx bombadil browser test --headless --time-limit 20s \
  "http://localhost:4601/?demo=todo&debug=1" bombadil/gallery.spec.ts
```

The second form assumes the fixture server is already running (see the
direct command below); the demo id only has to be a mountable registry entry.

Equivalent direct command (fixture already running):

```sh
PORT=4601 node tests/e2e/serve.mjs &
npx bombadil browser test --headless --time-limit 60s \
  --output-path target/bombadil/counter --output-path-overwrite \
  "http://localhost:4601/?demo=counter&debug=1" bombadil/counter.spec.ts
```

`?debug=1` publishes `globalThis.__tambor` (`demo`, `state()`, `view()`,
`drawCount()`); `?demo=<id>` selects the demo. Both are inert when absent.

## Demo matrix

| Demo (`just bombadil <demo>`) | Spec | Property | Status |
| --- | --- | --- | --- |
| `counter` | `counter.spec.ts` | `counterTransitions`: the value moves by -1/0/+1 between states | implemented, expected-pass |
| `todo` | `todo.spec.ts` | model/DOM agreement: visible rows match `state()` + filter | implemented, expected-pass |
| `select` | `select.spec.ts` | option labels exist exactly while the model says open | implemented, expected-pass |
| `plots` | `plots.spec.ts` | both draws agree, band count is 0..BAND_COUNT, 0 bands ⇔ "no data" | implemented, expected-pass |
| `gallery` (shell) | `gallery.spec.ts` | `navTargets`: every nav chip is ≥44×44; `stageCentred`: `#demo > div` gutters differ by ≤2px (content box) | implemented, expected-pass |
| `dashboard-derived`, `editor`, `environment`, `keyed-table`, `logo`, `review-faults`, `save-restore-5k`, `spreadsheet`, `stream-dashboard`, `time-travel-10k`, `tracker`, `virtual-list`, `whiteboard` | `<demo>.spec.ts` (one each) | `textStaysInsideRoot`: no leaf text escapes the 300px drawn root in any state; `noClippedText`: no leaf text is clipped by its own box | implemented, expected-pass |

The 13 geometry specs above plus `counter`, `todo`, `select` and `plots`
(the behavioral properties) cover every demo that has a spec today; demos
without one (`form-200`, `log-stream`, `notebook`, `todomvc`, …) are rejected
by the runner until a spec lands. `gallery` is not a registry demo id, so the
runner's `?demo=gallery` mounts the first entry (`todo`) behind the same shell
(see Run).

## Trace and triage loop

Every run writes `target/bombadil/<demo>/trace.jsonl` plus screenshots. The
runner prints both the trace path and the reproduce command.

1. **Inspect** the failure: `npx bombadil browser inspect target/bombadil/<demo>`
   (use `--no-open` on headless machines). The timeline shows the action,
   state and the violated property.
2. **Shrink** a long trace (experimental):
   `npx bombadil browser shrink --trace target/bombadil/<demo>/trace.jsonl --property <name> "http://localhost:4601/?demo=<demo>&debug=1" bombadil/<demo>.spec.ts`
3. **Reproduce** exactly (the runner prints this form; start the fixture
   server first):
   `npx bombadil browser test --headless --reproduce target/bombadil/<demo>/trace.jsonl "http://localhost:4601/?demo=<demo>&debug=1" bombadil/<demo>.spec.ts`
   `--reproduce` is mutually exclusive with `--time-limit` and
   `--exit-on-violation`; do not add them.
4. File a `bd` issue with the trace, the reproduce command, and the property
   name. Then either fix the app/host seam or remove/adjust the property — the
   suite has no allowlist and no `test.fail` (design D2), so a red run always
   means a new finding.

A green run means the exported properties held for the sampled states only;
the suite is exploratory, not exhaustive.

## Chrome, locale, and environment

- `browser test` manages Chrome's lifecycle itself; there is no `--chrome`
  flag. The CLI reads `CHROME=<path>` and otherwise searches the standard
  Chrome/Chromium install paths. `tools/bombadil-run.sh` passes `CHROME`
  through untouched and, when neither `CHROME` nor a system browser is
  available, fails before building with the Playwright cache path to use:
  `CHROME="$(ls "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome
  | head -1)" just bombadil counter` (the repo never downloads a browser; `npx playwright
  install` owns the cache).
- External-attach fallback (when managed-Chrome startup hangs, e.g. a sandbox
  screenshot timeout): start Chromium yourself with
  `chromium --remote-debugging-port=9222 "http://localhost:4601/?demo=<demo>&debug=1"`
  and run
  `npx bombadil browser test-external --remote-debugger http://localhost:9222 --headless ...`
  (`--create-target` controls whether Bombadil opens the tab).
- Locale: the CLI has no locale flag; the managed browser uses its default
  locale (typically en-US). Properties must not depend on localized text —
  this suite parses integers and drawn structure, and the fixture pins the
  font and stage geometry. Pin any locale-sensitive expectation in the app,
  not in the runner.

## Upgrade policy

A version bump is a dedicated change:

1. bump the exact pin in `package.json` + lockfile (and the nightly action's
   `version` input once the nightly lands);
2. run **every** demo locally with a full time limit and review each trace —
   green is not enough if the tool silently stops registering a property;
3. re-record any changed output/paths and update this README.

If the nightly lands and **no finding is triaged within eight weeks**, remove
the nightly workflow and this suite in a follow-up change. The suite must earn
its maintenance cost.

## Nightly exploration workflow

[`.github/workflows/bombadil-nightly.yml`](../.github/workflows/bombadil-nightly.yml)
runs this suite on GitHub Actions. It is **exploratory and non-blocking**.

- **Triggers**: `schedule` at 05:17 UTC daily, plus `workflow_dispatch` with a
  `demo` choice (`counter`, `todo`, `select`, `plots`, `all`; default `all`).
  A manual single-demo dispatch runs only that matrix leg.
- **Per-demo matrix leg**: checkout → Node 24 (`setup-node`, npm cache) →
  `npm ci` → `npm run build:spa` → `node tests/e2e/serve.mjs` on a
  job-unique port (`counter` 4711, `todo` 4712, `select` 4713, `plots` 4714)
  → readiness poll on `/?demo=<demo>&debug=1` →
  `antithesishq/bombadil-action@v3` with `version: 0.7.10`, the generic
  `bombadil/<demo>.spec.ts` spec path, `time-limit: 60s`, and
  `output-path: bombadil-output`. The action installs Chrome for Testing and
  maps its inputs to the CLI positionals/flags (`origin` → `ORIGIN`,
  `specification` → `SPEC_FILE`, `time-limit` → `--time-limit`); it has no
  `headless` input and runs the browser driver headless itself. `time-limit`
  stays well below the job's `timeout-minutes: 15`.
- **Server lifetime**: the fixture server is backgrounded with a PID file.
  The start step's `EXIT` trap kills it when readiness fails, and an
  `if: always()` "Stop fixture server" step kills it on every later exit path
  (success, property violation, failure, cancellation). The runner teardown
  is the final backstop, not the mechanism.
- **Artifact**: `bombadil-output-<demo>` — the demo suffix is required because
  `actions/upload-artifact@v4` artifacts are immutable and a shared
  `bombadil-output` name would collide across matrix legs. Upload runs with
  `if: always()`, so the trace survives a violation (exit 2); it uses
  `if-no-files-found: warn` and `retention-days: 14`. A failed upload
  annotation never turns a red leg green: the job conclusion stays failed.
  To inspect locally, download the artifact and run
  `npx bombadil browser inspect bombadil-output` (see the triage loop above).
- **Concurrency**: one run per workflow+branch with `cancel-in-progress:
  true`; a new nightly supersedes a still-running exploration.
- **Never a gate**: the workflow has no `push`/`pull_request` trigger, so it
  cannot run on a PR or block a merge, and it is not referenced by
  `lefthook.yml`, the required checks in `.github/workflows/ci.yml`, or
  `ah check --run-tests`. A red leg is a finding to file in `bd` and triage,
  not a failing gate. Adding a demo means adding its spec, a matrix entry,
  and a port in the `plan` job; a version bump must update both
  `package.json`/`package-lock.json` and the workflow's `version` input.