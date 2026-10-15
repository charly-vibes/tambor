# Brief: tambor-y9d.1 — Packaging: barrel + d.ts emit + subpath exports + publishable 0.x

Ticket: `tambor-y9d.1` (beads, claimed) · Parent epic: `tambor-y9d`
Branch: work on `main` (single-developer repo convention; commit atomically)

## Why

Delegation rationale: this ticket is a well-bounded mechanical+config slice with
a crisp runnable gate (clean-project import). It needs no conversational design
input — the one DESIGN sub-decision (tsc vs tsup emit) is constrained by the
repo's own tsconfig friction points documented below, and the decider is the
recorded rationale, not taste. A fresh session can execute it without chat
context, which is exactly the subagent profile.

## Desired outcome

`tambor` becomes an installable ESM npm package at 0.x:

1. `src/index.ts` barrel re-exporting the public API (model, paths, effect
   dispatch, views, interop makeOpsApp — mirror what `src/interop/index.ts`
   already aggregates; check `src/examples/todo/todo.ts` imports for the
   consumer-facing shape).
2. Emit JS + `.d.ts` for publish. **DESIGN sub-decision — record rationale in
   the openspec change:** tsc emit must resolve `verbatimModuleSyntax` +
   `allowImportingTsExtensions` (`.ts` specifiers don't survive plain emit;
   tsup/esbuild rewrite them, tsc needs `rewriteRelativeImportExtensions` or
   a build-time codemod). Pick the smallest honest path; do NOT loosen strict
   flags to make emit easier.
3. Subpath `exports` in package.json separating the DOM-free core (`./core`:
   model/paths/effects-dispatch/views) from DOM/SPA parts (`./spa`, `./dom`).
4. Remove `"private": true`; version stays `0.1.0` (0.x semver).
5. Thin openspec change `add-distribution-packaging` under `openspec/changes/`
   adding capability spec `distribution-packaging` (one intent row, states for
   pack/publish/import, constraints citing the gates below). **`spk lint` must
   pass** on the specodelic corpus after the change (this repo's hard rule).

## Completion criteria (runnable; exit 0 = done)

```bash
# 1. regression suite untouched
npx vitest run                                   # 343 passed
# 2. package packs and installs cleanly
npm pack                                         # tambor-0.1.0.tgz
cd $(mktemp -d) && npm init -y >/dev/null &&
  npm i --no-save <abs-path>/tambor-0.1.0.tgz &&
  node -e "import('tambor').then(m=>{const n=Object.keys(m).length;console.log('exports:',n);if(n<5)process.exit(1)})"
# 3. spec corpus lint
spk lint openspec/specs                          # exit 0
ah check                                         # no issues
```

Must gate (quantified): clean-project ESM import exit 0 with ≥5 named exports;
vitest 343→343+ (no failures); spk lint exit 0.

## Out of scope

- Actually publishing to npm (`npm publish` needs explicit authorization)
- Any change to src/ runtime semantics (anti-goal)
- Demo/SPA work (that is `tambor-y9d.2`)
- EVALUATION.md probes (`tambor-y9d.3`)

## Exact files

- `src/index.ts` (new — carry a Purpose/Responsibilities/Rationale header)
- `package.json` (exports map, remove private, files allowlist)
- `tsconfig.json` or a new `tsconfig.build.json` (emit config; keep `noEmit`
  for the dev config untouched if split)
- `openspec/changes/add-distribution-packaging/**` (new)

## Red/green/refactor sequence

1. Red: write the clean-project import probe script (fails today — package is
   private, no exports).
2. Green: barrel → emit config → exports map until the probe exits 0.
3. Refactor: separate commit — openspec change + `spk lint` green.

## Spawn model

- Model: same family as orchestrator (no second family configured).
- Context ceiling: ≤ 35% of model window (ticket is config+barrel+one spec).

## Verifier evidence contract (wai-px4g)

The verify step's review artifact must cite artifact paths it read and paste
fresh test-run output before recording CONFIRM; otherwise REVIEW_REQUIRED.

## Follow-up threshold

If emit requires touching >3 src files or loosening any strict flag, STOP,
commit what works, and file a follow-up ticket — do not improvise scope.
