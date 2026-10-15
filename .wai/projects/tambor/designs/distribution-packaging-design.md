# Design: add-distribution-packaging

## DESIGN decision — tsc emit vs tsup/esbuild (recorded rationale)

The repo's tsconfig friction points constrain the choice:

- `verbatimModuleSyntax: true` is load-bearing (typing-model's erased/type
  surface depends on it) and `allowImportingTsExtensions: true` means every
  internal import is written `./x.ts`. Plain `.ts` specifiers do not survive
  plain tsc emit: the compiler would leave them verbatim and Node would fail
  to resolve. tsup/esbuild rewrite them for free, tsc needs either
  `rewriteRelativeImportExtensions` or a build-time codemod.

**Chosen: plain `tsc` with `rewriteRelativeImportExtensions: true`** in a new
`tsconfig.build.json` extending the dev config.

Rationale:

1. **Smallest honest path.** Zero new dependencies (tsup would add its own
   esbuild+rollup tree), zero build-time codemods, and the dev config —
   including `noEmit` and every strict flag — is inherited untouched. The
   only deltas are emit-side: `noEmit: false`, `declaration: true`,
   `rewriteRelativeImportExtensions: true`, `outDir/rootDir`, `types: []`.
2. **No loosening.** tsup's d.ts pipeline (rollup-plugin-dts) re-resolves
   types and historically fights `verbatimModuleSyntax` edge cases; a tsc
   mismatch there would pressure us to relax strict flags — the exact
   anti-goal. Verified empirically: the full src tree emits 83 JS + 83
   `.d.ts` with zero errors and zero flag changes.
3. **Reversibility.** If emit needs bundling later (single-file artifacts,
   CSS, etc.), tsup can consume the same barrel entries; nothing in this
   change forecloses it.

Rejected: tsup (new dep tree, opaque d.ts step), build-time codemod of `.ts`
specifiers (extra moving part for the same result), loosening
`verbatimModuleSyntax`/`allowImportingTsExtensions` (anti-goal).

## Barrel shape

- Root (`.`) = `src/index.ts`: the flat interop barrel re-exported whole,
  plus the membrane-side modules as namespaces (`views`, `layout`,
  `dispatch`, `paths`, `events`). Namespaces, not star-exports, because
  interop's `label`/`vstack` collide with views/model's builders.
- `./core` = `src/core.ts`: DOM-free model/paths/effects-dispatch/events/
  layout. `effects/dispatch.ts` and `events/bubble.ts` are re-exported with
  explicit named lists because both `views/model.ts` and
  `effects/dispatch.ts` export a `Handler` type (TS2308).
- `./spa` points at `dist/spa/mount.js`; `./dom` = `src/dom.ts` (DomBackend,
  domsim, realDomFactory).

## Failure/abort thresholds (brief)

If emit had required touching >3 src files or loosening any strict flag,
this change would have stopped at a follow-up ticket. It did not: two new
src files (barrels) + one config.
