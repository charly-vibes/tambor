// Purpose: backend.render contract tests for the accessibility mirror
//   and safe-area insets — one accessible node per interactive node and
//   content kept inside simulated insets.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property,
//   plus the local independent counters (interactive-node count and
//   button-label collection, computed without touching the a11y
//   module).
// Rationale: specs/backend-render.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). tambor-272 redistributes the former monolithic
//   tests/backend-render.test.ts into topic files; the tree counters
//   are decomposed so each decision lives in its own small named
//   function (cyclomatic ≤ 3), and inkOf is shared through
//   tests/helpers/backend-render.ts.

import { expect, it } from "vitest";
import fc from "fast-check";

import type { A11yNode } from "../src/render/a11y.ts";
import { CanvasBackend } from "../src/render/canvas.ts";
import type { Insets } from "../src/render/backend.ts";
import type { AnyDraw } from "../src/render/primitives.ts";
import {
  button,
  checkbox,
  label as labelNode,
  rectangle,
  translate,
  withColor,
  type Elem,
} from "../src/views/model.ts";
import { inkOf } from "./helpers/backend-render.ts";

// ---------------------------------------------------------------- helpers

// The node shape the counters walk: type plus the backend-side
// child fields.
type CountNode = {
  type: string;
  drawables?: readonly unknown[];
  drawable?: unknown;
  text?: string;
};

// Interactive types: buttons and checkboxes.
function isInteractive(type: string): boolean {
  return type === "button" || type === "checkbox";
}

// A translate's interactive count: its drawable when present, else 0.
function translateCount(node: CountNode): number {
  return node.drawable === undefined ? 0 : countInteractive(node.drawable as AnyDraw);
}

// A non-array node's interactive count: itself when interactive, else
// its children's counts.
function nodeCount(node: CountNode): number {
  if (isInteractive(node.type)) return 1;
  if (node.type === "translate") return translateCount(node);
  return drawablesCount(node);
}

// The interactive count over a node's drawables.
function drawablesCount(node: CountNode): number {
  return ((node.drawables ?? []) as readonly unknown[]).reduce(
    (sum: number, kid) => sum + countInteractive(kid as AnyDraw),
    0,
  );
}

// Independent interactive-node count for the a11y predicate: buttons
// and checkboxes, counted without touching the a11y module.
function countInteractive(elem: AnyDraw): number {
  if (elem == null) return 0;
  if (Array.isArray(elem)) {
    return (elem as readonly AnyDraw[]).reduce(
      (sum: number, child) => sum + countInteractive(child),
      0,
    );
  }
  return nodeCount(elem as CountNode);
}

// A button's label, when the node carries one.
function buttonLabel(node: CountNode, out: string[]): void {
  if (node.type === "button" && typeof node.text === "string") out.push(node.text);
}

// A translate's contribution: collect over its drawable when present.
function translateCollect(node: CountNode, out: string[]): void {
  if (node.type === "translate" && node.drawable !== undefined) {
    collectButtons(node.drawable as AnyDraw, out);
  }
}

// A non-array node's contribution: its own label then its children's.
function nodeCollect(node: CountNode, out: string[]): void {
  buttonLabel(node, out);
  translateCollect(node, out);
  for (const kid of (node.drawables ?? []) as readonly unknown[]) {
    collectButtons(kid as AnyDraw, out);
  }
}

// Collect the button labels independently of the a11y module.
function collectButtons(elem: AnyDraw, out: string[]): void {
  if (elem == null) return;
  if (Array.isArray(elem)) {
    (elem as readonly AnyDraw[]).forEach((child) => collectButtons(child, out));
    return;
  }
  nodeCollect(elem as CountNode, out);
}

// ---------------------------------------------------------------- tests

// p_a11y — derives_from: backend.render.a11y_mirror
// generator: views with buttons — predicate: one accessible node per interactive node
it("p_a11y: one accessible node per interactive node", () => {
  const leaf = fc.oneof(
    fc.constant(labelNode("inert") as AnyDraw),
    fc.constant(button("Save") as AnyDraw),
    fc.constant(button("Cancel") as AnyDraw),
    fc.constant(checkbox(true) as AnyDraw),
    fc.constant(checkbox(false) as AnyDraw),
  ) as fc.Arbitrary<Elem>;
  const build = (depth: number): fc.Arbitrary<Elem> => {
    if (depth <= 0) return leaf;
    const inner = (): fc.Arbitrary<Elem> => build(depth - 1);
    return fc.oneof(
      leaf,
      fc.tuple(inner(), inner()).map(([a, b]): Elem => [a, b]),
      fc.tuple(fc.nat(10), fc.nat(10), inner()).map(([x, y, d]): Elem => translate(x, y, d)),
      inner().map((d): Elem => withColor([0, 0, 1], d)),
    ) as fc.Arbitrary<Elem>;
  };
  const arbButtonView: fc.Arbitrary<AnyDraw> = build(3) as fc.Arbitrary<AnyDraw>;

  fc.assert(
    fc.property(arbButtonView, (view) => {
      const backend = new CanvasBackend({ containerSize: [200, 200] });
      backend.draw(view);
      const tree: readonly A11yNode[] = backend.a11y;
      const interactive = countInteractive(view);
      // one accessible node per interactive node
      expect(tree).toHaveLength(interactive);
      // the mirror names the buttons it mirrors
      const labels = tree
        .filter((n) => n.role === "button")
        .map((n) => n.label);
      const buttonLabels: string[] = [];
      collectButtons(view, buttonLabels);
      expect(labels).toEqual(buttonLabels);
    }),
  );
});

// p_safe_area — derives_from: backend.render.safe_area_respected
// generator: simulated insets — predicate: content stays inside the insets
it("p_safe_area: content stays inside the insets", () => {
  fc.assert(
    fc.property(fc.nat(10), fc.nat(10), fc.nat(10), fc.nat(10), (top, right, bottom, left) => {
      const insets: Insets = { top, right, bottom, left };
      const ink = inkOf({
        view: rectangle(100, 100),
        size: [100, 100],
        opts: { safeAreaInsets: insets },
      });
      expect(ink.inked).toBe(true);
      expect(ink.minX).toBeGreaterThanOrEqual(left);
      expect(ink.minY).toBeGreaterThanOrEqual(top);
      expect(ink.maxX).toBeLessThan(100 - right);
      expect(ink.maxY).toBeLessThan(100 - bottom);
    }),
  );
});