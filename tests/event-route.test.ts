// Purpose: executable contract tests for event-model routing rows.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/event-model.md is the design authority; each
//   predicate here mirrors a Properties row of that spec — pointer
//   events are first-match-wins, key/global events concatenate, and
//   capability queries see through any nesting depth.

import { expect, it } from "vitest";
import fc from "fast-check";

import { on, spacer, translate, type Elem, type Vec2 } from "../src/views/model.ts";
import { keyPress, mouseDown, mouseMoveGlobal, mouseUp } from "../src/events/event.ts";
import { dispatch, hasKeyEvent, hasKeyPress, hasMouseMoveGlobal } from "../src/events/dispatch.ts";

// p_first_match — derives_from: event.model.pointer_first_match
// generator: two overlapping nodes both with handlers
// predicate: only the later sibling's intents are returned
it("p_first_match: only the later sibling's intents are returned", () => {
  const calls: string[] = [];
  const first = on("mouse-down", () => {
    calls.push("first");
    return [["first"]];
  }, spacer(10, 10));
  const second = on("mouse-down", () => {
    calls.push("second");
    return [["second"]];
  }, spacer(10, 10));
  const view: readonly Elem[] = [first, second];
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([["second"]]);
  expect(calls).toEqual(["second"]);

  // Generalized property: any probe inside the overlap hits only the
  // later sibling.
  fc.assert(
    fc.property(fc.nat(9), fc.nat(9), (x, y) => {
      const order: string[] = [];
      const pair: readonly Elem[] = [
        on("mouse-down", () => {
          order.push("first");
          return [["first"]];
        }, spacer(10, 10)),
        on("mouse-down", () => {
          order.push("second");
          return [["second"]];
        }, spacer(10, 10)),
      ];
      expect(dispatch(pair, mouseDown([x, y]))).toEqual([["second"]]);
      expect(order).toEqual(["second"]);
    }),
  );
});

// p_down_terminal — derives_from: event.model.down_handler_terminal
// generator: on-mouse-down wrapping a node that also handles down
// predicate: only the outer handler fires
it("p_down_terminal: only the outer handler fires", () => {
  let innerCalls = 0;
  const view = on("mouse-down", () => [["outer"]],
    on("mouse-down", () => {
      innerCalls++;
      return [["inner"]];
    }, spacer(10, 10)));
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([["outer"]]);
  expect(innerCalls).toBe(0);
});

// p_up_descends — derives_from: event.model.up_handler_descends
// generator: on-mouse-down wrapping a node that handles up
// predicate: the inner up handler fires
it("p_up_descends: the inner up handler fires", () => {
  let downCalls = 0;
  const view = on("mouse-down", () => {
    downCalls++;
    return [];
  }, on("mouse-up", () => [["up"]], spacer(10, 10)));
  expect(dispatch(view, mouseUp([5, 5]))).toEqual([["up"]]);
  expect(downCalls).toBe(0);

  // Symmetrically, an on-mouse-up node forwards a mouse-down.
  let upCalls = 0;
  const symmetric = on("mouse-up", () => {
    upCalls++;
    return [];
  }, on("mouse-down", () => [["down"]], spacer(10, 10)));
  expect(dispatch(symmetric, mouseDown([5, 5]))).toEqual([["down"]]);
  expect(upCalls).toBe(0);
});

// p_key_concat — derives_from: event.model.key_concat
// generator: three siblings that each handle key-press
// predicate: the output is the three results in order
it("p_key_concat: the output is the three results in order", () => {
  const view: readonly Elem[] = [
    on("key-press", () => [["k1"]], spacer(1, 1)),
    on("key-press", () => [["k2"]], spacer(1, 1)),
    on("key-press", () => [["k3"]], spacer(1, 1)),
  ];
  expect(dispatch(view, keyPress("a"))).toEqual([["k1"], ["k2"], ["k3"]]);

  // Generalized property: n siblings concatenate in sibling order.
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 6 }), (n) => {
      const siblings: readonly Elem[] = Array.from({ length: n }, (_, i) =>
        on("key-press", () => [[`k${i}`]], spacer(1, 1)));
      expect(dispatch(siblings, keyPress("x"))).toEqual(
        Array.from({ length: n }, (_, i) => [[`k${i}`]]).flat(1),
      );
    }),
  );
});

// p_global_move — derives_from: event.model.global_move_all
// generator: handlers at several offsets
// predicate: each receives its own local position and all fire
it("p_global_move: each receives its own local position and all fire", () => {
  const seen: Vec2[] = [];
  const view: readonly Elem[] = [
    translate(10, 0, on("mouse-move-global", (pos) => {
      seen.push(pos as Vec2);
      return [["m1"]];
    }, spacer(5, 5))),
    translate(0, 20, on("mouse-move-global", (pos) => {
      seen.push(pos as Vec2);
      return [["m2"]];
    }, spacer(5, 5))),
  ];
  expect(dispatch(view, mouseMoveGlobal([12, 22]))).toEqual([["m1"], ["m2"]]);
  expect(seen).toEqual([[2, 22], [12, 2]]);

  // Generalized property: every offset handler fires, each with the
  // probe minus its own origin.
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 30 }),
      fc.integer({ min: 0, max: 30 }),
      fc.integer({ min: 20, max: 60 }),
      fc.integer({ min: 20, max: 60 }),
      (ox, oy, px, py) => {
        const local: Vec2[] = [];
        const tree: readonly Elem[] = [
          translate(ox, oy, on("mouse-move-global", (pos) => {
            local.push(pos as Vec2);
            return [["m"]];
          }, spacer(5, 5))),
        ];
        expect(dispatch(tree, mouseMoveGlobal([px, py]))).toEqual([["m"]]);
        expect(local).toEqual([[px - ox, py - oy]]);
      },
    ),
  );
});

// p_capability — derives_from: event.model.capability_queries
// generator: trees with and without key handlers
// predicate: the query matches whether any descendant handles the event
it("p_capability: the query matches whether any descendant handles the event", () => {
  const withKey = translate(5, 5, on("key-press", () => [], spacer(1, 1)));
  expect(hasKeyPress(withKey)).toBe(true);
  expect(hasKeyPress(spacer(1, 1))).toBe(false);
  expect(hasKeyPress([spacer(1, 1), [withKey]])).toBe(true);
  expect(hasKeyEvent(on("key-event", () => [], spacer(1, 1)))).toBe(true);
  expect(hasKeyEvent(withKey)).toBe(false);
  expect(hasMouseMoveGlobal(on("mouse-move-global", () => [], spacer(1, 1)))).toBe(true);
  expect(hasMouseMoveGlobal(on("mouse-down", () => [], spacer(1, 1)))).toBe(false);
  expect(hasKeyPress([on("key-event", () => [], spacer(1, 1))])).toBe(false);

  // Generalized property: nesting depth does not matter.
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 8 }), (depth) => {
      let tree: Elem = on("key-press", () => [], spacer(1, 1));
      for (let i = 0; i < depth; i++) tree = translate(1, 1, tree);
      expect(hasKeyPress(tree)).toBe(true);
      expect(hasKeyEvent(tree)).toBe(false);
    }),
  );
});
