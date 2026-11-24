// Purpose: the per-child identity reuse machinery of the real-DOM
//   painters (add-runtime-invalidation tasks 3.5/3.6), extracted from
//   dom-painters.ts as a mechanical split (zero behavior change).
// Responsibilities: BuiltRange (one child's built elements and its
//   position in the parent's child list) and buildChildWithReuse (the
//   splice-or-build decision per child), plus the ReuseCtx contract a
//   build context satisfies to take part in reuse.
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
