// Purpose: executable contract tests for the view-model spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/view-model.md is the design authority; each
//   predicate here mirrors a Properties row of that spec.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  bounds,
  button,
  checkbox,
  children,
  label,
  makeNode,
  on,
  origin,
  rectangle,
  roundedRectangle,
  path,
  setHeight,
  setWidth,
  spacer,
  translate,
  withColor,
  withStyle,
  withStrokeWidth,
  type Color,
  type Elem,
  type MeasureFn,
  type Node,
  type Style,
  type Vec2,
} from "../src/views/model.ts";

// Inert handler — handler wrappers carry it as data; dispatch is T2/T3.
const noopHandler = (): null => null;

// Deterministic headless text measure (stub) — text_measure_injected
// says label size comes from an injected measure function.
const stubMeasure: MeasureFn = (text) => [text.length, 1];

// Random node arbitrary over the converted node types (generator for
// p_frozen, p_bounds, p_origin, p_roundtrip).
const nodeArb: fc.Arbitrary<Node> = fc.letrec((tie) => {
  const node = tie("node") as fc.Arbitrary<Node>;
  return {
    leaf: fc.oneof(
      fc.constant(label("hi", stubMeasure)),
      fc.constant(rectangle(3, 4)),
      fc.constant(roundedRectangle(5, 6, 1)),
      fc.constant(path([0, 0], [2, 3])),
      fc.constant(spacer(2, 3)),
      fc.constant(button("ok")),
      fc.constant(checkbox(true)),
      fc.constant(checkbox(false)),
    ),
    wrap: fc.oneof(
      node.map((c) => withColor([0.1, 0.2, 0.3], c)),
      node.map((c) => withStyle("stroke", c)),
      node.map((c) => withStrokeWidth(2, c)),
      node.map((c) => on("mouse-down", noopHandler, c)),
    ),
    branch: fc
      .tuple(fc.nat(50), fc.nat(50), node)
      .map(([x, y, c]) => translate(x, y, c)),
    node: fc.oneof(tie("leaf"), tie("wrap"), tie("branch")),
  };
}).node as fc.Arbitrary<Node>;

// Non-offset nodes (p_origin generator): no Translate anywhere.
const nonOffsetArb: fc.Arbitrary<Node> = fc.letrec((tie) => {
  const node = tie("node") as fc.Arbitrary<Node>;
  return {
    leaf: fc.oneof(
      fc.constant(label("hi", stubMeasure)),
      fc.constant(rectangle(3, 4)),
      fc.constant(spacer(2, 3)),
    ),
    wrap: fc.oneof(
      node.map((c) => withColor([0.4, 0.5, 0.6], c)),
      node.map((c) => withStyle("fill", c)),
      node.map((c) => withStrokeWidth(3, c)),
    ),
    node: fc.oneof(tie("leaf"), tie("wrap")),
  };
}).node as fc.Arbitrary<Node>;

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
    handler: "eventType",
    button: "text",
    checkbox: "checked",
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
// equal child bounds (membrane child-bounds: the drawable's origin plus
// its bounds, so the translate's own offset shows up as origin and not
// as size)
it("p_translate: origin equals [x, y] and bounds equal child bounds", () => {
  const childBounds = (elem: Elem): Vec2 => {
    const [ox, oy] = origin(elem);
    const [w, h] = bounds(elem);
    return [ox + w, oy + h];
  };
  fc.assert(
    fc.property(fc.nat(100), fc.nat(100), nodeArb, (x, y, child) => {
      const node = translate(x, y, child);
      expect(origin(node)).toEqual([x, y]);
      expect(bounds(node)).toEqual(childBounds(child));
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

// p_button_bounds — derives_from: view.model.button_bounds
// generator: random label text — predicate: bounds equal label bounds
// plus [12, 12]
it("p_button_bounds: bounds equal label bounds plus [12, 12]", () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 30 }), (text) => {
      const [lw, lh] = bounds(label(text));
      expect(bounds(button(text))).toEqual([lw + 12, lh + 12]);
    }),
  );
});

// p_set_size — derives_from: view.model.set_size_single_child
// generator: wrappers with one and two children — predicate: one child
// succeeds and two children throws
it("p_set_size: one child succeeds and two children throws", () => {
  fc.assert(
    fc.property(fc.nat(100), fc.nat(100), (w, h) => {
      const one = on("mouse-down", noopHandler, rectangle(3, 4));
      expect(bounds(setWidth(one, w))).toEqual([w, 4]);
      expect(bounds(setHeight(one, h))).toEqual([3, h]);
      const two = on("mouse-down", noopHandler, rectangle(3, 4), rectangle(5, 6));
      expect(() => setWidth(two, w)).toThrow();
      expect(() => setHeight(two, h)).toThrow();
    }),
  );
});

// The check path of the ui checkbox (checkbox_geometry).
const CHECK_PATH: readonly Vec2[] = [
  [2, 6],
  [5, 9],
  [10, 2],
];

function hasCheckPath(elem: Elem): boolean {
  for (const e of walk(elem)) {
    if (e !== null && e !== undefined && "type" in e && e.type === "path") {
      if (JSON.stringify(e.points) === JSON.stringify(CHECK_PATH)) return true;
    }
  }
  return false;
}

// p_checkbox_geometry — derives_from: view.model.checkbox_geometry
// generator: checked true and false — predicate: bounds are 12 by 12 in
// both states and only the checked view has the check path
it("p_checkbox_geometry: bounds are 12 by 12 in both states and only the checked view has the check path", () => {
  fc.assert(
    fc.property(fc.boolean(), (checked) => {
      const cb = checkbox(checked);
      expect(bounds(cb)).toEqual([12, 12]);
      expect(hasCheckPath(cb)).toBe(checked);
    }),
  );
});

// p_style — derives_from: view.model.style_wrappers_transparent
// generator: random colors and styles — predicate: bounds equal the
// unwrapped bounds
it("p_style: bounds equal the unwrapped bounds", () => {
  const colorArb: fc.Arbitrary<Color> = fc.array(
    fc.float({ min: 0, max: 1, noNaN: true }),
    { minLength: 3, maxLength: 4 },
  );
  const styleArb: fc.Arbitrary<Style> = fc.constantFrom(
    "fill",
    "stroke",
    "stroke-and-fill",
  );
  // The generator varies colors and styles; the wrapped child is a
  // non-offset node so the wrapper's bounds are directly comparable.
  fc.assert(
    fc.property(colorArb, styleArb, fc.nat(5), nonOffsetArb, (color, style, sw, child) => {
      expect(bounds(withColor(color, child))).toEqual(bounds(child));
      expect(bounds(withStyle(style, child))).toEqual(bounds(child));
      expect(bounds(withStrokeWidth(sw, child))).toEqual(bounds(child));
    }),
  );
});
