// Purpose: executable contract tests for event-model hit-testing rows.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/event-model.md is the design authority; each
//   predicate here mirrors a Properties row of that spec — hit-testing
//   is half-open, handlers see local coords, and button fires on down.

import { expect, it } from "vitest";
import fc from "fast-check";

import { button, on, spacer, translate, type Elem, type HandlerNode, type Vec2 } from "../src/views/model.ts";
import { mouseDown, mouseUp } from "../src/events/event.ts";
import { dispatch } from "../src/events/dispatch.ts";

// p_half_open — derives_from: event.model.hit_half_open
// generator: spacer(20, 20) probed at 0, 19, 20 and -1
// predicate: positions 0 and 19 hit and 20 and -1 miss
it("p_half_open: positions 0 and 19 hit and 20 and -1 miss", () => {
  // The spec's example probe must hold verbatim: a 20x20 hit region
  // accepts 0 and 19 and rejects 20 and -1 (right/bottom edges exclusive).
  const view = onHitRecorder().node;
  expect(dispatch(view, mouseDown([0, 0]))).toEqual([["hit"]]);
  expect(dispatch(view, mouseDown([19, 0]))).toEqual([["hit"]]);
  expect(dispatch(view, mouseDown([20, 0]))).toEqual([]);
  expect(dispatch(view, mouseDown([-1, 0]))).toEqual([]);
  expect(dispatch(view, mouseDown([0, 19]))).toEqual([["hit"]]);
  expect(dispatch(view, mouseDown([0, 20]))).toEqual([]);
  expect(dispatch(view, mouseDown([0, -1]))).toEqual([]);

  // Generalized property: for any size, interior points hit and the
  // exclusive edges (width, height, -1) miss.
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 60 }),
      fc.integer({ min: 1, max: 60 }),
      fc.nat(59),
      fc.nat(59),
      (w, h, ix, iy) => {
        const hitView = onHitRecorder(w, h).node;
        expect(dispatch(hitView, mouseDown([ix % w, iy % h]))).toEqual([["hit"]]);
        expect(dispatch(hitView, mouseDown([w, iy % h]))).toEqual([]);
        expect(dispatch(hitView, mouseDown([ix % w, h]))).toEqual([]);
        expect(dispatch(hitView, mouseDown([-1, iy % h]))).toEqual([]);
        expect(dispatch(hitView, mouseDown([ix % w, -1]))).toEqual([]);
      },
    ),
  );
});

// Local hit-test fixture: a handler node whose drawable sizes the hit
// region; every accepted mouse-down is recorded and returns [["hit"]].
function onHitRecorder(w = 20, h = 20): { node: HandlerNode; seen: Vec2[] } {
  const seen: Vec2[] = [];
  const node = on("mouse-down", (pos: unknown) => {
    seen.push(pos as Vec2);
    return [["hit"]];
  }, spacer(w, h));
  return { node, seen };
}

// p_local — derives_from: event.model.local_pos_passed
// generator: handler at translate(10, 10) probed at [15, 15]
// predicate: handler sees [5, 5] and README returns the intent [:say-hello]
it("p_local: handler sees [5, 5] and README returns the intent [:say-hello]", () => {
  const seen: Vec2[] = [];
  const handler = on("mouse-down", (pos: unknown) => {
    seen.push(pos as Vec2);
    return [["say-hello"]];
  }, spacer(20, 20));
  const view = translate(10, 10, handler);
  expect(dispatch(view, mouseDown([15, 15]))).toEqual([["say-hello"]]);
  expect(seen).toEqual([[5, 5]]);

  // Generalized property: the handler always sees the probe minus the
  // translate offsets.
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 40 }),
      fc.integer({ min: 0, max: 40 }),
      fc.nat(19),
      fc.nat(19),
      (ox, oy, ax, ay) => {
        const { node, seen } = onHitRecorder();
        const tree = translate(ox, oy, node);
        expect(dispatch(tree, mouseDown([ox + ax, oy + ay]))).toEqual([["hit"]]);
        expect(seen).toEqual([[ax, ay]]);
      },
    ),
  );
});

