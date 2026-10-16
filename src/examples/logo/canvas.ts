// Purpose: the logo demo's canvas (tambor-y9d.6) — the turtle trace as
//   clickable colored path segments, the clickable turtle marker, and
//   the Smalltalk-style halo handles drawn around the selection.
// Responsibilities: logoCanvas(s, w) — every trace segment and the
//   turtle marker wrapped in a mouse-down handler emitting the
//   select-path effect for its item; the halo: four filled handle
//   squares at the corners of the selected item's screen rect. Also
//   owns the canvas presentation constants and the "#rrggbb" → corpus
//   color conversion.
// Rationale: selection is routed as pure data — each handler returns
//   ["select", <item path>] (select.ts) and the demo's per-app registry
//   applies it; no handler mutates anything. Hit areas are tight: each
//   handler node sits inside its item's translate (coords_translated)
//   and pads the item's bounds with an invisible (alpha-0) rectangle so
//   near-axis segments stay clickable. The wanna-chat demo
//   (insights/dynamic-environment.md) is the design authority.

import {
  on,
  path as pathNode,
  rectangle,
  translate,
  withColor,
  withStrokeWidth,
  type Color,
  type Elem,
  type HandlerNode,
  type PathNode,
  type Vec2,
} from "../../views/model.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { TraceSeg, World } from "./interpreter.ts";
import {
  TURTLE_ITEM,
  selectEffect,
  segmentItem,
  itemRect,
  type Selection,
} from "./select.ts";
import type { LogoState } from "./logo.ts";

// The demo's presentation constants (original CSS analogues).
export const INK: Color = [0.11, 0.106, 0.098];
export const TURTLE: Color = [0.7, 0.149, 0.118];
export const WORLD_RADIUS = 200;

// The halo handle: a small filled square at each rect corner.
export const HALO_HANDLE = 6;

// Fully transparent — the invisible hit-area padding color.
const TRANSPARENT: Color = [0, 0, 0, 0];

// "#rrggbb" → the corpus [0..1] rgb triple; anything else is ink.
export function hexColor(name: string | null): Color {
  if (typeof name === "string" && /^#[0-9a-f]{6}$/i.test(name)) {
    const n = parseInt(name.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  return INK;
}

// The mouse-down handler emitting the select effect for one item.
function selHandler(item: Selection): HandlerNode["handler"] {
  return () => [selectEffect(item)] as unknown as IntentList;
}

// One trace segment: the drawn colored line plus the invisible hit
// pad, normalized so the item's top-left sits at the local origin.
function segNode(seg: TraceSeg, i: number): Elem {
  const ax = seg[0] + WORLD_RADIUS;
  const ay = WORLD_RADIUS - seg[1];
  const bx = seg[2] + WORLD_RADIUS;
  const by = WORLD_RADIUS - seg[3];
  const ox = Math.min(ax, bx);
  const oy = Math.min(ay, by);
  const line: PathNode = pathNode([ax - ox, ay - oy], [bx - ox, by - oy]);
  const hit = rectangle(Math.max(Math.abs(ax - bx), 10), Math.max(Math.abs(ay - by), 10));
  return translate(
    ox,
    oy,
    on("mouse-down", selHandler(segmentItem(i)), [
      withColor(hexColor(seg[4]), withStrokeWidth(2, line)),
      withColor(TRANSPARENT, hit),
    ]),
  );
}

// The turtle marker: the stroked triangle, normalized to non-negative
// local points, plus the invisible hit pad.
function turtleNode(w: World): Elem {
  const line: PathNode = pathNode([5, 0], [0, 11], [10, 11], [5, 0]);
  return translate(
    w.x + WORLD_RADIUS - 5,
    WORLD_RADIUS - w.y,
    on("mouse-down", selHandler(TURTLE_ITEM), [
      withColor(TURTLE, withStrokeWidth(2, line)),
      withColor(TRANSPARENT, rectangle(10, 11)),
    ]),
  );
}

// The four halo handles: filled squares centred on the rect corners.
function haloHandles(w: World, sel: Selection): Elem {
  const r = itemRect(w, sel, WORLD_RADIUS);
  if (r === null) return null;
  const hs = HALO_HANDLE / 2;
  const corners: readonly Vec2[] = [
    [r.x - hs, r.y - hs],
    [r.x + r.w - hs, r.y - hs],
    [r.x - hs, r.y + r.h - hs],
    [r.x + r.w - hs, r.y + r.h - hs],
  ];
  return corners.map((c) => translate(c[0], c[1], withColor(TURTLE, rectangle(HALO_HANDLE, HALO_HANDLE))));
}

// The turtle canvas: clickable segments, the clickable turtle marker,
// and the halo of the current selection (null draws nothing).
export function logoCanvas(s: LogoState, w: World): Elem {
  const segs: Elem[] = w.trace.map((seg: TraceSeg, i: number) => segNode(seg, i));
  return [segs, turtleNode(w), haloHandles(w, s.sel)];
}
