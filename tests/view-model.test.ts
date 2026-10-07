// Purpose: executable contract tests for the view-model spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/view-model.md is the design authority; each
//   predicate here mirrors a Properties row of that spec.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  bounds,
  children,
  label,
  makeNode,
  origin,
  rectangle,
  roundedRectangle,
  path,
  spacer,
  translate,
  withColor,
  withStyle,
  withStrokeWidth,
  type Elem,
  type MeasureFn,
  type Node,
  type Vec2,
} from "../src/views/model.ts";

// Deterministic headless text measure (stub) — text_measure_injected
// says label size comes from an injected measure function.
const stubMeasure: MeasureFn = (text) => [text.length, 1];

// Random node arbitrary over the converted node types (generator for
// p_frozen, p_bounds, p_origin, p_roundtrip).
const nodeArb: fc.Arbitrary<Node> = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.constant(label("hi", stubMeasure)),
    fc.constant(rectangle(3, 4)),
    fc.constant(roundedRectangle(5, 6, 1)),
    fc.constant(path([0, 0], [2, 3])),
    fc.constant(spacer(2, 3)),
  ),
  wrap: fc.oneof(
    tie("node").map((c: Node) => withColor([0.1, 0.2, 0.3], c)),
    tie("node").map((c: Node) => withStyle("stroke", c)),
    tie("node").map((c: Node) => withStrokeWidth(2, c)),
  ),
  branch: fc
    .tuple(fc.nat(50), fc.nat(50), tie("node"))
    .map(([x, y, c]) => translate(x, y, c)),
  node: fc.oneof(tie("leaf"), tie("wrap"), tie("branch")),
})).node as fc.Arbitrary<Node>;

// Non-offset nodes (p_origin generator): no Translate anywhere.
const nonOffsetArb: fc.Arbitrary<Node> = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.constant(label("hi", stubMeasure)),
    fc.constant(rectangle(3, 4)),
    fc.constant(spacer(2, 3)),
  ),
  wrap: fc.oneof(
    tie("node").map((c: Node) => withColor([0.4, 0.5, 0.6], c)),
    tie("node").map((c: Node) => withStyle("fill", c)),
    tie("node").map((c: Node) => withStrokeWidth(3, c)),
  ),
  node: fc.oneof(tie("leaf"), tie("wrap")),
})).node as fc.Arbitrary<Node>;

// Depth-first walk of an elem, yielding every node (groups flattened).
function* walk(elem: Elem): Generator<Elem> {
  if (elem == null) {
    yield elem;
    return;
  }
  if (Array.isArray(elem)) {
    for (const child of elem) yield* walk(child);
    return;
  }
  yield elem;
  for (const child of children(elem)) yield* walk(child);
}

// p_frozen — derives_from: view.model.immutable_nodes
// generator: random nodes — predicate: assigning to a node throws or is ignored
it("p_frozen: assigning to a node throws or is ignored", () => {
  const MUTABLE_FIELD: Record<Node["type"], string> = {
    label: "text",
    rectangle: "width",
    "rounded-rectangle": "width",
    path: "points",
    spacer: "x",
    translate: "x",
    "with-color": "color",
    "with-style": "style",
    "with-stroke-width": "strokeWidth",
  };
  fc.assert(
    fc.property(nodeArb, (node) => {
      const field = MUTABLE_FIELD[node.type];
      const target = node as unknown as Record<string, unknown>;
      const before = target[field];
      try {
        target[field] = "MUTATED-SENTINEL";
      } catch {
        // throws is one allowed outcome
      }
      expect(target[field]).toBe(before);

      // nested collections are frozen too
      const drawables = (node as { drawables?: readonly unknown[] }).drawables;
      if (drawables !== undefined) {
        const lenBefore = drawables.length;
        try {
          (drawables as unknown[]).push("MUTATED-SENTINEL");
        } catch {
          // throws is one allowed outcome
        }
        expect(drawables.length).toBe(lenBefore);
      }
      const points = (node as { points?: readonly unknown[] }).points;
      if (points !== undefined) {
        const lenBefore = points.length;
        try {
          (points as unknown[]).push("MUTATED-SENTINEL");
        } catch {
          // throws is one allowed outcome
        }
        expect(points.length).toBe(lenBefore);
      }
    }),
  );
});

