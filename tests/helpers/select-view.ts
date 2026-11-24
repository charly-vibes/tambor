// Purpose: the shared select-view helpers for the components.select
//   contract tests — the corpus scenario fixture and the drawn-tree
//   traversal/predicate kit both select test files drive.
// Responsibilities: the this/that/the-other OPTIONS fixture with its
//   selected/extra scratch paths; dropdownView/listView render the
//   dropdown and the bare dropdown-list against scratch-tree state;
//   applyEffects runs a returned batch through the dispatcher's builtin
//   handler; collect/placedNodes walk the drawn Elem tree with the
//   node-type predicates; colorsEqual is the strict fill comparison.
// Rationale: openspec/specs/components-select/spec.md is the design
//   authority. Split out of tests/components-select.test.ts when the
//   400-line test-file gate tripped (p_geometry/p_touch_rows moved to
//   components-select-rows.test.ts); both halves need the same fixture
//   and traversal, so it lives here instead of being duplicated.

import { call, render } from "../../src/model/component.ts";
import { defaultHandler, type Effect } from "../../src/effects/dispatch.ts";
import type { Path } from "../../src/effects/paths.ts";
import {
  children,
  isGroup,
  type Color,
  type Elem,
  type Label,
  type Node,
  type TranslateNode,
  type WithColorNode,
} from "../../src/views/model.ts";
import { dropdownList } from "../../src/components/select/list.ts";
import { dropdown } from "../../src/components/select/dropdown.ts";

// options is a vector of [value, label] pairs — the corpus scenario's
// "this, that, the-other".
export type Option = readonly [value: unknown, label: string];
export const OPTIONS: readonly Option[] = [
  ["this", "This"],
  ["that", "That"],
  ["the-other", "The Other"],
];
export const $SELECTED: Path = [["keypath", "selected"]];
const EXTRA_ROOT: Path = [["keypath", "::extra"]];

// Render the dropdown against an app state whose scratch trees are the
// root ::extra entries (component.model top-level-ui semantics).
export function dropdownView(
  state: unknown,
  selected: unknown,
  extraArgs: Record<string, unknown> = {},
): Elem {
  const s = state as Record<string, unknown>;
  return render(
    call(
      dropdown,
      { selected, options: OPTIONS, $selected: $SELECTED, ...extraArgs },
      { extra: s["::extra"], $extra: EXTRA_ROOT },
    ),
  ) as Elem;
}

// Apply a returned effect batch to an app state (the dispatcher's
// builtin handler).
export function applyEffects(state: unknown, effects: readonly unknown[]): unknown {
  return defaultHandler(state, effects as readonly Effect[], {});
}

// Render the dropdown-list on its own (the raw row effects are visible
// before the dropdown's interception).
export function listView(
  selected: unknown,
  extra: Record<string, unknown> = {},
  touch = false,
): Elem {
  return render(
    call(dropdownList, { selected, options: OPTIONS, $selected: $SELECTED, touch, extra, $extra: EXTRA_ROOT }),
  ) as Elem;
}

// Every node in the tree satisfying pred, collected via children().
export function collect<T extends Node>(elem: Elem, pred: (n: Node) => n is T): T[] {
  const out: T[] = [];
  collectInto(elem, pred, out);
  return out;
}

function collectInto<T extends Node>(elem: Elem, pred: (n: Node) => n is T, out: T[]): void {
  if (elem == null) return;
  if (isGroup(elem)) {
    collectAll(elem, pred, out);
    return;
  }
  collectMatch(elem as Node, pred, out);
}

function collectAll<T extends Node>(group: readonly Elem[], pred: (n: Node) => n is T, out: T[]): void {
  for (const child of group) collectInto(child, pred, out);
}

function collectMatch<T extends Node>(node: Node, pred: (n: Node) => n is T, out: T[]): void {
  if (pred(node)) out.push(node as T);
  collectAll(children(node), pred, out);
}

export const isListNode = (n: Node): n is Node & { type: "rounded-rectangle" } =>
  n.type === "rounded-rectangle";
export const isRect = (n: Node): n is Node & { type: "rectangle" } => n.type === "rectangle";
export const isLabel = (n: Node): n is Label => n.type === "label";
export const isWithColor = (n: Node): n is WithColorNode => n.type === "with-color";
export const isTranslate = (n: Node): n is TranslateNode => n.type === "translate";

// A node paired with the y its translate ancestors give it. Painters
// superimpose bare-sequence children at the same origin, so only
// translate offsets separate the drawn positions.
export interface Placed<T extends Node> {
  readonly node: T;
  readonly y: number;
}

// A node's drawn y: a translate moves its drawable; every other node
// sits at its parent's offset.
function placedY(node: Node, dy: number): number {
  return node.type === "translate" ? dy + (node as TranslateNode).y : dy;
}

export function placedNodes<T extends Node>(
  elem: Elem,
  pred: (n: Node) => n is T,
  dy = 0,
): Placed<T>[] {
  if (elem == null) return [];
  if (isGroup(elem)) return elem.flatMap((child) => placedNodes(child, pred, dy));
  const node = elem as Node;
  const y = placedY(node, dy);
  const out: Placed<T>[] = pred(node) ? [{ node: node as T, y }] : [];
  for (const child of children(node)) out.push(...placedNodes(child, pred, y));
  return out;
}

export function colorsEqual(a: Color, b: Color): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
