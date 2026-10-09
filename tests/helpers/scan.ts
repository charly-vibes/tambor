// Purpose: shared tree scans for the contract tests — finding nodes of
//   one type across the view and event layers, and context-aware scans
//   that track each node's absolute origin and ancestor flags.
// Responsibilities: findAll performs a depth-first scan for nodes of a
//   single type, reusing descendantsOf from src/ui/overflow.ts (the
//   corpus's own event-layer-aware child query) instead of
//   re-implementing the walk; scanOf walks a whole element tree and
//   reports every drawable node with its absolute origin plus the
//   ancestor context the corpus predicates name (under a gray
//   with-color wrapper, under a clickability handler).
// Rationale: openspec/specs/ui-mobile/spec.md and openspec/specs/example-todo/spec.md are the
//   design authorities; tambor-272 redistributes the former monolithic
//   tests/ui-mobile.test.ts and tests/example-todo.test.ts into topic
//   files, and every walker here keeps cyclomatic complexity ≤ 3 by
//   pushing each decision into its own small named function.

import { descendantsOf } from "../../src/ui/overflow.ts";
import type { Elem, Node, Vec2 } from "../../src/views/model.ts";
import { children, isGroup } from "../../src/views/model.ts";

// A node's contribution to a type scan: itself when it matches, else
// its descendants scanned recursively.
function matchOrRecurse(node: Node, type: string): readonly Node[] {
  if (node.type === type) return [node];
  return descendantsOf(node).flatMap((child) => findAll(child, type));
}

// Depth-first scan for nodes of one type.
function findAll(elem: unknown, type: string): readonly Node[] {
  if (elem == null) return [];
  if (Array.isArray(elem)) return elem.flatMap((child) => findAll(child, type));
  return matchOrRecurse(elem as Node, type);
}

// ---------------------------------------------------------------------------
// Context-aware scan: every drawable node with its absolute origin and
// the underColor/underHandler ancestor flags.
// ---------------------------------------------------------------------------

// One node found in a tree walk: the node, its absolute origin, and the
// ancestor context the corpus predicates name (gray wrapper, clickability).
export interface Found {
  readonly node: Node;
  readonly x: number;
  readonly y: number;
  readonly underColor: boolean;
  readonly underHandler: boolean;
}

// The ancestor flags carried down the walk.
interface Flags {
  readonly color: boolean;
  readonly handler: boolean;
}

const NO_FLAGS: Flags = { color: false, handler: false };

// A node's type tag: event-layer nodes (wrap/bubble) carry drawables
// that views/model children() does not know about; their type tag is
// outside the Node union, so it is read through a cast.
function kindOf(node: Node): string {
  return (node as unknown as { type?: string }).type ?? "";
}

// The event-layer drawables of a wrap or bubble node.
function drawablesOf(node: Node): readonly Elem[] {
  return (node as unknown as { drawables?: readonly Elem[] }).drawables ?? [];
}

// Event-layer nodes dispatch through their drawables instead of the
// model's child query.
function isEventLayer(node: Node): boolean {
  const kind = kindOf(node);
  return kind === "wrap" || kind === "bubble";
}

// The flags a node passes to its children: inherited, plus the node's
// own with-color wrapper or handler contribution.
function flagsUnder(node: Node, flags: Flags): Flags {
  return {
    color: flags.color || node.type === "with-color",
    handler: flags.handler || node.type === "handler",
  };
}

// A translate node's local offset; every other node offsets by nothing.
function offsetOf(node: Node): Vec2 {
  return node.type === "translate" ? [node.x, node.y] : [0, 0];
}

// A group's children walked in order at an unchanged origin.
function walkGroup(group: readonly Elem[], ox: number, oy: number, flags: Flags, out: Found[]): void {
  for (const child of group) walkElem(child, ox, oy, flags, out);
}

// A drawable node: record it with its context, then walk the model's
// children at the translated origin.
function walkNode(elem: Elem, ox: number, oy: number, flags: Flags, out: Found[]): void {
  const node = elem as Node;
  if (isEventLayer(node)) {
    walkEventLayer(node, ox, oy, flags, out);
    return;
  }
  const under = flagsUnder(node, flags);
  out.push({ node, x: ox, y: oy, underColor: under.color, underHandler: under.handler });
  const [dx, dy] = offsetOf(node);
  for (const child of children(node)) walkElem(child, ox + dx, oy + dy, under, out);
}

// Event-layer nodes (wrap/bubble) carry drawables that views/model
// children() does not know about.
function walkEventLayer(node: Node, ox: number, oy: number, flags: Flags, out: Found[]): void {
  for (const child of drawablesOf(node)) walkElem(child, ox, oy, flags, out);
}

// One element of the tree: null, group, or drawable node.
function walkElem(elem: Elem, ox: number, oy: number, flags: Flags, out: Found[]): void {
  if (elem == null) return;
  if (isGroup(elem)) walkGroup(elem, ox, oy, flags, out);
  else walkNode(elem, ox, oy, flags, out);
}

// Context-aware scan of a whole element tree, in document order.
export function scanOf(root: Elem): readonly Found[] {
  const out: Found[] = [];
  walkElem(root, 0, 0, NO_FLAGS, out);
  return out;
}

// The first scan match satisfying a predicate.
export function findNode(root: Elem, pred: (f: Found) => boolean): Found | undefined {
  return scanOf(root).find(pred);
}

export { findAll };
