// Purpose: executable contract test for the tambor root spec's
//   example-acceptance row — every scenario of the examples passes on
//   each backend.
// Responsibilities: encode the p_examples row as a vitest test: the
//   per-backend wire (subscribe / draw / pointer / key through each
//   backend's own input path), the counter scenario list, the runner
//   that drives every scenario through every backend, and the
//   generalized fast-check property over the counter stack.
// Rationale: specs/tambor.md is the design authority (tambor.examples_
//   are_acceptance). Split out of the former monolithic
//   tests/tambor.test.ts (tambor-272); the todo scenario list lives in
//   tests/helpers/todo-scenarios.ts and the tree scans in
//   tests/helpers/scan.ts, reused rather than duplicated.

import { expect, it, vi } from "vitest";
import fc from "fast-check";

import {
  bounds,
  type ButtonNode,
  type Elem,
  type Node,
  type Vec2,
} from "../src/views/model.ts";
import {
  counter as counterView,
  counterCounter as counterCounterView,
} from "../src/effects/counter.ts";
import { rootRef, type Ref } from "../src/effects/ref.ts";
import { makeApp } from "../src/effects/dispatch.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { keyPress, mouseDown, type TamborEvent } from "../src/events/event.ts";
import { CanvasBackend } from "../src/render/canvas.ts";
import { DomBackend } from "../src/render/dom.ts";
import { TextBackend } from "../src/render/text.ts";
import { createCanvas } from "../src/render/domsim.ts";
import { scanOf } from "./helpers/scan.ts";
import { centreOf } from "./helpers/appview.ts";
import { todoScenarios, type Scenario } from "./helpers/todo-scenarios.ts";

// The three backends of the corpus (the generator's "each backend").
const BACKENDS = ["canvas", "dom", "text"] as const;
type BackendName = (typeof BACKENDS)[number];

// A per-backend wire: subscribe collects the events the backend
// forwards after its own input normalisation; draw renders the view;
// pointer/key inject one raw input through that backend's own path
// (canvas/dom through the mounted surface, text through send).
interface Wire {
  draw(view: Elem): void;
  pointer(pos: Vec2): void;
  key(key: string): void;
  readonly received: readonly TamborEvent[];
}

function makeWire(name: BackendName, size: readonly [number, number]): Wire {
  const received: TamborEvent[] = [];
  if (name === "text") {
    // no DOM: the input arrives pre-normalised
    const backend = new TextBackend({ containerSize: size });
    backend.subscribe((ev) => received.push(ev));
    return {
      draw: (view) => backend.draw(view),
      pointer: (pos) => backend.send(mouseDown(pos)),
      key: (key) => backend.send(keyPress(key)),
      received,
    };
  }
  const backend =
    name === "canvas"
      ? new CanvasBackend({ containerSize: size })
      : new DomBackend({ containerSize: size });
  const surface = createCanvas();
  surface.rect = { x: 0, y: 0, width: size[0], height: size[1] };
  backend.attach(surface);
  backend.subscribe((ev) => received.push(ev));
  return {
    draw: (view) => backend.draw(view),
    pointer: (pos) =>
      surface.dispatch({ type: "pointerdown", clientX: pos[0], clientY: pos[1] }),
    // the surface speaks the raw DOM spelling ("Enter"); the backend
    // normalises it before forwarding (p_keys)
    key: (key) => surface.dispatch({ type: "keydown", key: key === "enter" ? "Enter" : key }),
    received,
  };
}

// --- the scenario list of example.counter (TRACEABILITY: counter.cljc) ---

