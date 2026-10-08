// Purpose: backend.render contract tests for the backend set itself —
//   the shared service surface (draw, measureText, indexForPosition,
//   copyToClipboard, subscribe), the primitive set each backend draws,
//   the swappable-backend effect equality and the text backend metrics.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property,
//   plus the local generators (every primitive, the three backends, the
//   counter-counter app wire).
// Rationale: specs/backend-render.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). tambor-272 redistributes the former monolithic
//   tests/backend-render.test.ts into topic files; clipStub and inkOf
//   are shared through tests/helpers/backend-render.ts.

import { expect, it } from "vitest";

import { CanvasBackend } from "../src/render/canvas.ts";
import { DomBackend } from "../src/render/dom.ts";
import { TextBackend } from "../src/render/text.ts";
import type { AnyDraw } from "../src/render/primitives.ts";
import { createCanvas } from "../src/render/domsim.ts";
import {
  defaultHandler,
  type Effect,
  type Handler,
  type ViewFn,
} from "../src/effects/dispatch.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown, type TamborEvent } from "../src/events/event.ts";
import {
  bounds,
  button,
  label as labelNode,
  path,
  rectangle,
  roundedRectangle,
  translate,
  withColor,
  withStyle,
  withStrokeWidth,
  type Elem,
} from "../src/views/model.ts";
import { horizontalLayout, verticalLayout } from "../src/views/layout.ts";
import {
  arc,
  image as imageNode,
  rotate,
  scale,
  scissor,
  textCursor,
  textSelection,
} from "../src/render/primitives.ts";
import { clipStub, inkOf } from "./helpers/backend-render.ts";

// ---------------------------------------------------------------- helpers

// A spy handler that records every effect batch it is handed (the
// effect list a routed event produces) and still applies the builtins.
function spyHandler(): { handler: Handler; effects: Effect[] } {
  const effects: Effect[] = [];
  return {
    handler: (state, batch, ctx) => {
      effects.push(...batch);
      return defaultHandler(state, batch, ctx);
    },
    effects,
  };
}

// One of every primitive plus an unknown node (p_primitives generator).
function everyPrimitive(): readonly (readonly [string, AnyDraw])[] {
  const rect = rectangle(20, 10);
  const rounded = roundedRectangle(20, 14, 3);
  return [
    ["label", labelNode("hi")],
    ["text-selection", textSelection(30, 12)],
    ["text-cursor", textCursor(15)],
    ["image", imageNode(8, 6)],
    ["rectangle-fill", withStyle("fill", rect)],
    ["rectangle-stroke", withStyle("stroke", rect)],
    ["rounded-rectangle-fill", withStyle("fill", rounded)],
    ["rounded-rectangle-stroke", withStyle("stroke", rounded)],
    ["path", path([0, 0], [20, 20], [40, 0])],
    ["arc", arc(20, 20, 10, 0, Math.PI)],
    ["translate", translate(5, 5, rect)],
    ["rotate", rotate(0.3, rect)],
    ["scale", scale(2, 2, rect)],
    ["color", withColor([1, 0, 0], rect)],
    ["style", withStyle("stroke", rect)],
    ["stroke-width", withStrokeWidth(3, rect)],
    ["scissor", scissor(0, 0, 15, 15, rect)],
    ["unknown", { type: "glitter", drawables: [rectangle(10, 10)] }],
  ];
}

// The three backends of the corpus (p_contract / p_swappable
// generator: all three backends).
function allBackends(): {
  name: string;
  backend: CanvasBackend | DomBackend | TextBackend;
}[] {
  return [
    { name: "canvas", backend: new CanvasBackend({ containerSize: [120, 60], clipboard: clipStub() }) },
    { name: "dom", backend: new DomBackend({ containerSize: [120, 60], clipboard: clipStub() }) },
    { name: "text", backend: new TextBackend({ containerSize: [40, 12], clipboard: clipStub() }) },
  ];
}

// The counter-counter view with wired intents (p_swappable generator):
// the same app view function and state on every backend.
function counterCounterView(nums: readonly number[]): Elem {
  const rows = nums.map((n, i) =>
    horizontalLayout([
      button("more!", () => [
        ["counter-increment", [["keypath", "todos"], ["nth", i]]],
      ]),
      labelNode(String(n)),
    ]),
  );
  return verticalLayout([
    button("Add Counter", () => [["add-counter", [["keypath", "todos"]]]]),
    ...rows,
  ]) as Elem;
}

