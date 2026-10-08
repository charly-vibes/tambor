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
import { select, type Path } from "../src/effects/paths.ts";
import { dispatch as dispatchEvent } from "../src/events/dispatch.ts";
import { mouseDown, mouseMoveGlobal, mouseUp } from "../src/events/event.ts";
import { counter, decNum, incNum } from "../src/components/numeric/counter.ts";
import {
  slider,
  fillWidth,
  mapValue,
  sliderLabel,
} from "../src/components/numeric/slider.ts";
import {
  bounds,
  isGroup,
  type Elem,
  type Label,
  type Node,
  type Rectangle,
  type Vec2,
} from "../src/views/model.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const $NUM: Path = [["keypath", "num"]];

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
  out: [Node, Vec2][] = [],
): [Node, Vec2][] {
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
// ---------------------------------------------------------------------------
// slider — the number-slider state machine
// ---------------------------------------------------------------------------

// The mapping scenario's limits (p_mapping generator).
const SLIDER_MIN = 5;
const SLIDER_MAX = 20;
const SLIDER_WIDTH = 300;

// Render the slider call against an app state: num is the current
// value, the mdown? flag lives in the call-site scratch under ::extra
// (component.model's per-call-site scratch), and extraArgs overrides
// any prop (e.g. omitting max-width for the default-width scenario).
function sliderView(
  state: Record<string, unknown>,
  extraArgs: Record<string, unknown> = {},
): Elem {
  return render(
    call(
      slider,
      {
        num: state["num"] as number,
        min: SLIDER_MIN,
        max: SLIDER_MAX,
        "max-width": SLIDER_WIDTH,
        "integer?": true,
        $num: $NUM,
        ...extraArgs,
      },
      { extra: state["::extra"] as Record<string, unknown> },
    ),
  ) as Elem;
}

// Dispatch event, apply the returned intents to the state, return the
// new state — one step of the gesture loop (dispatch → apply → rerender).
function step(state: Record<string, unknown>, elem: Elem, event: ReturnType<typeof mouseDown>): Record<string, unknown> {
  return applyEffects(state, dispatchEvent(elem, event));
}

const isRect = (n: Node): n is Rectangle => n.type === "rectangle";
const rectWidths = (elem: Elem): number[] =>
  nodeOrigins(elem, isRect).map(([r]) => (r as Rectangle).width);

// ---------------------------------------------------------------------------
// counter — the "-" / centred label / "+" row
// ---------------------------------------------------------------------------

// p_default — derives_from: components.numeric.counter_default
// generator: no num
// predicate: num is 0
it("p_default: num is 0", () => {
  const view = counterView({});
  const texts = nodeOrigins(view, isLabel).map(([n]) => (n as Label).text);
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
      const labels = nodeOrigins(view, isLabel).map(([n]) => n as Label);
      expect(labels).toHaveLength(1);
      const label = labels[0]!;
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

  // the minus button: the first child, at the origin; its effect is
  // dec with the num path (resolving against the state to the binding)
  // and the min limit
  const minus = dispatchEvent(view, mouseDown([6, 6])) as unknown as unknown[][];
  expect(minus).toHaveLength(1);
  expect(minus[0]![0]).toBe("dec");
  expect(select({ num: 10 }, minus[0]![1] as Path)).toBe(10);
  expect(minus[0]![2]).toBe(3);

  // the plus button: find its absolute origin by walking the layout
  const pluses = nodeOrigins(
    view,
    (n): n is Node & { type: "button" } => n.type === "button" && n.text === "+",
  );
  expect(pluses).toHaveLength(1);
  const [plusNode, plusOrigin] = pluses[0]!;
  const [pw, ph] = bounds(plusNode);
  const plus = dispatchEvent(
    view,
    mouseDown([plusOrigin[0] + pw - 1, plusOrigin[1] + ph - 1]),
  ) as unknown as unknown[][];
  expect(plus).toHaveLength(1);
  expect(plus[0]![0]).toBe("inc");
  expect(select({ num: 10 }, plus[0]![1] as Path)).toBe(10);
  expect(plus[0]![2]).toBe(30);

  // no limits declared: the effects carry just the path
  const bare = counterView({ num: 10, $num: $NUM });
  const bareMinus = dispatchEvent(bare, mouseDown([6, 6])) as unknown as unknown[][];
  expect(bareMinus[0]![0]).toBe("dec");
  expect(bareMinus[0]).toHaveLength(2);
  const barePlus = dispatchEvent(
    bare,
    mouseDown([plusOrigin[0] + pw - 1, plusOrigin[1] + ph - 1]),
  ) as unknown as unknown[][];
  expect(barePlus[0]![0]).toBe("inc");
  expect(barePlus[0]).toHaveLength(2);
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

  // property: a limited decrement is max(min, num - 1), an unlimited
  // one num - 1
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }), (num, min) => {
      expect(decNum(num, min)).toBe(Math.max(min, num - 1));
      expect(decNum(num)).toBe(num - 1);
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

  // property: a limited increment is min(max, num + 1), an unlimited
  // one num + 1
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }), (num, max) => {
      expect(incNum(num, max)).toBe(Math.min(max, num + 1));
      expect(incNum(num)).toBe(num + 1);
    }),
  );
});

