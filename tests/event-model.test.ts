// Purpose: executable contract tests for the event-model spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/event-model.md is the design authority; each
//   predicate here mirrors a Properties row of that spec — pointer
//   events are first-match-wins, key/global events concatenate, and
//   hit-testing is half-open.

import { expect, it } from "vitest";
import fc from "fast-check";

import { button, on, spacer, translate, type ButtonNode, type Elem, type HandlerNode, type Vec2 } from "../src/views/model.ts";
import {
  classifyTap,
  clipboard,
  keyPress,
  mouseDown,
  mouseMoveGlobal,
  mouseUp,
  normalizePointer,
  tapEvents,
  type PointerMoment,
  type TamborEvent,
} from "../src/events/event.ts";
import { onBubble } from "../src/events/bubble.ts";
import { dispatch, hasKeyEvent, hasKeyPress, hasMouseMoveGlobal } from "../src/events/dispatch.ts";

// p_half_open — derives_from: event.model.hit_half_open
// generator: spacer(20, 20) probed at 0, 19, 20 and -1
// predicate: positions 0 and 19 hit and 20 and -1 miss
it("p_half_open: positions 0 and 19 hit and 20 and -1 miss", () => {
  // The spec's example probe must hold verbatim: a 20x20 hit region
  // accepts 0 and 19 and rejects 20 and -1 (right/bottom edges exclusive).
  const view = onHitRecorder();
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
        const hitView = onHitRecorder(w, h);
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
function onHitRecorder(w = 20, h = 20): HandlerNode {
  const seen: Vec2[] = [];
  const node = on("mouse-down", (pos: unknown) => {
    seen.push(pos as Vec2);
    return [["hit"]];
  }, spacer(w, h));
  (node as { seen?: Vec2[] }).seen = seen;
  return node;
}
function seenOf(node: HandlerNode): readonly Vec2[] {
  return (node as { seen?: Vec2[] }).seen ?? [];
}

// p_local — derives_from: event.model.local_pos_passed
// generator: handler at translate(10, 10) probed at [15, 15]
// predicate: handler sees [5, 5] and README returns the intent [:say-hello]
it("p_local: handler sees [5, 5] and README returns the intent [:say-hello]", () => {
  const view = translate(10, 10, onHitRecorder());
  expect(dispatch(view, mouseDown([15, 15]))).toEqual([["say-hello"]]);
  expect(seenOf(view.drawable as HandlerNode)).toEqual([[5, 5]]);

  // Generalized property: the handler always sees the probe minus the
  // translate offsets.
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 40 }),
      fc.integer({ min: 0, max: 40 }),
      fc.nat(19),
      fc.nat(19),
      (ox, oy, ax, ay) => {
        const local = onHitRecorder();
        const tree = translate(ox, oy, local);
        expect(dispatch(tree, mouseDown([ox + ax, oy + ay]))).toEqual([["hit"]]);
        expect(seenOf(local)).toEqual([[ax, ay]]);
      },
    ),
  );
});

// p_coords — derives_from: event.model.coords_translated
// generator: nested translates
// predicate: handler sees the point minus the sum of offsets
it("p_coords: handler sees the point minus the sum of offsets", () => {
  const inner = onHitRecorder();
  const view = translate(3, 4, translate(5, 6, inner));
  expect(dispatch(view, mouseDown([10, 13]))).toEqual([["hit"]]);
  expect(seenOf(inner)).toEqual([[2, 3]]);

  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.nat(9),
      fc.nat(9),
      (x1, y1, x2, y2, ax, ay) => {
        const local = onHitRecorder();
        const tree = translate(x1, y1, translate(x2, y2, local));
        expect(dispatch(tree, mouseDown([x1 + x2 + ax, y1 + y2 + ay]))).toEqual([["hit"]]);
        expect(seenOf(local)).toEqual([[ax, ay]]);
      },
    ),
  );
});

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

// p_bubble — derives_from: event.model.bubble_after_children
// generator: node with a counting bubble
// predicate: bubble runs exactly once per event
it("p_bubble: bubble runs exactly once per event", () => {
  let count = 0;
  const view = onBubble((intents) => {
    count++;
    return intents;
  }, on("mouse-down", () => [["x"]], spacer(10, 10)));
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([["x"]]);
  expect(count).toBe(1);
  // once per event — including events that produce no intents
  expect(dispatch(view, mouseUp([5, 5]))).toEqual([]);
  expect(count).toBe(2);

  // Generalized property: n dispatches, n bubble applications.
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 10 }), fc.nat(30), (n, probe) => {
      let runs = 0;
      const tree = onBubble((intents) => {
        runs++;
        return intents;
      }, on("mouse-down", () => [["x"]], spacer(10, 10)));
      for (let i = 0; i < n; i++) dispatch(tree, mouseDown([probe % 10, probe % 10]));
      expect(runs).toBe(n);
    }),
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

