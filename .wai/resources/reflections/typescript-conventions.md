# TypeScript conventions (tambor, adopted in tambor-ip9)

Source: tambor-ip9 session (2026-10-20, commits 5966826 → 416e2cb); upstream
guidance filed as wai#62. Gates wired: `npm run lint` / `just lint` /
lefthook pre-push eslint / CI eslint step.

## Conventions

1. **Bracket access for index-signature/$-path state** —
   `noPropertyAccessFromIndexSignature` adopted; index-signature properties
   ($-paths, dict-style state) are read as `obj["prop"]`, not `obj.prop`.
   Keeps the $-path idiom visible and typed at the boundary.
2. **`_` prefix for deliberately unused** — unused params/vars get a `_`
   prefix (`_index`, `_event`); aligned across tsc
   (noUnusedLocals/noUnusedParameters) and eslint no-unused-vars.
3. **Three adopted eslint rules beyond recommended tier**:
   - `no-floating-promises` — zero hits at adoption, keeps it that way.
   - `switch-exhaustiveness-check` with
     `considerDefaultExhaustiveForUnions: false` — the rule default would
     flag every existing `default:`-style switch; a missing arm is the
     finding, not a missing default.
   - `no-unnecessary-condition` — see #4 for the philosophy.
4. **Honest boundary guards, not blanket disables** — at untrusted
   boundaries, widen types honestly (`data: unknown`, `DispatchInput`
   includes null/undefined, notebook FN rest args `+undefined` so
   `b === undefined` is meaningful) and let the guard be real. Do NOT
   eslint-disable to paper over a type that hides the nullish case. Genuinely
   redundant `??`/`?.`/dead comparisons are removed instead.
5. **Ambient globals: `declare var`, never `declare let`** — `declare let`
   in env.d.ts does NOT create a `globalThis` property and broke
   `typeof globalThis.requestAnimationFrame`. (Residual no-var disables ×2
   are deliberate.)
6. **strictTypeChecked tier deferred** — 546 problems at adoption
   (280 unnecessary-type-assertion + 332 non-null-assertion). Adopted
   recommended tier + the three rules above; full strict tier is a candidate
   follow-up, not a regression to re-litigate per-PR.

## Codemod mechanics (TS4111 dot→bracket migration)

- tsc error coords drift when multiple edits apply sequentially — group edits
  per statement, apply per-file in descending order.
- First specifier in braces: drop its trailing comma (no comma insertion);
  delete the whole statement when braces empty.
- `?.prop` sites need a '?'-before-'.' check or the dot gets eaten.

## Known friction

- Removing an import line orphans a preceding `// @ts-expect-error` — delete
  the directive too.
- Optional-chaining narrows: after
  `x?.a !== null && x?.a !== undefined`, later `?.` in the same expression is
  flagged by no-unnecessary-condition.
- pretender cyclomatic gate (≤10) reds after switch-arm additions — extract
  the arm into a named function.