// p_bounds — derives_from: view.model.bounds_total
// generator: random trees — predicate: all bounds are finite and
// non-negative, and bounds(nil) equals [0, 0]
it("p_bounds: all bounds are finite and non-negative, and bounds(nil) equals [0, 0]", () => {
  expect(bounds(null)).toEqual([0, 0]);
  fc.assert(
    fc.property(nodeArb, (node) => {
      for (const elem of walk(node)) {
        const [w, h] = bounds(elem);
        expect(Number.isFinite(w)).toBe(true);
        expect(Number.isFinite(h)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(h).toBeGreaterThanOrEqual(0);
      }
    }),
  );
});

// p_container — derives_from: view.model.container_bounds_max
// generator: children with random origins and sizes — predicate: bounds
// equal the max of origin plus size
it("p_container: bounds equal the max of origin plus size", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.tuple(fc.nat(50), fc.nat(50), fc.nat(100), fc.nat(100)),
        { minLength: 1, maxLength: 12 },
      ),
      (specs) => {
        const group = specs.map(([x, y, w, h]) =>
          translate(x, y, rectangle(w, h)),
        );
        const expectedW = Math.max(...specs.map((s) => s[0] + s[2]));
        const expectedH = Math.max(...specs.map((s) => s[1] + s[3]));
        expect(bounds(group)).toEqual([expectedW, expectedH]);
      },
    ),
  );
});

// p_translate — derives_from: view.model.translate_origin
// generator: random offsets — predicate: origin equals [x, y] and bounds
// equal child bounds
it("p_translate: origin equals [x, y] and bounds equal child bounds", () => {
  fc.assert(
    fc.property(fc.nat(100), fc.nat(100), nodeArb, (x, y, child) => {
      const node = translate(x, y, child);
      expect(origin(node)).toEqual([x, y]);
      expect(bounds(node)).toEqual(bounds(child));
    }),
  );
});

// p_origin — derives_from: view.model.origin_default
// generator: non-offset nodes — predicate: origin equals [0, 0]
it("p_origin: origin equals [0, 0] for non-offset nodes", () => {
  expect(origin(null)).toEqual([0, 0]);
  fc.assert(
    fc.property(nonOffsetArb, (node) => {
      expect(origin(node)).toEqual([0, 0]);
    }),
  );
});

// p_group — derives_from: view.model.group_is_node
// generator: vectors with nil members — predicate: children are the
// elements and nil members measure [0, 0]
it("p_group: children are the elements and nil members measure [0, 0]", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.constant(null as Elem),
          fc.nat(50).map((w) => rectangle(w, 3)),
        ),
        { maxLength: 10 },
      ),
      (elems) => {
        const [w, h] = bounds(elems);
        const present = elems.filter((e): e is Node => e !== null);
        const expectedW = Math.max(
          0,
          ...present.map((e) => origin(e)[0] + bounds(e)[0]),
        );
        const expectedH = Math.max(
          0,
          ...present.map((e) => origin(e)[1] + bounds(e)[1]),
        );
        expect([w, h] as Vec2).toEqual([expectedW, expectedH]);
        for (const e of elems) {
          if (e === null) expect(bounds(e)).toEqual([0, 0]);
        }
        expect(children(elems)).toEqual(elems);
      },
    ),
  );
  // nil behaves as an empty node
  expect(children(null)).toEqual([]);
  expect(makeNode(null, [])).toBe(null);
});

// p_roundtrip — derives_from: view.model.make_node_roundtrip
// generator: random trees — predicate: makeNode(n, children(n))
// deep-equals n
it("p_roundtrip: makeNode(n, children(n)) deep-equals n", () => {
  fc.assert(
    fc.property(nodeArb, (node) => {
      expect(makeNode(node, children(node))).toEqual(node);
    }),
  );
});

// p_measure — derives_from: view.model.text_measure_injected
// generator: stub measure fn — predicate: label bounds equal the stub
// output
it("p_measure: label bounds equal the stub output", () => {
  fc.assert(
    fc.property(fc.nat(500), fc.nat(500), (w, h) => {
      const measure: MeasureFn = () => [w, h];
      expect(bounds(label("any text", measure))).toEqual([w, h]);
    }),
  );
});
