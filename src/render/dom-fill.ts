// Purpose: the fill-extent machinery of the real-DOM painters
//   (tambor-0rp/tambor-2jz), extracted from dom-painters.ts as a
//   mechanical split (zero behavior change).
// Responsibilities: FILLED_TYPES and SAME_ORIGIN_TYPES (the drawable
//   classifications the extent walk consults), FillRequest (a fill
//   wrapper awaiting its extent), fillExtent (the union of the boxes
//   of the shapes a wrapper paints, per drawable through
//   drawableExtent) and settleFillExtents (the post-attach sizing of
//   the collapsed wrappers).
// Rationale: a with-color wrapper's background is the fill its shape
//   content would paint (canvas fillStyle), so the wrapper must have a
//   box: 100% of the containing block in normal flow, the shapes' own
//   extent when that block has none (an absolutely positioned group of
//   absolute children collapses to 0×0 and the percentage resolves to
//   nothing — the selected-row accent never painted). 100% of the
//   containing block is a fill's area whenever that block has one; a
//   block with no box of its own resolves the percentage to 0×0 and
//   the fill paints nothing. The measurement has to wait for the whole
//   tree: builders create elements detached and append bottom-up, and
//   a detached element has no box at all (a browser reports a zero
//   rect for it), so settling per-wrapper during the build would
//   misread every wrapper as collapsed. Every box is read before any
//   style write — a write between reads dirties the layout again and
//   costs a reflow per wrapper. Wrappers with no fill area are never
//   queued.

import type { ElementLike } from "./domsim.ts";
import type { AnyDraw } from "./primitives.ts";
import {
  height as elemHeight,
  isElem,
  width as elemWidth,
  type Vec2,
} from "../views/model.ts";
import type { BuildCtx, DomNode } from "./dom-painters.ts";

const FILLED_TYPES: Readonly<Record<string, true>> = {
  "rectangle": true,
  "rounded-rectangle": true,
};

// The wrappers that keep their children at the wrapper's own origin, so
// a shape below one is still filled from (0, 0).
const SAME_ORIGIN_TYPES: Readonly<Record<string, true>> = {
  "with-color": true,
  "with-style": true,
  "with-stroke-width": true,
  "handler": true,
  "rotate": true,
  "scale": true,
  "scissor": true,
};

// A fill wrapper awaiting its extent: the element, and the area its
// shape content paints (measured from the wrapper's own origin).
export interface FillRequest {
  readonly el: ElementLike;
  readonly extent: Vec2;
}

// The running union the extent walk accumulates.
interface Acc {
  w: number;
  h: number;
  found: boolean;
}

function maxInto(acc: Acc, extent: Vec2): void {
  acc.w = Math.max(acc.w, extent[0]);
  acc.h = Math.max(acc.h, extent[1]);
}

// One drawable's contribution to the running union: false paints
// nothing (null, spacer); true grew the union; null means the wrapper
// must not become an area fill — text and paths carry the ink in their
// own painters, and a translate moves its content away from the
// wrapper's origin, where a wrapper box could not follow it without
// moving the children (position semantics stay the draw tree's).
function drawableExtent(d: AnyDraw, acc: Acc): boolean | null {
  if (d == null) return false;
  if (Array.isArray(d)) {
    const extent = fillExtent(d);
    if (extent === null) return null;
    maxInto(acc, extent);
    return true;
  }
  const n = d as DomNode;
  if (FILLED_TYPES[n.type] === true && isElem(n)) {
    maxInto(acc, [elemWidth(n), elemHeight(n)]);
    return true;
  }
  if (n.type === "spacer") return false; // lays out, paints nothing
  if (SAME_ORIGIN_TYPES[n.type] === true && n.drawables !== undefined) {
    const extent = fillExtent(n.drawables);
    if (extent === null) return null;
    maxInto(acc, extent);
    return true;
  }
  return null;
}

// The area a fill wrapper is itself responsible for painting, measured
// from its own origin: the union of the boxes of the shapes it wraps.
// Nil when the wrapper must not become an area fill. The boxes are the
// corpus ones (views/model width and height), the same numbers
// buildRectangle emits.
export function fillExtent(drawables: readonly AnyDraw[]): Vec2 | null {
  const acc: Acc = { w: 0, h: 0, found: false };
  for (const d of drawables) {
    const grew = drawableExtent(d, acc);
    if (grew === null) return null;
    acc.found ||= grew;
  }
  return acc.found ? [acc.w, acc.h] : null;
}

// Size the fill wrappers collected during a root build; see the module
// rationale for why the measurement waits for the whole tree.
export function settleFillExtents(ctx: BuildCtx): void {
  const fills = ctx.fills;
  if (fills === undefined) return;
  ctx.fills = [];
  const collapsed: FillRequest[] = [];
  for (const req of fills) {
    const r = req.el.getBoundingClientRect();
    if (r.width !== 0 || r.height !== 0) continue;
    const [w, h] = req.extent;
    if (w <= 0 || h <= 0) continue;
    collapsed.push(req);
  }
  for (const req of collapsed) {
    req.el.style["width"] = `${req.extent[0]}px`;
    req.el.style["height"] = `${req.extent[1]}px`;
  }
}
