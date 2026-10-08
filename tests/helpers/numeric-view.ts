// Purpose: the shared view-tree walker of the components.numeric
//   contract tests — every node satisfying a predicate with its
//   absolute origin, collected via children() plus translate offsets.
// Responsibilities: nodeOrigins and its decomposed walk steps (group,
//   translate, record + wrapper drawables).
// Rationale: specs/components-numeric.md is the design authority. Split
//   from components-numeric.test.ts so both the counter and the slider
//   files reuse it without duplication (tambor-272).

import { isGroup, type Elem, type Label, type Node, type Vec2 } from "../../src/views/model.ts";

// Every node in the tree satisfying pred, with its absolute origin,
// collected via children() plus the translate offsets.
export function nodeOrigins(
  elem: Elem,
  pred: (n: Node) => boolean,
  ox = 0,
  oy = 0,
  out: [Node, Vec2][] = [],
): [Node, Vec2][] {
  if (elem == null) return out;
  if (isGroup(elem)) return groupOrigins(elem, pred, ox, oy, out);
  return nodeOriginsNode(elem as Node, pred, ox, oy, out);
}

function groupOrigins(
  group: readonly Elem[],
  pred: (n: Node) => boolean,
  ox: number,
  oy: number,
  out: [Node, Vec2][],
): [Node, Vec2][] {
  for (const child of group) nodeOrigins(child, pred, ox, oy, out);
  return out;
}

function nodeOriginsNode(
  node: Node,
  pred: (n: Node) => boolean,
  ox: number,
  oy: number,
  out: [Node, Vec2][],
): [Node, Vec2][] {
  if (node.type === "translate") {
    return nodeOrigins((node as { drawable: Elem }).drawable, pred, ox + (node as { x: number }).x, oy + (node as { y: number }).y, out);
  }
  return nodeOriginsRest(node, pred, ox, oy, out);
}

function nodeOriginsRest(
  node: Node,
  pred: (n: Node) => boolean,
  ox: number,
  oy: number,
  out: [Node, Vec2][],
): [Node, Vec2][] {
  if (pred(node)) out.push([node, [ox, oy]]);
  recordWrapperChildren(node, pred, ox, oy, out);
  return out;
}

// wrapper nodes (handler, with-color, with-style, with-stroke-width)
// carry drawables; the walk continues through them
function recordWrapperChildren(
  node: Node,
  pred: (n: Node) => boolean,
  ox: number,
  oy: number,
  out: [Node, Vec2][],
): void {
  const drawables = (node as unknown as { drawables?: readonly Elem[] }).drawables;
  if (drawables === undefined) return;
  for (const child of drawables) nodeOrigins(child, pred, ox, oy, out);
}

const isLabel = (n: Node): n is Label => n.type === "label";

