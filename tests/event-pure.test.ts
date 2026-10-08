// Purpose: executable contract tests for event-model purity rows.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/event-model.md is the design authority; each
//   predicate here mirrors a Properties row of that spec — the bubble
//   runs once per event and dispatch never rewrites trees or state.

import { expect, it } from "vitest";
import fc from "fast-check";

import { button, on, spacer, translate, type Elem } from "../src/views/model.ts";
import { keyPress, mouseDown, mouseUp, type TamborEvent } from "../src/events/event.ts";
import { onBubble } from "../src/events/bubble.ts";
import { dispatch } from "../src/events/dispatch.ts";

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
  const stateBefore = JSON.parse(JSON.stringify(state)) as typeof state;

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
