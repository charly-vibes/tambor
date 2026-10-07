// Purpose: executable contract tests for the example-counter spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/example-counter.md is the design authority; each
//   predicate here mirrors a Properties row (p_label first — tracer).

import { expect, it } from "vitest";
import fc from "fast-check";

import { label } from "../src/label.ts";
import {
  bounds,
  button,
  type ButtonNode,
  type Elem,
  type Node,
  type TranslateNode,
  type Vec2,
} from "../src/views/model.ts";
import { counter, counterCounter } from "../src/views/counter.ts";
import { mouseDown } from "../src/events/event.ts";
import { dispatch } from "../src/events/dispatch.ts";
import type { EventElem } from "../src/events/bubble.ts";
import {
  counter as counterView,
  counterCounter as counterCounterView,
} from "../src/effects/counter.ts";
import { rootRef, type Ref } from "../src/effects/ref.ts";
import { makeApp, type Effect } from "../src/effects/dispatch.ts";

const noopView = () => null;

// The state path to a standalone counter's num: a keypath navigator
// addressing the num entry of the app state (more_emits_increment;
// "each counter's $num is nums plus seq-nth(i)" for the stacked form).
const NUM_PATH: readonly unknown[] = [["keypath", "num"]];

// The eventful counter view: the T1 counter layout with the more! button
// carrying its pointer-down handler, which returns exactly one
// counter-increment intent carrying the num path (more_emits_increment).
function eventfulCounter(num: number): EventElem {
  const rows = counter(num);
  const btn = rows[0] as ButtonNode;
  return [button(btn.text, () => [["counter-increment", NUM_PATH]]), rows[1]];
}

// p_label — derives_from: example.counter.label_shows_number
// generator: num 10 — predicate: label text is the decimal string of num
it("p_label: label text is the decimal string of num", () => {
  // The spec's example value must hold verbatim.
  expect(label(10)).toBe("10");

  // Generalized property: decimal string for every non-negative num.
  const num = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
  fc.assert(
    fc.property(num, (n) => {
      expect(label(n)).toBe(n.toString(10));
    }),
  );
});

// p_layout — derives_from: example.counter.counter_layout
// generator: num 10 — predicate: child 0 is the button and child 1 is
// the label with x offset greater than the button width
it("p_layout: child 0 is the button and child 1 is the label with x offset greater than the button width", () => {
  // The spec's example value must hold verbatim.
  const rows = counter(10);
  expect(rows[0]).toMatchObject({ type: "button" });
  const second = rows[1] as TranslateNode;
  expect(second.type).toBe("translate");
  expect(second.drawable).toMatchObject({ type: "label", text: "10" });
  expect(second.x).toBeGreaterThan(bounds(rows[0] as Node)[0]);

  // Generalized property: the label sits past the button width for
  // every non-negative num.
  const num = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
  fc.assert(
    fc.property(num, (n) => {
      const row = counter(n);
      const btn = row[0] as Node;
      const lbl = row[1] as TranslateNode;
      expect(btn.type).toBe("button");
      expect(lbl.type).toBe("translate");
      expect((lbl.drawable as Node).type).toBe("label");
      expect(lbl.x).toBeGreaterThan(bounds(btn)[0]);
    }),
  );
});

// p_more — derives_from: example.counter.more_emits_increment
// generator: num 10 and a click at the button centre
// predicate: intents equal one counter-increment with the path to num
it("p_more: intents equal one counter-increment with the path to num", () => {
  // The spec's example value must hold verbatim.
  const view = eventfulCounter(10);
  const btn = (view as readonly Elem[])[0] as ButtonNode;
  const [w, h] = bounds(btn);
  expect(dispatch(view, mouseDown([w / 2, h / 2]))).toEqual([
    ["counter-increment", NUM_PATH],
  ]);

  // Generalized property: for every num, a click at the button centre
  // yields exactly one counter-increment intent with the num path, and
  // a click on the label yields none.
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 9999 }), (num) => {
      const tree = eventfulCounter(num);
      const rows = tree as readonly Elem[];
      const btnBounds = bounds(rows[0] as Node);
      const centre: Vec2 = [btnBounds[0] / 2, btnBounds[1] / 2];
      expect(dispatch(tree, mouseDown(centre))).toEqual([
        ["counter-increment", NUM_PATH],
      ]);
      // the label (past the button) emits nothing
      const lbl = rows[1] as TranslateNode;
      const lblProbe: Vec2 = [lbl.x + 1, 0];
      expect(dispatch(tree, mouseDown(lblProbe))).toEqual([]);
    }),
  );
});

