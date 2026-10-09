// Purpose: the hit-slop layer of the event router — on touch, a hit
//   target smaller than 44 by 44 receives pointer events inside a 44 by
//   44 region centred on it, without changing its drawn size or its
//   layout bounds, and overlapping slop regions resolve to the target
//   whose centre is nearest the touch point.
// Responsibilities: touchTargets(elem) scans the interactive targets of
//   a tree with their absolute origins; slopRegion computes the padded
//   hit region; pickTarget resolves containment and nearest centre;
//   slopDispatch(elem, event) routes touch pointer events through the
//   slop layer and passes everything else to the plain dispatcher.
// Rationale: openspec/specs/ui-mobile/spec.md hit_slop and slop_resolves_overlap are
//   the design authority. The 44-by-44 minimum and the unchanged drawn
//   size are hit_slop's own words (the per-axis maximum matches the
//   host query in app/touch.ts, which draws nothing). Delivery mirrors
//   event.model's terminal delivery for the winning target — the
//   drawn-bounds gate of dispatch is replaced by the slop-region gate,
//   which is exactly what hit_slop states — and the handler receives
//   the local position first and the event object second
//   (local_pos_passed, with the additive event argument per the K5
//   ruling). Ties in the nearest-centre rule resolve to the first
//   target in tree order, deterministically. No behavior beyond the
//   corpus.

import {
  bounds,
  children,
  type ButtonNode,
  type HandlerNode,
  type Node,
  type Vec2,
} from "../views/model.ts";
import { dispatch } from "../events/dispatch.ts";
import type { EventElem, IntentList } from "../events/bubble.ts";
import type { TamborEvent } from "../events/event.ts";
import { MIN_TARGET } from "../app/touch.ts";

// The slop minimum (ui.mobile.hit_slop), the same number the host
// target-size query enforces.
export const SLOP_TARGET = MIN_TARGET;

// The pointer kinds the slop router reroutes; every other event goes
// through the plain dispatcher untouched.
const POINTER_KINDS: readonly string[] = [
  "mouse-down",
  "mouse-up",
  "mouse-move",
  "scroll",
  "drop",
];

// One interactive target: a button or handler node together with its
// absolute origin in the tree it was scanned from.
export interface TouchTarget {
  readonly node: ButtonNode | HandlerNode;
  readonly origin: Vec2;
}

// Descendants of a node across the view and event layers: the event
// layer's bubble/wrap nodes carry drawables that views/model
// children() does not know about.
function descendantsOf(node: Node): readonly unknown[] {
  const d = (node as { drawables?: readonly unknown[] }).drawables;
  if (Array.isArray(d)) return d;
  if (node.type === "translate") return [(node as { drawable: unknown }).drawable];
  return children(node);
}

// Every interactive target of a tree, in tree order, with absolute
// origins accumulated through translates.
export function touchTargets(elem: unknown): readonly TouchTarget[] {
  const out: TouchTarget[] = [];
  const walk = (e: unknown, ox: number, oy: number): void => {
    if (e == null) return;
    if (Array.isArray(e)) {
      for (const child of e) walk(child, ox, oy);
      return;
    }
    const node = e as Node;
    if (node.type === "button" || node.type === "handler") {
      out.push({ node, origin: [ox, oy] });
    }
    let dx = 0;
    let dy = 0;
    if (node.type === "translate") {
      dx = node.x;
      dy = node.y;
    }
    for (const child of descendantsOf(node)) walk(child, ox + dx, oy + dy);
  };
  walk(elem, 0, 0);
  return out;
}

// The padded hit region of a target: a 44-by-44 box centred on the
// drawn-bounds centre, widened where the drawn size already exceeds
// 44 on an axis. The drawn size and the layout bounds of the node
// itself are never changed (hit_slop).
export interface SloRegion {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function slopRegion(target: TouchTarget): SloRegion {
  const [w, h] = bounds(target.node);
  const cx = target.origin[0] + w / 2;
  const cy = target.origin[1] + h / 2;
  const halfW = Math.max(w, SLOP_TARGET) / 2;
  const halfH = Math.max(h, SLOP_TARGET) / 2;
  return {
    minX: cx - halfW,
    minY: cy - halfH,
    maxX: cx + halfW,
    maxY: cy + halfH,
  };
}

// The target whose slop region contains the point and whose centre is
// nearest to it (slop_resolves_overlap); ties resolve to the first
// target in tree order. Null when no region contains the point.
export function pickTarget(
  targets: readonly TouchTarget[],
  pos: Vec2,
): TouchTarget | null {
  let best: TouchTarget | null = null;
  let bestD2 = Infinity;
  for (const target of targets) {
    const r = slopRegion(target);
    if (pos[0] < r.minX || pos[0] > r.maxX || pos[1] < r.minY || pos[1] > r.maxY) {
      continue;
    }
    const [w, h] = bounds(target.node);
    const dx = pos[0] - (target.origin[0] + w / 2);
    const dy = pos[1] - (target.origin[1] + h / 2);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      best = target;
      bestD2 = d2;
    }
  }
  return best;
}

// Deliver the mapped pointer event to the winning target: the same
// terminal delivery event.model gives a matching handler or button,
// with the drawn-bounds gate replaced by the slop-region gate. A
// handler whose event type does not match forwards to its children, as
// up_handler_descends does without the bounds gate.
function deliver(target: TouchTarget, event: TamborEvent): IntentList {
  const pos = event.pos ?? [0, 0];
  const local: Vec2 = [pos[0] - target.origin[0], pos[1] - target.origin[1]];
  if (target.node.type === "button") {
    return target.node.onClick ? (target.node.onClick(local) as IntentList) ?? [] : [];
  }
  if (target.node.eventType === event.type) {
    const result = (target.node.handler as (p: Vec2, e: TamborEvent) => unknown)(local, event);
    return result == null ? [] : (result as IntentList);
  }
  return dispatch(target.node.drawables as EventElem, event);
}

// Route an event through the slop layer: touch pointer events resolve
// their target by slop region and nearest centre; every other event —
// mouse input, keys, anything without the touch pointer type — goes
// through the plain dispatcher unchanged.
export function slopDispatch(elem: unknown, event: TamborEvent): IntentList {
  if (event.pointerType === "touch" && POINTER_KINDS.includes(event.type)) {
    const winner = pickTarget(touchTargets(elem), event.pos ?? [0, 0]);
    if (winner === null) return [];
    return deliver(winner, event);
  }
  return dispatch(elem as EventElem, event);
}
