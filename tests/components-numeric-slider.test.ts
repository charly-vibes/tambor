// Purpose: executable contract tests for the components.numeric number
//   slider port (basic_components.cljc).
// Responsibilities: encode the slider's converted rows — mapping,
//   gesture, pointer capture, label, fill and max-width — as vitest +
//   fast-check properties, with the slider app-state and view helpers.
// Rationale: openspec/specs/components-numeric/spec.md is the design authority; each
//   predicate mirrors a Properties row of that spec. Split from
//   components-numeric.test.ts so no file exceeds the test-role
//   file-lines threshold (tambor-272); test names are byte-identical to
//   the originals (contract bindings are name-based).

import { expect, it } from "vitest";
import fc from "fast-check";

import { call, render } from "../src/model/component.ts";
import { defaultHandler, type Effect } from "../src/effects/dispatch.ts";
import type { Path } from "../src/effects/paths.ts";
import { dispatch as dispatchEvent } from "../src/events/dispatch.ts";
import { mouseDown, mouseMoveGlobal, mouseUp, type TamborEvent } from "../src/events/event.ts";
import {
  slider,
  fillWidth,
  mapValue,
  sliderLabel,
} from "../src/components/numeric/slider.ts";
import {
  type Elem,
  type Label,
  type Node,
  type Rectangle,
  type Vec2,
} from "../src/views/model.ts";
import { nodeOrigins } from "./helpers/numeric-view.ts";

const $NUM: Path = [["keypath", "num"]];
const isLabel = (n: Node): n is Label => n.type === "label";

// Apply a returned intent batch to an app state (the dispatcher's
// builtin handler).
function applyEffects(state: unknown, effects: readonly unknown[]): Record<string, unknown> {
  return defaultHandler(state, effects as readonly Effect[], {}) as Record<string, unknown>;
}

const SLIDER_MIN = 5;
const SLIDER_MAX = 20;
const SLIDER_WIDTH = 300;

// The slider's args map lives in the app state at "slider-args" and is
// passed as a non-literal call (component.model nonliteral_call_fill):
// the num updates write through the map's path, and the call-site
// scratch (mdown?) is keyed by paths, so it survives the value
// changing underneath the call — the realistic defui usage.
const ARGS_PATH: Path = [["keypath", "slider-args"]];

// The slider app state shape: the args map plus the scratch root.
interface SliderState {
  "slider-args": Record<string, unknown>;
  "::extra": Record<string, unknown>;
}

// A fresh slider app state; prop overrides land in the args map.
function sliderState(num: number, propOverrides: Record<string, unknown> = {}): SliderState {
  return {
    "slider-args": {
      num,
      min: SLIDER_MIN,
      max: SLIDER_MAX,
      "max-width": SLIDER_WIDTH,
      "integer?": true,
      $num: [["keypath", "slider-args"], ["keypath", "num"]],
      ...propOverrides,
    },
    "::extra": {},
  };
}

// Render the slider against the current state (rerender each step).
function sliderView(state: SliderState): Elem {
  return render(
    call(slider, state["slider-args"], {
      extra: state["::extra"],
      $m: ARGS_PATH,
    }),
  ) as Elem;
}

// Dispatch event, apply the returned intents to the state, return the
// new state — one step of the gesture loop (dispatch → apply → rerender).
function step(state: SliderState, elem: Elem, event: TamborEvent): SliderState {
  return applyEffects(state, dispatchEvent(elem, event)) as unknown as SliderState;
}

const isRect = (n: Node): n is Rectangle => n.type === "rectangle";
const rectWidths = (elem: Elem): number[] =>
  nodeOrigins(elem, isRect).map(([r]) => (r as Rectangle).width);

// p_mapping — derives_from: components.numeric.slider_mapping
// generator: min 5 max 20 width 300 integer at x 150, x -10, x 400
// predicate: 12, 5 and 20
it("p_mapping: 12, 5 and 20", () => {
  let state = sliderState(0);

  // down at x 150: 5 + (150 / 300) * 15 = 12.5, truncated to 12
  state = step(state, sliderView(state), mouseDown([150, 5]));
  expect(state["slider-args"]["num"]).toBe(12);

  // move to x -10: 4.5 truncates to 4, clamped back to min 5
  state = step(state, sliderView(state), mouseMoveGlobal([-10, 5]));
  expect(state["slider-args"]["num"]).toBe(5);

  // move to x 400: 25, clamped to max 20
  state = step(state, sliderView(state), mouseMoveGlobal([400, 5]));
  expect(state["slider-args"]["num"]).toBe(20);

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
  let state = sliderState(5);

  // a move before any pointer down: no intents, num unchanged
  expect(dispatchEvent(sliderView(state), mouseMoveGlobal([160, 5]))).toEqual([]);
  expect(state["slider-args"]["num"]).toBe(5);

  // the down updates (12, per the mapping) and arms the gesture
  state = step(state, sliderView(state), mouseDown([150, 5]));
  expect(state["slider-args"]["num"]).toBe(12);

  // after down: the move updates (5 + (160/300)*15 = 13)
  state = step(state, sliderView(state), mouseMoveGlobal([160, 5]));
  expect(state["slider-args"]["num"]).toBe(13);
});

// p_capture — derives_from: components.numeric.slider_pointer_capture
// generator: drag outside bounds on touch
// predicate: updates continue until release
it("p_capture: updates continue until release", () => {
  let state = sliderState(0);
  state = step(state, sliderView(state), mouseDown([150, 5]));

  // dragging outside the track bounds: the global touch moves keep
  // updating while pressed, clamped by the mapping
  state = step(state, sliderView(state), mouseMoveGlobal([-10, 5]));
  expect(state["slider-args"]["num"]).toBe(5);
  state = step(state, sliderView(state), mouseMoveGlobal([400, 5]));
  expect(state["slider-args"]["num"]).toBe(20);

  // release: the up updates (5 + (50/300)*15 = 7.5 → 7) and disarms
  state = step(state, sliderView(state), mouseUp([50, 5]));
  expect(state["slider-args"]["num"]).toBe(7);

  // ...and moves stop updating after release
  const intents = dispatchEvent(sliderView(state), mouseMoveGlobal([150, 5]));
  expect(intents).toEqual([]);
  expect(state["slider-args"]["num"]).toBe(7);
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
