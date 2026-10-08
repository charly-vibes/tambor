// Purpose: executable contract tests for the components.numeric spec —
//   the counter and number-slider port (basic_components.cljc).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-numeric.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text) of that spec. No vacuous predicates: every check encodes its
//   row's stated behavior.

import { expect, it } from "vitest";
import fc from "fast-check";

import { call, render } from "../src/model/component.ts";
import { defaultHandler, makeApp, type Effect } from "../src/effects/dispatch.ts";
import type { Path } from "../src/effects/paths.ts";
import { dispatch as dispatchEvent } from "../src/events/dispatch.ts";
import { mouseDown, mouseMoveGlobal, mouseUp } from "../src/events/event.ts";
import { counter } from "../src/components/numeric/counter.ts";
import {
  bounds,
  isGroup,
  type Elem,
  type Label,
  type Node,
  type Vec2,
} from "../src/views/model.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const $NUM: Path = [["keypath", "num"]];
const $MDOWN: Path = [["keypath", "mdown?"]];

// Render the counter component call as a view tree.
function counterView(args: Record<string, unknown>): Elem {
  return render(call(counter, args)) as Elem;
}

// Every node in the tree satisfying pred, with its absolute origin,
// collected via children() plus the translate offsets.
function nodeOrigins(
  elem: Elem,
  pred: (n: Node) => boolean,
  ox = 0,
  oy = 0,
  out: readonly [Node, Vec2][] = [],
): readonly [Node, Vec2][] {
  if (elem == null) return out;
  if (isGroup(elem)) {
    for (const child of elem) nodeOrigins(child, pred, ox, oy, out);
    return out;
  }
  const node = elem as Node;
  if (node.type === "translate") {
    return nodeOrigins(node.drawable, pred, ox + node.x, oy + node.y, out);
  }
  if (pred(node)) out.push([node, [ox, oy]]);
  // wrapper nodes (handler, with-color, with-style, with-stroke-width)
  // carry drawables; the walk continues through them
  const drawables = (node as unknown as { drawables?: readonly Elem[] }).drawables;
  if (drawables !== undefined) {
    for (const child of drawables) nodeOrigins(child, pred, ox, oy, out);
  }
  return out;
}

const isLabel = (n: Node): n is Label => n.type === "label";

// Apply a returned intent batch to an app state (the dispatcher's
// builtin handler).
function applyEffects(state: unknown, effects: readonly unknown[]): Record<string, unknown> {
  return defaultHandler(state, effects as readonly Effect[], {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// counter — the "-" / centred label / "+" row
// ---------------------------------------------------------------------------

// p_default — derives_from: components.numeric.counter_default
// generator: no num
// predicate: num is 0
it("p_default: num is 0", () => {
  const view = counterView({});
  const texts = nodeOrigins(view, isLabel).map(([n]) => n.text);
  expect(texts).toHaveLength(1);
  expect(texts[0]!.trim()).toBe("0");
});

// p_label_width — derives_from: components.numeric.counter_label_width
// generator: labels 1 and 12345
// predicate: centred area is at least 20
it("p_label_width: centred area is at least 20", () => {
  fc.assert(
    fc.property(fc.constantFrom(1, 12345) as fc.Arbitrary<number>, (num) => {
      const view = counterView({ num });
      const labels = nodeOrigins(view, isLabel);
      expect(labels).toHaveLength(1);
      const [label] = labels[0]!;
      // the label is padded on both sides: its own measured width is
      // the centred area, and it is at least 20
      const [w] = label.measure(label.text);
      expect(w).toBeGreaterThanOrEqual(20);
      // ...and the text stays centred: the padding wraps the digits
      expect(label.text.trim()).toBe(String(num));
    }),
  );
});

// p_buttons — derives_from: components.numeric.counter_buttons
// generator: click minus and plus
// predicate: dec and inc effects carry path and limit
it("p_buttons: dec and inc effects carry path and limit", () => {
  const view = counterView({ num: 10, min: 3, max: 30, $num: $NUM });

  // the minus button: the first child, at the origin
  const minus = dispatchEvent(view, mouseDown([6, 6]));
  expect(minus).toEqual([["dec", $NUM, 3]]);

  // the plus button: find its absolute origin by walking the layout
  const pluses = nodeOrigins(
    view,
    (n): n is Node & { type: "button" } => n.type === "button" && n.text === "+",
  );
  expect(pluses).toHaveLength(1);
  const [plusX, plusY] = pluses[0]![1];
  const [pw, ph] = bounds(
    pluses
      .map(([n]) => n)
      .find((n): n is Node & { type: "button" } => n.type === "button")!,
  );
  const plus = dispatchEvent(view, mouseDown([plusX + pw - 1, plusY + ph - 1]));
  expect(plus).toEqual([["inc", $NUM, 30]]);

  // no limits declared: the effects carry just the path
  const bare = counterView({ num: 10, $num: $NUM });
  expect(dispatchEvent(bare, mouseDown([6, 6]))).toEqual([["dec", $NUM]]);
  expect(dispatchEvent(bare, mouseDown([plusX + pw - 1, plusY + ph - 1]))).toEqual([["inc", $NUM]]);
});

// p_dec — derives_from: components.numeric.counter_dec_rule
// generator: num 3 with min 3 and num 3 with no min
// predicate: stays 3 then becomes 2
it("p_dec: stays 3 then becomes 2", () => {
  // num 3 with min 3: the decrement clamps at the limit
  const clamped = makeApp({ view: () => null, state: { num: 3 } });
  clamped.dispatch(["dec", $NUM, 3]);
  expect((clamped.getState() as Record<string, unknown>)["num"]).toBe(3);

  // num 3 with no min: it becomes 2
  const free = makeApp({ view: () => null, state: { num: 3 } });
  free.dispatch(["dec", $NUM]);
  expect((free.getState() as Record<string, unknown>)["num"]).toBe(2);

  // property: a limited decrement is max(min, num - 1)
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }), (num, min) => {
      const state = applyEffects({ num }, [["dec", $NUM, min]]);
      expect(state["num"]).toBe(Math.max(min, num - 1));
    }),
  );
});

// p_inc — derives_from: components.numeric.counter_inc_rule
// generator: num 3 with max 3 and no max
// predicate: stays 3 then becomes 4
it("p_inc: stays 3 then becomes 4", () => {
  // num 3 with max 3: the increment clamps at the limit
  const clamped = makeApp({ view: () => null, state: { num: 3 } });
  clamped.dispatch(["inc", $NUM, 3]);
  expect((clamped.getState() as Record<string, unknown>)["num"]).toBe(3);

  // num 3 with no max: it becomes 4
  const free = makeApp({ view: () => null, state: { num: 3 } });
  free.dispatch(["inc", $NUM]);
  expect((free.getState() as Record<string, unknown>)["num"]).toBe(4);

  // property: a limited increment is min(max, num + 1)
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }), (num, max) => {
      const state = applyEffects({ num }, [["inc", $NUM, max]]);
      expect(state["num"]).toBe(Math.min(max, num + 1));
    }),
  );
});