// p_event_pure — derives_from: event.model.event_pure
// generator: random events
// predicate: tree and state unchanged afterwards
it("p_event_pure: tree and state unchanged afterwards", () => {
  const state = { n: 10, log: [] as unknown[] };
  const tree: readonly Elem[] = [
    on("mouse-down", () => [["read", state.n]], spacer(10, 10)),
    translate(15, 0, on("key-press", () => [["read-key"]], spacer(2, 2))),
    button("go", () => [["read", state.n]]),
  ];
  const stateBefore = structuredClone(state);

  const events: fc.Arbitrary<TamborEvent> = fc.oneof(
    fc.tuple(fc.nat(40), fc.nat(40)).map(([x, y]) => mouseDown([x, y])),
    fc.tuple(fc.nat(40), fc.nat(40)).map(([x, y]) => mouseUp([x, y])),
    fc.constant(keyPress("a")),
    fc.constant(keyPress("enter")),
  );
  fc.assert(
    fc.property(fc.array(events, { maxLength: 20 }), (evts) => {
      const results = evts.map((e) => dispatch(tree, e));
      // dispatching twice yields identical results (purity => determinism)
      expect(evts.map((e) => dispatch(tree, e))).toEqual(results);
      expect(state).toEqual(stateBefore);
    }),
  );
  // the tree nodes are frozen by construction and stayed that way —
  // dispatch can only build new intent arrays, never rewrite nodes
  expect(Object.isFrozen(tree[0])).toBe(true);
  expect(Object.isFrozen(tree[1])).toBe(true);
});

// p_pointer — derives_from: event.model.pointer_unified
// generator: mouse, touch and pen inputs
// predicate: all produce the same normalised shape
it("p_pointer: all produce the same normalised shape", () => {
  const raw = { pos: [3, 4] as Vec2, button: 1, down: true, mods: ["shift"] };
  const m = normalizePointer({ ...raw, source: "mouse" });
  const t = normalizePointer({ ...raw, source: "touch" });
  const p = normalizePointer({ ...raw, source: "pen" });
  expect(m).toEqual(t);
  expect(t).toEqual(p);
  // the unified shape carries position, button, down flag, modifiers
  // and pointerType
  expect(m).toEqual({ pos: [3, 4], button: 1, down: true, mods: ["shift"], pointerType: "mouse" });

  // Generalized property: equivalent inputs from the three devices
  // normalise to one identical shape.
  fc.assert(
    fc.property(
      fc.tuple(fc.nat(500), fc.nat(500)),
      fc.nat(4),
      fc.boolean(),
      fc.array(fc.constantFrom("shift", "control", "alt", "meta"), { maxLength: 3 }),
      (pos, button, down, mods) => {
        const base = { pos: pos as Vec2, button, down, mods };
        const shapes = (["mouse", "touch", "pen"] as const).map((source) =>
          normalizePointer({ ...base, source }));
        expect(shapes[0]).toEqual(shapes[1]);
        expect(shapes[1]).toEqual(shapes[2]);
        expect(shapes[0]).toEqual({ ...base, pointerType: "mouse" });
      },
    ),
  );
});

// p_tap — derives_from: event.model.tap_vs_drag
// generator: random down-up pairs
// predicate: classification matches the slop and time thresholds
it("p_tap: classification matches the slop and time thresholds", () => {
  const down: PointerMoment = { pos: [0, 0], time: 0 };
  // exactly on both thresholds is a tap; beyond either is a drag
  expect(classifyTap(down, { pos: [10, 0], time: 300 })).toBe("tap");
  expect(classifyTap(down, { pos: [10.5, 0], time: 300 })).toBe("drag");
  expect(classifyTap(down, { pos: [0, 0], time: 301 })).toBe("drag");
  expect(classifyTap(down, { pos: [6, 8], time: 299 })).toBe("tap");

  // a tap emits mouse-down then mouse-up
  const events = tapEvents(down, { pos: [4, 3], time: 100 });
  expect(events.map((e) => e.type)).toEqual(["mouse-down", "mouse-up"]);
  expect(events[0]).toMatchObject({ pos: [4, 3], down: true });
  expect(events[1]).toMatchObject({ pos: [4, 3], down: false });
  expect(tapEvents(down, { pos: [50, 0], time: 10 })).toEqual([]);

  // Generalized property: classification follows the 10 px slop and
  // 300 ms time thresholds.
  fc.assert(
    fc.property(
      fc.tuple(fc.nat(100), fc.nat(100)),
      fc.tuple(fc.nat(100), fc.nat(100)),
      fc.nat(1000),
      fc.nat(1000),
      (dp, up_, dTime, extra) => {
        const d: PointerMoment = { pos: dp as Vec2, time: dTime };
        const u: PointerMoment = { pos: up_ as Vec2, time: dTime + extra };
        const dx = up_[0] - dp[0];
        const dy = up_[1] - dp[1];
        const withinSlop = dx * dx + dy * dy <= 100;
        const expected = withinSlop && extra <= 300 ? "tap" : "drag";
        expect(classifyTap(d, u)).toBe(expected);
      },
    ),
  );
});
void clipboard;
