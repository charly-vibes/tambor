// Purpose: the touch-target host query of the corpus — hit areas of at
//   least 44 by 44 on touch devices, without changing drawn size or layout.
// Responsibilities: hitTargetSize(node, touch) — the effective hit area of
//   an interactive node: its drawn bounds on a mouse host, padded up to the
//   44-by-44 minimum on a touch host — and interactiveNodes(elem), the scan
//   of every interactive node in a tree (the root spec's "all interactive
//   nodes" generator).
// Rationale: specs/example-counter.md counter_touch_target ("the more
//   button has a hit area of at least 44 by 44 on touch devices") and
//   specs/tambor.md mobile_first are the design authority; the 44-by-44
//   minimum and the unchanged drawn size come from ui.mobile.hit_slop.
//   This module is a pure query only: slop-region event routing and
//   overlap resolution are the ui.mobile router layer, not this module.
//   No behavior beyond the corpus.

import { bounds, children, isGroup, type Elem, type Node, type Vec2 } from "../views/model.ts";

// The minimum hit target on a touch device, in CSS px (ui.mobile.hit_slop).
export const MIN_TARGET = 44;

// The hit area of an interactive node: its drawn bounds on a mouse host;
// on a touch host, at least MIN_TARGET on each axis. The drawn size and
// the layout bounds of the node itself are never changed.
export function hitTargetSize(node: Node, touch: boolean): Vec2 {
  const [w, h] = bounds(node);
  if (!touch) return [w, h];
  return [Math.max(w, MIN_TARGET), Math.max(h, MIN_TARGET)];
}

// Every interactive node in a tree: buttons and handler nodes are the
// node kinds that handle pointer input (button_fires_on_down,
// down_handler_terminal). Groups, translates and style wrappers are
// traversed; drawable leaves are skipped.
export function interactiveNodes(elem: Elem): readonly Node[] {
  if (elem == null) return [];
  const self: readonly Node[] =
    !isGroup(elem) && (elem.type === "button" || elem.type === "handler") ? [elem] : [];
  const kids: readonly Node[] = children(elem).flatMap(interactiveNodes);
  return [...self, ...kids];
}
