// Purpose: shared harness for the components-virtual_list contract tests
//   (the scrollview helper split precedent, tambor-272).
// Responsibilities: virtual-list call construction and rendering, the
//   event-layer row scan (drawnRows), and the independent intersection
//   derivation the window bounds are checked against (intersecting).
// Rationale: openspec/specs/components-virtual_list/spec.md is the design
//   authority; every helper here is used by two or more of the topic
//   files (components-virtual_list-geometry / -render), so they live
//   here instead of being duplicated.

import { virtualList } from "../../src/components/virtual_list/index.ts";
import { call, render, type ComponentCall } from "../../src/model/component.ts";
import type { EventElem } from "../../src/events/bubble.ts";
import {
  label,
  type TranslateNode,
  type Vec2,
} from "../../src/views/model.ts";
import { walk, type EventNode } from "./scrollview.ts";
import { OFFSET_PATH } from "./scrollview.ts";

// The offset path the wheel/scroll intents address (re-exported so the
// topic files import one helper module).
export { OFFSET_PATH };

// A virtual-list call: rows derive from the index ("row <i>" labels —
// the raw stream is never materialised); an explicit $offset keeps the
// intents addressable at the plain offset path (same shape svCall uses).
export function vlCall(opts: {
  count: number;
  rowHeight: number;
  gap?: number;
  overscan?: number;
  offset?: Vec2;
  viewport: Vec2;
}): ComponentCall {
  return call(virtualList, {
    count: opts.count,
    "row-height": opts.rowHeight,
    ...(opts.gap !== undefined ? { gap: opts.gap } : {}),
    ...(opts.overscan !== undefined ? { overscan: opts.overscan } : {}),
    ...(opts.offset !== undefined ? { offset: opts.offset } : {}),
    "scroll-bounds": opts.viewport,
    row: (i: number) => label(`row ${i}`),
    $offset: OFFSET_PATH,
  });
}

// A virtual-list call rendered to its view tree.
export function vlView(opts: {
  count: number;
  rowHeight: number;
  gap?: number;
  overscan?: number;
  offset?: Vec2;
  viewport: Vec2;
}): EventElem {
  return render(vlCall(opts)) as EventElem;
}

// The view tree's translate nodes — the only nodes that place rows.
function translatesOf(view: EventElem): readonly TranslateNode[] {
  return (walk(view) as readonly (EventNode | null)[]).flatMap((n) =>
    n != null && !Array.isArray(n) && n.type === "translate" ? [n as TranslateNode] : [],
  );
}

// The "row <i>" index a translated label drawable carries — null for
// any other drawable.
function rowIndexOf(t: TranslateNode): number | null {
  const d = t.drawable as { type?: string; text?: string } | null | undefined;
  if (d == null || d.type !== "label") return null;
  return d.text !== undefined && d.text.startsWith("row ")
    ? Number(d.text.slice(4))
    : null;
}

// The drawn rows: every row-translate in the tree, as (index, y) — the
// row renderer's "row <i>" label identifies the index it drew.
export function drawnRows(view: EventElem): readonly (readonly [number, number])[] {
  return translatesOf(view).flatMap((t) => {
    const i = rowIndexOf(t);
    return i === null ? [] : [[i, t.y] as const];
  });
}

// The rows that actually intersect the viewport [oy, oy + vh) — the
// independent O(count) derivation the window bounds are checked against.
export function intersecting(
  count: number,
  rowHeight: number,
  gap: number,
  oy: number,
  vh: number,
): readonly number[] {
  const step = rowHeight + gap;
  const hits: number[] = [];
  for (let i = 0; i < count; i++) {
    if (i * step < oy + vh && i * step + rowHeight > oy) hits.push(i);
  }
  return hits;
}

// The expected PADDED window as an independent interval scan: the rows
// whose arithmetic start sits in the viewport interval widened by one
// pitch per overscan row, open on both ends. Unlike intersect-then-pad
// derivations this stays exact when the intersection is EMPTY (a
// viewport inside a gap or aligned on a row boundary): the pad then
// hangs off the viewport edges and yields the adjacent rows — the same
// rule that reaches back to the tail rows past the content end
// (components.virtual_list.overscan_pads_empty).
export function intervalWindow(
  count: number,
  rowHeight: number,
  gap: number,
  oy: number,
  vh: number,
  overscan: number,
): readonly number[] {
  const pitch = rowHeight + gap;
  const rows: number[] = [];
  for (let i = 0; i < count; i++) {
    const y = i * pitch;
    if (y > oy - rowHeight - overscan * pitch && y < oy + vh + overscan * pitch) {
      rows.push(i);
    }
  }
  return rows;
}
