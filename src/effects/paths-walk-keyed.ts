// Purpose: the by-key navigator handler (add-keyed-dom-reconciliation
//   §3) — its own module because paths-walk-navigators.ts sits near the
//   pretender file cap and the handler is a self-contained navigator.
// Responsibilities: ["by-key", field, value] — address the UNIQUE
//   element of a sequence whose `field` property Object.is-matches
//   `value`; select continues into the matched element; write replaces
//   the matched slot (clone, position preserved, other elements
//   structurally shared); DELETED splices the matched element;
//   exactly-one is loud in select and write alike: keyed-not-found when
//   absent or on a non-sequence target (never a silent empty select),
//   keyed-ambiguous when several match — errors carry the field and
//   the value.
// Rationale: openspec/changes/add-keyed-dom-reconciliation/specs/
//   state-paths/spec.md is the contract authority; the loud exactly-one
//   failure mirrors seq-nth's loud out-of-range, while filter is
//   set-oriented (zero-or-more, silent empty) and cannot address.
//   Map support is out of scope (maps address by keypath; no keyed
//   analog worth the spec surface). No behavior beyond the corpus.

import {
  DELETED,
  type Ctx,
  type Leaf,
  type Navigator,
  type WalkFn,
} from "./paths-core.ts";

// The message value: String form (primitives only per the
// path_serialisable alignment; quoted strings add nothing to the match).
function safeValue(value: unknown): string {
  return String(value);
}

// The exactly-one scan: first matching index and the match count —
// first-match bookkeeping only feeds the error paths; exactly-one is
// enforced before any walk continues.
function matchIndexAndCount(
  arr: readonly unknown[],
  field: string,
  val: unknown,
): { index: number; matches: number } {
  let index = -1;
  let matches = 0;
  for (const [idx, el] of arr.entries()) {
    const candidate =
      el !== null && typeof el === "object"
        ? (el as Record<string, unknown>)[field]
        : undefined;
    if (Object.is(candidate, val)) {
      if (matches === 0) index = idx;
      matches++;
    }
  }
  return { index, matches };
}

export function stepByKey(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  const field = step[1] as string;
  const val = step[2];
  if (!Array.isArray(value)) {
    throw new Error(
      `keyed-not-found: target is not a sequence, no element with ${field} = ${safeValue(val)}`,
    );
  }
  const { index, matches } = matchIndexAndCount(value, field, val);
  if (matches === 0) {
    throw new Error(`keyed-not-found: no element with ${field} = ${safeValue(val)}`);
  }
  if (matches > 1) {
    throw new Error(
      `keyed-ambiguous: ${matches} elements match ${field} = ${safeValue(val)}`,
    );
  }
  const cur = value[index]!;
  const child = walk(cur, path, i + 1, ctx, leaf, false);
  if (ctx.mode === "select") return child;
  return writeBackByKey(value, index, cur, child);
}

// Write-back: DELETED splices the matched element; an unchanged child
// returns the SAME array reference (identity, shape and structural
// sharing preserved); otherwise the clone replaces only the matched
// slot — every other element keeps its identity.
function writeBackByKey(
  arr: readonly unknown[],
  matchIndex: number,
  cur: unknown,
  child: unknown,
): unknown {
  if (child === DELETED) {
    return [...arr.slice(0, matchIndex), ...arr.slice(matchIndex + 1)];
  }
  if (child === cur) return arr;
  const next = arr.slice();
  next[matchIndex] = child;
  return next;
}