// "counter layout, ::counter-increment": click the more! button, num 11.
// "counter-counter stack, per-entry paths": click the second more, nums
// 0, 2, 2. "::add-counter conj 0": click Add Counter, nums 0, 1, 2, 0.
function counterScenarios(): readonly Scenario[] {
  const single = { num: 10 };
  const $num = rootRef(single).get("num") as Ref<number>;
  const one = counterView(10, $num) as readonly Elem[];
  const [w, h] = bounds(one[0] as Node);

  const stacked = { nums: [0, 1, 2] };
  const $nums = rootRef(stacked).get("nums") as Ref<readonly number[]>;
  const stack = counterCounterView([0, 1, 2], $nums) as readonly Elem[];
  const mores = scanOf(stack as Elem).filter(
    (f) => f.node.type === "button" && (f.node as ButtonNode).text === "more!",
  );
  const addBtn = scanOf(stack as Elem).find(
    (f) => f.node.type === "button" && (f.node as ButtonNode).text === "Add Counter",
  )!;

  return [
    {
      name: "counter: more increments num",
      size: [120, 60],
      state: single,
      view: one as Elem,
      steps: [
        {
          pos: [w / 2, h / 2],
          check: (is) => expect(is).toEqual([["counter-increment", [["keypath", "num"]]]]),
        },
      ],
      expectState: (s) => expect(s).toEqual({ num: 11 }),
    },
    {
      name: "counter-counter: the second more touches only entry 1",
      size: [120, 60],
      state: stacked,
      view: stack as Elem,
      steps: [
        {
          pos: centreOf(mores[1]!),
          check: (is) =>
            expect(is).toEqual([
              ["counter-increment", [["keypath", "nums"], ["seq-nth", 1]]],
            ]),
        },
      ],
      expectState: (s) => expect(s).toEqual({ nums: [0, 2, 2] }),
    },
    {
      name: "counter-counter: Add Counter appends zero",
      size: [120, 60],
      state: stacked,
      view: stack as Elem,
      steps: [
        {
          pos: centreOf(addBtn),
          check: (is) => expect(is).toEqual([["add-counter", [["keypath", "nums"]]]]),
        },
      ],
      expectState: (s) => expect(s).toEqual({ nums: [0, 1, 2, 0] }),
    },
  ];
}

// One scenario against one backend: draw once, route each scripted step
// through the backend's own input path, check the intents, and apply
// them.
function runScenarioOnBackend(be: BackendName, scenario: Scenario): void {
  const wire = makeWire(be, scenario.size);
  // each backend renders the app, unchanged
  wire.draw(scenario.view);
  const app = makeApp({ view: () => null, state: scenario.state });
  for (const step of scenario.steps) {
    const before = wire.received.length;
    if (step.pos !== undefined) wire.pointer(step.pos);
    else wire.key(step.key!);
    const ev = wire.received[before];
    expect(ev, `${be}: ${scenario.name} routed nothing`).toBeDefined();
    const intents = dispatch(scenario.view, ev!);
    step.check(intents);
    app.dispatch(intents);
  }
  scenario.expectState?.(app.getState());
}

// Every scenario on every backend (p_examples' outer loops).
function runEveryScenario(scenarios: readonly Scenario[]): void {
  for (const be of BACKENDS) {
    for (const scenario of scenarios) runScenarioOnBackend(be, scenario);
  }
}

// Generalized property: for random nums, clicking the i-th more
// button routes counter-increment with that entry's path on every
// backend, and applying it changes only entry i.
function assertMoreRoutingProperty(): void {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 5 }),
      fc.nat(7),
      fc.constantFrom(...BACKENDS),
      (nums, pick, be) => {
        const i = pick % nums.length;
        const state = { nums: [...nums] };
        const $nums = rootRef(state).get("nums") as Ref<readonly number[]>;
        const view = counterCounterView(nums, $nums) as Elem;
        const wire = makeWire(be, [120, 60]);
        wire.draw(view);
        const more = scanOf(view).filter(
          (f) => f.node.type === "button" && (f.node as ButtonNode).text === "more!",
        )[i]!;
        const [bw, bh] = bounds(more.node);
        wire.pointer([more.x + bw / 2, more.y + bh / 2]);
        const intents = dispatch(view, wire.received[0]!);
        expect(intents).toEqual([["counter-increment", [["keypath", "nums"], ["seq-nth", i]]]]);
        const app = makeApp({ view: () => null, state });
        app.dispatch(intents);
        const out = (app.getState() as { nums: readonly number[] }).nums;
        expect(out[i]).toBe(nums[i]! + 1);
        expect(out.filter((_, j) => j !== i)).toEqual(nums.filter((_, j) => j !== i));
      },
    ),
  );
}

it("p_examples: every scenario passes on each backend", () => {
  // unknown-effect reports (other-keys passes insert-text through to the
  // textarea interpreter, which a plain top-level dispatcher skips) stay
  // silent here — the row checks the returned effects
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    // the scenario lists of both examples
    const scenarios = [...counterScenarios(), ...todoScenarios()];
    expect(scenarios.length).toBeGreaterThanOrEqual(11);
    runEveryScenario(scenarios);
    assertMoreRoutingProperty();
  } finally {
    logSpy.mockRestore();
  }
});
