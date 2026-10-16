// Purpose: the logo demo's selection model (tambor-y9d.6) — a
//   Smalltalk-style select-path effect carried as pure data.
// Responsibilities: the Selection shape (a host-data path naming one
//   on-screen item, or null); the select effect vector (selectEffect);
//   the pure toggle handler (selectLogo) that stores the path under
//   LogoState.sel; the item naming and field projection (itemTitle,
//   inspectItem) the inspector renders; and itemRect, the screen-space
//   bounding box the halo handles are drawn from.
// Rationale: selection is an effect the demo routes through its
//   per-app registry (interop-model: ops_bound_to_app), never
//   imperative mutation — the handler only spreads state, so nothing
//   outside the sel path changes (state-paths: paths are plain data;
//   the effect names the item, it does not touch it). The world is
//   re-derived every render (logo.ts), so the inspector projects its
//   fields from the derived world, not from stored state.

import type { LogoState } from "./logo.ts";
import type { TraceSeg, World } from "./interpreter.ts";

// A selection names an item by state path: ["turtle"], ["trace", 3],
// ["pen"] — or null when nothing is selected.
export type Selection = readonly unknown[] | null;

// The built-in selection targets (the turtle and the pen state).
export const TURTLE_ITEM: Selection = ["turtle"];
export const PEN_ITEM: Selection = ["pen"];

// The selection path of the i-th drawn trace segment.
export function segmentItem(i: number): Selection {
  return ["trace", i];
}

// The select effect: ["select", item] — plain data, applied by the
// demo's per-app registry entry, never by the caller.
export type SelectEffect = readonly [tag: "select", item: Selection];

export function selectEffect(item: Selection): SelectEffect {
  return ["select", item];
}

// The pure toggle handler: selecting the already-selected item
// deselects; a different path switches the selection.
export function selectLogo(s: LogoState, item: Selection): LogoState {
  return { ...s, sel: sameItem(s.sel, item) ? null : item };
}

function sameItem(a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

// The selected item's fields as plain data (string | number | boolean
// | null — null is the data itself, e.g. the null pen color), or the
// whole record null when the path names nothing on screen.
export type ItemFields = Readonly<Record<string, string | number | boolean | null>>;

// A human name for the selected item, for the inspector's title row.
export function itemTitle(sel: Selection): string {
  if (sel === null) return "nothing";
  const head = sel[0];
  if (sel.length === 1 && head === "turtle") return "turtle";
  if (sel.length === 1 && head === "pen") return "pen";
  if (sel.length === 2 && head === "trace") return `segment ${String(sel[1])}`;
  return "unknown";
}

export function inspectItem(w: World, sel: Selection): ItemFields | null {
  const head = sel === null ? undefined : sel[0];
  if (head === "turtle") return turtleFields(w);
  if (head === "pen") return { pen: w.pen, color: w.color };
  if (head === "trace" && sel !== null && sel.length === 2) {
    return segmentFields(w, sel[1]);
  }
  return null;
}

function turtleFields(w: World): ItemFields {
  return { x: w.x, y: w.y, hd: w.hd, pen: w.pen, color: w.color };
}

function segmentFields(w: World, index: unknown): ItemFields | null {
  const seg = w.trace[typeof index === "number" ? index : -1];
  if (seg === undefined) return null;
  return { x1: seg[0], y1: seg[1], x2: seg[2], y2: seg[3], color: seg[4] };
}

// The screen-space bounding box of the selected item, padded for the
// halo handles; null when the item is not on screen.
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const HALO_PAD = 5;

export function itemRect(w: World, sel: Selection, radius: number): Rect | null {
  const head = sel === null ? undefined : sel[0];
  if (head === "turtle" || head === "pen") {
    return pad({ x: w.x + radius - 5, y: radius - w.y, w: 10, h: 11 });
  }
  if (head === "trace" && sel !== null && sel.length === 2 && typeof sel[1] === "number") {
    return segmentRect(w.trace[sel[1]], radius);
  }
  return null;
}

function segmentRect(seg: TraceSeg | undefined, radius: number): Rect | null {
  if (seg === undefined) return null;
  const ax = seg[0] + radius;
  const ay = radius - seg[1];
  const bx = seg[2] + radius;
  const by = radius - seg[3];
  return pad({
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(ax - bx),
    h: Math.abs(ay - by),
  });
}

function pad(r: Rect): Rect {
  return { x: r.x - HALO_PAD, y: r.y - HALO_PAD, w: r.w + 2 * HALO_PAD, h: r.h + 2 * HALO_PAD };
}
