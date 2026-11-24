// Purpose: the per-child identity reuse machinery of the real-DOM
//   painters (add-runtime-invalidation tasks 3.5/3.6), extracted from
//   dom-painters.ts as a mechanical split (zero behavior change), plus
//   the pure keyed reconcile plan (reconcile, add-keyed-dom-
//   reconciliation §1).
// Responsibilities: BuiltRange (one child's built elements and its
//   position in the parent's child list), buildChildWithReuse (the
//   splice-or-build decision per child), the ReuseCtx contract a build
//   context satisfies to take part in reuse, and the keyed plan
//   (reconcile: reuse(prevIndex) or build per next child).
// Rationale: reusePrev is the PREVIOUS frame's Elem→range map —
//   undefined (or a miss, or an index mismatch, or an already-spliced
//   range) means build fresh; reuseNext records this frame's ranges
//   and becomes the next build's reusePrev. An unknown ChangeSet frame
//   passes reusePrev undefined: no subtree is reused for that frame
//   (identity is the only reuse key; stale output impossible). An
//   identity match at the SAME child position splices the previous
//   frame's elements (appendChild moves them in the real-DOM host); a
//   miss builds fresh and records the range it appended.
//   Reorder/insert/remove shift positions, so the index check rebuilds
//   conservatively — no keyed matching. The map holds built ranges,
//   never commits.

import type { ElementLike } from "./domsim.ts";
import type { AnyDraw } from "./primitives.ts";
import { declaredKey, keyedInner } from "../views/nodes.ts";
import type { ChangeSet } from "../effects/dispatch.ts";

// The per-frame render hint (add-runtime-invalidation §3, internal —
// set by the spa mount before every wire draw, never a public API): the
// frame's ChangeSet, whether the lane overlay is absent, the lane
// pan/scroll offset, and the ambient scheme. A draw WITHOUT a hint (any
// non-mount draw path) is conservative: it never short-circuits and
// never reuses subtrees.
export interface FrameHint {
  readonly changes: ChangeSet;
  readonly overlayNull: boolean;
  readonly lane: readonly [number, number];
  readonly scheme: string;
}

// The reuse half of a build context: element construction and the
// recursive traversal, plus the per-frame reuse maps.
export interface ReuseCtx {
  make(tag: string): ElementLike;
  build(view: AnyDraw, parent: ElementLike): void;
  reusePrev?: WeakMap<object, BuiltRange> | undefined;
  reuseNext: WeakMap<object, BuiltRange>;
  // Ranges already spliced this frame: a structurally shared Elem (the
  // same object in two positions) may only donate its elements once.
  reuseUsed: Set<BuiltRange>;
}

// One child's built elements: its position in the parent's child list
// and the elements its build appended (appendChild moves them on
// splice). The map holds built ranges, never commits.
export interface BuiltRange {
  readonly index: number;
  readonly els: readonly ElementLike[];
}

// Build one child of a sequence with per-child identity reuse
// (add-runtime-invalidation task 3.5): an identity match at the SAME
// child position splices the previous frame's elements (appendChild
// moves them in the real-DOM host); a miss builds fresh and records the
// range it appended. Reorder/insert/remove shift positions, so the
// index check rebuilds conservatively — no keyed matching.
export function buildChildWithReuse(
  ctx: ReuseCtx,
  child: AnyDraw,
  parent: ElementLike,
  index: number,
): void {
  const prev = ctx.reusePrev?.get(child as object);
  if (
    prev !== undefined &&
    prev.index === index &&
    !ctx.reuseUsed.has(prev)
  ) {
    for (const el of prev.els) parent.appendChild(el);
    ctx.reuseUsed.add(prev);
    ctx.reuseNext.set(child as object, prev);
    return;
  }
  const start = parent.children.length;
  ctx.build(child, parent);
  if (child !== null && typeof child === "object") {
    ctx.reuseNext.set(child as object, {
      index,
      els: parent.children.slice(start),
    });
  }
}

// The pure keyed reconcile plan (add-keyed-dom-reconciliation §1): given
// a container's previous and next children, return one step per NEXT
// child — splice the previous frame's range for prevIndex, or build
// fresh. Plain data, no DOM, no elements touched: the painter computes
// the plan once per container and buildChildWithReuse consumes the step
// for its index (§2); splice donation still flows through
// reusePrev/reuseUsed.
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
