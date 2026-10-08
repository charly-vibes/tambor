// Purpose: the overflow scan of the corpus — at 320 px width no content
//   is wider than the viewport unless inside a horizontal scrollview.
// Responsibilities: overflowNodes walks a tree accumulating absolute
//   positions and reports every node whose right edge extends past the
//   viewport width, skipping subtrees the caller marks as horizontal
//   scroll regions; locate finds a node's absolute origin.
// Rationale: specs/ui-mobile.md no_horizontal_overflow is the design
//   authority. The walk mirrors the event model's coordinate rule
//   (coords_translated: descending through Translate subtracts x and y
//   — here accumulated additively) and the view model's bounds
//   semantics (origin plus size per child, container_bounds_max). The
//   horizontal-scrollview exemption is stated by the invariant itself;
//   callers pass the identity of the region wrappers their view built.
//   No behavior beyond the corpus.

import { bounds, children, type Node, type Vec2 } from "../views/model.ts";

// One offending node: the node and the absolute right edge that
// extends past the viewport.
export interface OverflowNode {
  readonly node: Node;
  readonly right: number;
}

// Descendants of a node across the view and event layers: the event
// layer's bubble/wrap nodes carry drawables that views/model
// children() does not know about (and that bounds() cannot size).
// Exported for the test corpus's scans (tambor-272), which must reuse
// this walk rather than re-implement it.
export function descendantsOf(node: Node): readonly unknown[] {
  const d = (node as { drawables?: readonly unknown[] }).drawables;
  if (Array.isArray(d)) return d;
  if (node.type === "translate") return [(node as { drawable: unknown }).drawable];
  return children(node);
}

// Event-layer nodes (bubble/wrap) carry drawables but no drawn bounds
// of their own; their children pass through unchanged. A tree whose
// bounds cannot be computed through event-layer children contributes
// no extent of its own — its boundable descendants are recorded as the
// walk descends.
function extentOf(node: Node): number | null {
  const kind = (node as { type: string }).type;
  if (kind === "bubble" || kind === "wrap") return null;
  try {
    return bounds(node)[0];
  } catch {
    return null;
  }
}

// The child offset a node contributes to its descendants.
function offsetOf(node: Node): Vec2 {
  if ((node as { type: string }).type !== "translate") return [0, 0];
  const t = node as { x: number; y: number };
  return [t.x, t.y];
}

// Every node whose absolute right edge extends past width, excluding
// subtrees under an exempted node (the horizontal scroll regions).
export function overflowNodes(
  root: unknown,
  width: number,
  exempt?: (node: unknown) => boolean,
): readonly OverflowNode[] {
  const out: OverflowNode[] = [];
  const walk = (elem: unknown, ox: number, oy: number): void => {
    if (elem == null) return;
    if (Array.isArray(elem)) {
      for (const child of elem) walk(child, ox, oy);
      return;
    }
    if (exempt !== undefined && exempt(elem)) return;
    const node = elem as Node;
    const w = extentOf(node);
    if (w !== null && ox + w > width) out.push({ node, right: ox + w });
    const [dx, dy] = offsetOf(node);
    for (const child of descendantsOf(node)) walk(child, ox + dx, oy + dy);
  };
  walk(root, 0, 0);
  return out;
}

// The absolute origin of a node inside a tree, or null when absent.
export function locate(root: unknown, target: unknown): Vec2 | null {
  let found: Vec2 | null = null;
  const walk = (elem: unknown, ox: number, oy: number): void => {
    if (elem == null || found !== null) return;
    if (Array.isArray(elem)) {
      for (const child of elem) walk(child, ox, oy);
      return;
    }
    const node = elem as Node;
    if (node === target) {
      found = [ox, oy];
      return;
    }
    const [dx, dy] = offsetOf(node);
    for (const child of descendantsOf(node)) walk(child, ox + dx, oy + dy);
  };
  walk(root, 0, 0);
  return found;
}