// ---------------------------------------------------------------------------
// slider — the number-slider state machine
// ---------------------------------------------------------------------------

// p_mapping — derives_from: components.numeric.slider_mapping
// generator: min 5 max 20 width 300 integer at x 150, x -10, x 400
// predicate: 12, 5 and 20
it("p_mapping: 12, 5 and 20", () => {
  let state: Record<string, unknown> = { num: 0, "::extra": {} };

  // down at x 150: 5 + (150 / 300) * 15 = 12.5, truncated to 12
  state = step(state, sliderView(state), mouseDown([150, 5]));
  expect(state["num"]).toBe(12);

  // move to x -10: 4.5 truncates to 4, clamped back to min 5
  state = step(state, sliderView(state), mouseMoveGlobal([-10, 5]));
  expect(state["num"]).toBe(5);

  // move to x 400: 25, clamped to max 20
  state = step(state, sliderView(state), mouseMoveGlobal([400, 5]));
  expect(state["num"]).toBe(20);

  // property: the mapped value always lands in [min, max], integral
  // when integer? truncates toward zero
  fc.assert(
    fc.property(
      fc.integer({ min: -50, max: 50 }),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 500 }),
      fc.boolean(),
      (min, span, width, integer) => {
        const max = min + span;
        for (const x of [-1000, -1, 0, 1, Math.floor(width / 2), width, width + 500]) {
          const v = mapValue(x, min, max, width, integer);
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(max);
          if (integer) expect(Number.isInteger(v)).toBe(true);
        }
      },
    ),
  );
});

// p_gesture — derives_from: components.numeric.slider_gesture
// generator: move before down and after down
// predicate: only the second updates
it("p_gesture: only the second updates", () => {
  let state: Record<string, unknown> = { num: 5, "::extra": {} };

  // a move before any pointer down: no intents, num unchanged
  expect(dispatchEvent(sliderView(state), mouseMoveGlobal([160, 5]))).toEqual([]);
  expect(state["num"]).toBe(5);

  // the down updates (12, per the mapping) and arms the gesture
  state = step(state, sliderView(state), mouseDown([150, 5]));
  expect(state["num"]).toBe(12);

  // after down: the move updates (5 + (160/300)*15 = 13)
  state = step(state, sliderView(state), mouseMoveGlobal([160, 5]));
  expect(state["num"]).toBe(13);
});

// p_capture — derives_from: components.numeric.slider_pointer_capture
// generator: drag outside bounds on touch
// predicate: updates continue until release
it("p_capture: updates continue until release", () => {
  let state: Record<string, unknown> = { num: 0, "::extra": {} };
  state = step(state, sliderView(state), mouseDown([150, 5]));

  // dragging outside the track bounds: the global touch moves keep
  // updating while pressed, clamped by the mapping
  state = step(state, sliderView(state), mouseMoveGlobal([-10, 5]));
  expect(state["num"]).toBe(5);
  state = step(state, sliderView(state), mouseMoveGlobal([400, 5]));
  expect(state["num"]).toBe(20);

  // release: the up updates (5 + (50/300)*15 = 7.5 → 7) and disarms
  state = step(state, sliderView(state), mouseUp([50, 5]));
  expect(state["num"]).toBe(7);

  // ...and moves stop updating after release
  const intents = dispatchEvent(sliderView(state), mouseMoveGlobal([150, 5]));
  expect(intents).toEqual([]);
  expect(state["num"]).toBe(7);
});

// p_label — derives_from: components.numeric.slider_label
// generator: num 3 and 3.14159
// predicate: 3 and 3.14
it("p_label: 3 and 3.14", () => {
  // integer?: the label shows num itself
  const intView = render(
    call(slider, { num: 3, min: 0, max: 100, "integer?": true, $num: $NUM }),
  ) as Elem;
  expect(nodeOrigins(intView, isLabel).map(([n]) => (n as Label).text)).toContain("3");
  expect(sliderLabel(3, true)).toBe("3");

  // otherwise: num with two decimals
  const decView = render(call(slider, { num: 3.14159, min: 0, max: 100, $num: $NUM })) as Elem;
  expect(nodeOrigins(decView, isLabel).map(([n]) => (n as Label).text)).toContain("3.14");
  expect(sliderLabel(3.14159, false)).toBe("3.14");
});

// p_fill — derives_from: components.numeric.slider_fill
// generator: num 3 min 0 max 20 width 100
// predicate: width is 15
it("p_fill: width is 15", () => {
  const view = render(
    call(slider, { num: 3, min: 0, max: 20, "max-width": 100, $num: $NUM }),
  ) as Elem;
  expect(rectWidths(view)).toContain(15);
  expect(fillWidth(3, 0, 20, 100)).toBe(15);
});

// p_max_width — derives_from: components.numeric.slider_max_width_default
// generator: no max-width
// predicate: 100
it("p_max_width: 100", () => {
  // the track: the full mapping width, defaulted to 100 when absent
  const view = render(call(slider, { num: 50, min: 0, max: 100, $num: $NUM })) as Elem;
  expect(rectWidths(view)).toContain(100);

  // behaviorally: x at the default width maps onto the max
  expect(mapValue(100, 0, 100)).toBe(100);
  expect(mapValue(50, 0, 100)).toBe(50);
});