// p_coords — derives_from: event.model.coords_translated
// generator: nested translates
// predicate: handler sees the point minus the sum of offsets
it("p_coords: handler sees the point minus the sum of offsets", () => {
  const { node, seen } = onHitRecorder();
  const view = translate(3, 4, translate(5, 6, node));
  expect(dispatch(view, mouseDown([10, 13]))).toEqual([["hit"]]);
  expect(seen).toEqual([[2, 3]]);

  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.nat(9),
      fc.nat(9),
      (x1, y1, x2, y2, ax, ay) => {
        const { node, seen } = onHitRecorder();
        const tree = translate(x1, y1, translate(x2, y2, node));
        expect(dispatch(tree, mouseDown([x1 + x2 + ax, y1 + y2 + ay]))).toEqual([["hit"]]);
        expect(seen).toEqual([[ax, ay]]);
      },
    ),
  );
});

// p_outside — derives_from: event.model.outside_bounds_nil
// generator: points outside all nodes
// predicate: result is empty
it("p_outside: result is empty", () => {
  const view: readonly Elem[] = [
    on("mouse-down", () => [["a"]], spacer(10, 10)),
    translate(20, 20, on("mouse-down", () => [["b"]], spacer(10, 10))),
  ];
  expect(dispatch(view, mouseDown([50, 50]))).toEqual([]);
  expect(dispatch(view, mouseDown([-5, 5]))).toEqual([]);
  expect(dispatch(view, mouseDown([15, 15]))).toEqual([]);

  // Generalized property: probes beyond every node's bounds yield no
  // intents from any node.
  fc.assert(
    fc.property(fc.nat(200), fc.nat(200), (farX, farY) => {
      const tree: readonly Elem[] = [
        on("mouse-down", () => [["a"]], spacer(10, 10)),
        translate(20, 20, on("mouse-down", () => [["b"]], spacer(10, 10))),
      ];
      const probe: Vec2 = [40 + farX, 40 + farY];
      expect(dispatch(tree, mouseDown(probe))).toEqual([]);
    }),
  );
});

// p_button — derives_from: event.model.button_fires_on_down
// generator: down and up inside and outside
// predicate: only a down inside returns on-click
it("p_button: only a down inside returns on-click", () => {
  const clicks: Vec2[] = [];
  const view = button("ok", (pos) => {
    clicks.push(pos as Vec2);
    return [["clicked"]];
  });
  // label "ok" measures [2, 1]; button bounds are [14, 13]
  expect(dispatch(view, mouseDown([8, 6]))).toEqual([["clicked"]]);
  expect(dispatch(view, mouseUp([8, 6]))).toEqual([]);
  expect(dispatch(view, mouseDown([14, 6]))).toEqual([]);
  expect(dispatch(view, mouseDown([8, 13]))).toEqual([]);
  expect(clicks).toEqual([[8, 6]]);

  // Generalized property: interior downs fire exactly once with the
  // local position; ups and exterior downs never fire.
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 12 }),
      fc.nat(11),
      fc.nat(11),
      (len, ax, ay) => {
        const local: Vec2[] = [];
        const btn = button("a".repeat(len + 1), (pos) => {
          local.push(pos as Vec2);
          return [["clicked"]];
        });
        expect(dispatch(btn, mouseDown([ax, ay]))).toEqual([["clicked"]]);
        expect(local).toEqual([[ax, ay]]);
        expect(dispatch(btn, mouseUp([ax, ay]))).toEqual([]);
        expect(dispatch(btn, mouseDown([len + 13, ay]))).toEqual([]);
        expect(dispatch(btn, mouseDown([ax, 13]))).toEqual([]);
        expect(local).toEqual([[ax, ay]]);
      },
    ),
  );
});
