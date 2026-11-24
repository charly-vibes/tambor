// Purpose: the pure keyed reconcile plan (add-keyed-dom-reconciliation
//   §1), extracted from dom-reuse.ts as a mechanical split (zero
//   behavior change) to keep dom-reuse under the file_lines ceiling.
// Responsibilities: ReconcileStep (splice-the-previous-range at
//   prevIndex vs build fresh), KeyFn (the explicit key extractor
//   contract), reconcile (one step per NEXT child; the key locates the
//   candidate slot and the INNER Elem identity confirms it), and the
//   two matching rules — first-match-wins keyMatch and M1's
//   positionalMatch fallback.
// Rationale: plain data, no DOM, no elements touched: the painter
//   computes the plan once per container and buildChildWithReuse
//   consumes the step for its index (§2); splice donation still flows
//   through reusePrev/reuseUsed. Duplicate keys degrade by FIRST MATCH
//   WINS — the first same-key child donates, every further same-key
//   child builds (drawn output never depends on key hygiene); each
//   previous range donates at most once per plan (reuseUsed's guard,
//   decided here so the painter cannot double-claim). A keyed wrapper
//   is fresh per call and never an identity signal — keyedInner is the
//   only identity that crosses frames.

import type { AnyDraw } from "./primitives.ts";
import { declaredKey, keyedInner } from "../views/nodes.ts";

// One step per NEXT child (add-keyed-dom-reconciliation §1): splice the
// previous frame's range for prevIndex, or build fresh. Plain data, no
// DOM, no elements touched: the painter computes the plan once per
// container and buildChildWithReuse consumes the step for its index
// (§2); splice donation still flows through reusePrev/reuseUsed.
export type ReconcileStep =
  | { readonly op: "reuse"; readonly prevIndex: number }
  | { readonly op: "build" };

// An explicit key extractor for reconcile; the default (declaredKey)
// reads the declared `key` field. Returns undefined for unkeyed
// children — they keep M1's positional rule.
export type KeyFn = (child: AnyDraw) => string | number | undefined;

const BUILD: ReconcileStep = Object.freeze({ op: "build" });

function reuseStep(prevIndex: number): ReconcileStep {
  return Object.freeze({ op: "reuse", prevIndex });
}

// Matching rules (design decisions 2/3, Pins): the key locates the
// candidate slot and the INNER Elem identity confirms it (a keyed
// wrapper is fresh per call — never an identity signal); duplicate keys
// degrade by FIRST MATCH WINS — the first same-key child donates, every
// further same-key child builds (never splices: drawn output never
// depends on key hygiene); every other miss falls through to M1's
// positional rule (same index + inner identity), which keys extend but
// never restrict; each previous range donates at most once per plan
// (reuseUsed's guard, decided here so the painter cannot double-claim).
export function reconcile(
  prev: readonly AnyDraw[],
  next: readonly AnyDraw[],
  key?: KeyFn,
): readonly ReconcileStep[] {
  const extract = key ?? declaredKey;
  const donated = new Set<number>(); // prev indexes already claimed
  const claimed = new Set<string | number>(); // keys already donated
  const steps: ReconcileStep[] = [];
  for (let j = 0; j < next.length; j++) {
    const child = next[j]!;
    const inner = keyedInner(child);
    const k = extract(child);
    const matched =
      k !== undefined
        ? keyMatch(prev, inner, k, extract, donated, claimed) ??
          positionalMatch(prev, j, inner, donated)
        : positionalMatch(prev, j, inner, donated);
    if (matched === undefined) {
      steps.push(BUILD);
      continue;
    }
    donated.add(matched);
    steps.push(reuseStep(matched));
  }
  return steps;
}

// First-match-wins key lookup: the first previous child whose key
// matches (Object.is) and whose INNER Elem is identity-equal donates.
// A key already donated by an earlier same-key sibling never matches
// again (further same-key children build — never splice).
function keyMatch(
  prev: readonly AnyDraw[],
  inner: AnyDraw,
  k: string | number,
  extract: KeyFn,
  donated: Set<number>,
  claimed: Set<string | number>,
): number | undefined {
  if (claimed.has(k)) return undefined;
  for (let i = 0; i < prev.length; i++) {
    if (donated.has(i)) continue;
    const pk = extract(prev[i]!);
    if (pk !== undefined && Object.is(pk, k) && keyedInner(prev[i]!) === inner) {
      claimed.add(k);
      return i;
    }
  }
  return undefined;
}

// M1's positional rule: same index, same inner Elem identity, not
// already donated this plan. Keys extend the lookup domain but never
// restrict this fallback.
function positionalMatch(
  prev: readonly AnyDraw[],
  j: number,
  inner: AnyDraw,
  donated: Set<number>,
): number | undefined {
  const pj = prev[j];
  return pj !== undefined && !donated.has(j) && keyedInner(pj) === inner
    ? j
    : undefined;
}