// p_stack — derives_from: example.counter.stack_layout
// generator: nums 0, 1, 2 — predicate: four rows, button first then
// three counters
it("p_stack: four rows, button first then three counters", () => {
  // The spec's example value must hold verbatim.
  const rows = counterCounter([0, 1, 2]) as readonly Elem[];
  expect(rows).toHaveLength(4);
  expect(rows[0]).toMatchObject({ type: "button" });
  // each counter row is translated into place by the vertical layout;
  // its drawable is the horizontal counter group
  for (const [i, row] of (rows.slice(1) as readonly TranslateNode[]).entries()) {
    expect(row.type).toBe("translate");
    const counterRow = row.drawable as readonly Elem[];
    expect(Array.isArray(counterRow)).toBe(true);
    const [btn, lbl] = [counterRow[0] as Node, counterRow[1] as TranslateNode];
    expect(btn.type).toBe("button");
    expect(lbl.type).toBe("translate");
    expect(lbl.drawable).toMatchObject({ type: "label", text: String(i) });
  }

  // Generalized property: one counter row per entry, in order.
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 0, max: 999 }), { minLength: 0, maxLength: 8 }), (nums) => {
      const stack = counterCounter(nums) as readonly Elem[];
      // the Add Counter button row is always present
      expect(stack).toHaveLength(nums.length + 1);
      expect(stack[0]).toMatchObject({ type: "button" });
    }),
  );
});

// ---------------------------------------------------------------------------
// T3 (tambor-q7u): effect application — p_increment, p_independent, p_add.
// These convert the state-path + effect-dispatch half of the spec; the
// remaining rows stay with their owning ticket.

// p_increment — derives_from: example.counter.increment_applies
// generator: state num 10 — predicate: state num becomes 11
it("p_increment: state num becomes 11", () => {
  const state = { num: 10 };
  const $num = rootRef(state).get("num") as Ref<number>;
  const rows = counterView(10, $num);
  // the more button emits exactly one counter-increment with the num path
  const effects = (rows[0] as ButtonNode).onClick?.() as Effect[];
  expect(effects).toEqual([["counter-increment", [["keypath", "num"]]]]);
  // applying it adds 1 to the number at the path and changes nothing else
  const app = makeApp({ view: noopView, state });
  app.dispatch(effects);
  expect(app.getState()).toEqual({ num: 11 });
});

// p_independent — derives_from: example.counter.independent_counters
// generator: nums 0, 1, 2 and a click on the second more — predicate:
// nums becomes 0, 2, 2
it("p_independent: nums becomes 0, 2, 2", () => {
  const state = { nums: [0, 1, 2] };
  const $nums = rootRef(state).get("nums") as Ref<readonly number[]>;
  const rows = counterCounterView([0, 1, 2], $nums) as readonly Elem[];
  // a counter at index i has the path nums then seq-nth(i); the second
  // more button lives in row 2 (row 0 is the Add Counter button)
  const second = ((rows[2] as TranslateNode).drawable as readonly Elem[])[0] as ButtonNode;
  const effects = second.onClick?.() as Effect[];
  expect(effects).toEqual([["counter-increment", [["keypath", "nums"], ["seq-nth", 1]]]]);
  const app = makeApp({ view: noopView, state });
  app.dispatch(effects);
  expect(app.getState()).toEqual({ nums: [0, 2, 2] });
});

// p_add — derives_from: example.counter.add_appends_zero
// generator: nums 0, 1, 2 and a click on Add Counter — predicate: nums
// becomes 0, 1, 2, 0 and a fifth row appears
it("p_add: nums becomes 0, 1, 2, 0 and a fifth row appears", () => {
  const state = { nums: [0, 1, 2] };
  const $nums = rootRef(state).get("nums") as Ref<readonly number[]>;
  const rows = counterCounterView([0, 1, 2], $nums) as readonly Elem[];
  // pressing Add Counter returns add-counter with the nums path
  const effects = (rows[0] as ButtonNode).onClick?.() as Effect[];
  expect(effects).toEqual([["add-counter", [["keypath", "nums"]]]]);
  const app = makeApp({ view: noopView, state });
  app.dispatch(effects);
  // applying it appends 0
  expect(app.getState()).toEqual({ nums: [0, 1, 2, 0] });
  // …and a fifth row appears on the next render
  const after = counterCounterView([0, 1, 2, 0], rootRef(app.getState()).get("nums") as Ref<readonly number[]>) as readonly Elem[];
  expect(after).toHaveLength(5);
});