// The app wire for a backend: subscribe and route every forwarded
// event through the shared view function, handing the intents to the
// shared handler (the app subscribes to the backend).
function wireCounterApp(
  backend: CanvasBackend | DomBackend | TextBackend,
  nums: readonly number[],
): { effects: Effect[] } {
  const { handler, effects } = spyHandler();
  const state = { todos: [...nums] };
  const view: ViewFn = (s) => counterCounterView((s as { todos: readonly number[] }).todos);
  backend.subscribe((ev) => {
    const intents = dispatch(view(state, {}), ev);
    if (intents.length > 0) handler(state, intents, { backend });
  });
  return { effects };
}

// ---------------------------------------------------------------- tests

// p_contract — derives_from: backend.render.backend_contract
// generator: all three backends — predicate: each exposes draw,
// measureText, indexForPosition, copyToClipboard and subscribe
it("p_contract: all three backends expose draw, measureText, indexForPosition, copyToClipboard and subscribe", () => {
  for (const { name, backend } of allBackends()) {
    const b = backend as unknown as Record<string, unknown>;
    expect(typeof b["draw"], `${name}.draw`).toBe("function");
    expect(typeof backend.measureText, `${name}.measureText`).toBe("function");
    expect(typeof backend.indexForPosition, `${name}.indexForPosition`).toBe("function");
    expect(typeof backend.copyToClipboard, `${name}.copyToClipboard`).toBe("function");
    expect(typeof backend.subscribe, `${name}.subscribe`).toBe("function");

    // smoke: each service is callable against its contract signature
    expect(backend.measureText("hello", { size: 1 })).toEqual([5, 1]);
    expect(backend.indexForPosition({ size: 1 }, "hello", 3, 0)).toBe(3);
    expect(() => backend.copyToClipboard("x")).not.toThrow();
    const events: TamborEvent[] = [];
    const off = backend.subscribe((ev) => events.push(ev));
    expect(typeof off).toBe("function");
    off();
    expect(events).toHaveLength(0);
    expect(() => backend.draw(labelNode("smoke"))).not.toThrow();
  }
});

// p_primitives — derives_from: backend.render.primitive_set
// generator: one node of each primitive and an unknown node
// predicate: each draws and the unknown node draws its children
it("p_primitives: each primitive draws and the unknown node draws its children", () => {
  for (const [name, node] of everyPrimitive()) {
    const ink = inkOf({ view: node, size: [80, 80] });
    expect(ink.inked, `${name} produced no ink`).toBe(true);
  }
});

// p_swappable — derives_from: backend.render.backends_swappable
// generator: counter-counter on each backend
// predicate: the same click yields the same effect list
it("p_swappable: the same click yields the same effect list on every backend", () => {
  const nums = [0, 1, 2];
  const perBackend = allBackends().map(({ name, backend }) => {
    // run counter-counter on this backend with the same view function
    // and state
    const { effects } = wireCounterApp(backend, nums);
    if (backend instanceof TextBackend) {
      // the text backend's input arrives pre-normalised (no DOM)
      backend.send(mouseDown([11, 6]));
    } else {
      // canvas and dom receive the same click through their surface
      const surface = createCanvas();
      surface.rect = { x: 0, y: 0, width: 300, height: 400 };
      backend.attach(surface);
      surface.dispatch({ type: "pointerdown", clientX: 11, clientY: 6 });
    }
    return { name, effects };
  });

  // the same click yields the same effect list
  const first = JSON.stringify(perBackend[0]!.effects);
  for (const { name, effects } of perBackend.slice(1)) {
    expect(JSON.stringify(effects), `${name} effect list differs`).toBe(first);
  }
  // and the click is the Add Counter intent, not nothing
  expect(perBackend[0]!.effects).toEqual([["add-counter", [["keypath", "todos"]]]]);
});

// p_text_metrics — derives_from: backend.render.text_backend_metrics
// generator: text backend — predicate: a label of 5 characters measures 5 by 1
it("p_text_metrics: on the text backend a label of 5 characters measures 5 by 1", () => {
  const backend = new TextBackend({ containerSize: [40, 12] });
  expect(backend.measureText("hello")).toEqual([5, 1]);
  expect(bounds(labelNode("hello"))).toEqual([5, 1]);
});