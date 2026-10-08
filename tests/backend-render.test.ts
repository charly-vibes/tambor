// Purpose: executable contract tests for the backend.render spec — the
//   three backends (canvas, dom, text) behind one contract: drawing
//   primitives, text measurement and hit-testing, clipboard, input
//   normalisation, dpr sizing, resize repaints, raf coalescing,
//   accessibility mirroring, safe-area insets and headless rendering.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/backend-render.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text) and each generator mirrors the row's generator. No vacuous
//   predicates: drawing checks rasterized ink, input checks the
//   coordinates the router actually receives, and the swappable check
//   compares real effect lists across backends.

import { afterAll, expect, it, vi } from "vitest";
import fc from "fast-check";

import { accessibilityTree, type A11yNode } from "../src/render/a11y.ts";
import { CanvasBackend, type CanvasBackendOptions } from "../src/render/canvas.ts";
import { DomBackend } from "../src/render/dom.ts";
import { TextBackend } from "../src/render/text.ts";
import type { Font, Insets } from "../src/render/backend.ts";
import {
  arc,
  image as imageNode,
  rotate,
  scale,
  scissor,
  textCursor,
  textSelection,
  type AnyDraw,
} from "../src/render/primitives.ts";
import {
  computedStyle,
  createCanvas,
} from "../src/render/domsim.ts";
import {
  CONTAINER_SIZE_KEY,
  defaultHandler,
  type Effect,
  type Handler,
  type ViewFn,
} from "../src/effects/dispatch.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown, type TamborEvent } from "../src/events/event.ts";
import {
  button,
  checkbox,
  horizontalLayout,
  label as labelNode,
  on,
  path,
  rectangle,
  roundedRectangle,
  translate,
  verticalLayout,
  withColor,
  withStyle,
  withStrokeWidth,
  type Elem,
  type Vec2,
} from "../src/views/model.ts";
import { mobileTodoView, todoState } from "../src/ui/fixture_todo.ts";

afterAll(() => {
  vi.restoreAllMocks();
});

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

// A clipboard stub recording writes.
function clipStub(): { texts: string[]; writeText(t: string): void } {
  const texts: string[] = [];
  return { texts, writeText: (t) => texts.push(t) };
}

// A view carrying a handler that records the local position the router
// passed (p_input: the router receives view-space coordinates).
function probeView(): { view: Elem; received: Vec2[] } {
  const received: Vec2[] = [];
  const view = on(
    "mouse-move",
    (pos: Vec2) => {
      received.push(pos);
      return [["probe", pos]];
    },
    rectangle(400, 400),
  );
  return { view, received };
}

// Independent interactive-node count for the a11y predicate: buttons
// and checkboxes, counted without touching the a11y module.
function countInteractive(elem: AnyDraw): number {
  if (elem == null) return 0;
  if (Array.isArray(elem)) {
    return (elem as readonly AnyDraw[]).reduce(
      (sum: number, child) => sum + countInteractive(child),
      0,
    );
  }
  const node = elem as { type: string; drawables?: readonly unknown[]; drawable?: unknown };
  if (node.type === "button" || node.type === "checkbox") return 1;
  if (node.type === "translate") {
    return node.drawable === undefined ? 0 : countInteractive(node.drawable as AnyDraw);
  }
  return ((node.drawables ?? []) as readonly unknown[]).reduce(
    (sum: number, kid) => sum + countInteractive(kid as AnyDraw),
    0,
  );
}

// Collect the button labels independently of the a11y module.
function collectButtons(elem: AnyDraw, out: string[]): void {
  if (elem == null) return;
  if (Array.isArray(elem)) {
    (elem as readonly AnyDraw[]).forEach((child) => collectButtons(child, out));
    return;
  }
  const node = elem as { type: string; text?: string; drawables?: readonly unknown[]; drawable?: unknown };
  if (node.type === "button" && typeof node.text === "string") out.push(node.text);
  if (node.type === "translate" && node.drawable !== undefined) {
    collectButtons(node.drawable as AnyDraw, out);
  }
  for (const kid of (node.drawables ?? []) as readonly unknown[]) {
    collectButtons(kid as AnyDraw, out);
  }
}

// Rasterized ink of one node drawn into a fresh backend, as a bounding
// box in device pixels.
function inkOf(view: AnyDraw, size: Vec2, opts: Partial<CanvasBackendOptions> = {}): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  inked: boolean;
} {
  const backend = new CanvasBackend({ containerSize: size, ...opts });
  backend.draw(view);
  const ink = backend.image.inkBounds();
  return ink
    ? {
        minX: ink.x,
        minY: ink.y,
        maxX: ink.x + ink.width - 1,
        maxY: ink.y + ink.height - 1,
        inked: true,
      }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0, inked: false };
}

// A random view: primitives, wrappers and nesting, deterministic under
// the default measure (p_determinism / p_stack generators).
const arbView: fc.Arbitrary<AnyDraw> = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.constant(null),
    fc.constant(labelNode("hello")),
    fc.nat(60).chain((w) => fc.nat(60).map((h) => rectangle(w, h))),
    fc.tuple(fc.nat(50), fc.nat(50), fc.nat(50)).map(
      ([a, b, c]) => path([0, 0], [a, b], [c, a]),
    ),
    fc.tuple(fc.nat(40), fc.nat(40)).map(([x, y]) => translate(x, y, labelNode("t"))),
  ),
  node: fc.oneof(
    tie("leaf"),
    fc.tuple(tie("node"), tie("node")).map(([a, b]) => [a, b] as AnyDraw),
    fc.tuple(fc.nat(20), fc.nat(20), tie("node")).map(([x, y, d]) => translate(x, y, d)),
    fc.tuple(fc.nat(1, 3), tie("node")).map(
      ([r, g, d]) => withColor([r / 3, g / 3, 1], d),
    ),
    tie("node").map((d) => withStyle("stroke", d)),
    fc.tuple(fc.nat(4), tie("node")).map(([sw, d]) => withStrokeWidth(1 + sw, d)),
    fc.nat(90).chain((theta) => fc.nat(1).map(() => rotate(theta, null) as AnyDraw)),
    fc.nat(3).chain((s) => fc.nat(1).map((_) => scale(1 + s, 1 + s, null) as AnyDraw)),
    fc.tuple(fc.nat(40), fc.nat(40), tie("node")).map(
      ([w, h, d]) => scissor(0, 0, w, h, d),
    ),
  ),
})).node;

// A view containing one of every primitive plus an unknown node
// (p_primitives generator).
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
    const intents = dispatch(view(state), ev);
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
    const ink = inkOf(node, [80, 80]);
    expect(ink.inked, `${name} produced no ink`).toBe(true);
  }
});

// p_determinism — derives_from: backend.render.draw_deterministic
// generator: random views — predicate: two draws produce equal pixels
it("p_determinism: two draws of a random view produce equal pixels", () => {
  fc.assert(
    fc.property(arbView, (view) => {
      const backend = new CanvasBackend({ containerSize: [120, 120] });
      backend.draw(view);
      const first = new Uint8ClampedArray(backend.image.data);
      backend.draw(view);
      expect(backend.image.data).toEqual(first);
    }),
  );
});

// p_stack — derives_from: backend.render.transform_stack_balanced
// generator: random nested views — predicate: stack depth is 0 after draw
it("p_stack: stack depth is 0 after drawing a random nested view", () => {
  fc.assert(
    fc.property(arbView, (view) => {
      const backend = new CanvasBackend({ containerSize: [120, 120] });
      backend.draw(view);
      expect(backend.stackDepth).toBe(0);
    }),
  );
});

// p_index — derives_from: backend.render.index_for_position_inverse
// generator: text hello at x from -5 to 200
// predicate: index is 0 at the left, 5 at the right and never decreases
it("p_index: text hello at x from -5 to 200 gives 0 at the left, 5 at the right and never decreases", () => {
  const backend = new CanvasBackend({ containerSize: [220, 20] });
  const font: Font = { size: 1 };
  const at = (x: number): number => backend.indexForPosition(font, "hello", x, 0);

  // the boundaries of the sweep
  expect(at(-5)).toBe(0);
  expect(at(200)).toBe(5);

  // never decreases: for every ordered pair x1 <= x2 in [-5, 200]
  fc.assert(
    fc.property(
      fc.integer({ min: -5, max: 200 }).chain((x1) =>
        fc.integer({ min: x1, max: 200 }).map((x2) => [x1, x2] as const),
      ),
      ([x1, x2]) => {
        expect(at(x1)).toBeLessThanOrEqual(at(x2));
      },
    ),
  );
});

// p_clipboard — derives_from: backend.render.clipboard_service
// generator: copy hello and a paste event
// predicate: the clipboard gets hello and the paste arrives as a string
it("p_clipboard: the clipboard gets hello and the paste arrives as a string", () => {
  const clip = clipStub();
  const backend = new CanvasBackend({ containerSize: [120, 60], clipboard: clip });
  const surface = createCanvas();
  surface.rect = { x: 0, y: 0, width: 120, height: 60 };
  backend.attach(surface);
  const seen: TamborEvent[] = [];
  backend.subscribe((ev) => seen.push(ev));

  backend.copyToClipboard("hello");
  expect(clip.texts).toEqual(["hello"]);

  surface.dispatch({ type: "paste", text: "world" });
  expect(seen).toHaveLength(1);
  const ev = seen[0]!;
  expect(ev.type).toBe("clipboard");
  expect(typeof ev.data).toBe("string");
  expect(ev.data).toBe("world");
});

// p_headless — derives_from: backend.render.headless_render
// generator: the todo-app initial state in a runtime with no DOM
// predicate: an image of non-zero size is produced
it("p_headless: the todo-app initial state in a runtime with no DOM produces an image of non-zero size", () => {
  // no surface is ever attached: a runtime with no DOM
  const state = todoState();
  const { view } = mobileTodoView(state, [400, 600]);
  const backend = new CanvasBackend({ containerSize: [400, 600] });
  backend.draw(view);
  expect(backend.image.width).toBeGreaterThan(0);
  expect(backend.image.height).toBeGreaterThan(0);
  // and the image contains rendered content
  expect(backend.image.inkBounds()).not.toBeNull();
});

// p_dpr — derives_from: backend.render.dpr_scaled
// generator: dpr in 1, 2, 3 — predicate: backing size equals css size times dpr
it("p_dpr: backing size equals css size times dpr for dpr in 1, 2, 3", () => {
  fc.assert(
    fc.property(fc.constantFrom(1, 2, 3), (dpr) => {
      const backend = new CanvasBackend({ containerSize: [320, 480], dpr });
      const surface = createCanvas();
      backend.attach(surface);
      // the backing store scales by dpr …
      expect(surface.attrs.width).toBe(320 * dpr);
      expect(surface.attrs.height).toBe(480 * dpr);
      expect(backend.image.width).toBe(320 * dpr);
      // … and the css size is unchanged
      expect(surface.style.width).toBe("320px");
      expect(surface.style.height).toBe("480px");
    }),
  );
});

// p_resize — derives_from: backend.render.resize_redraws
// generator: random viewport sizes
// predicate: a redraw follows each resize with the new size in context
it("p_resize: a redraw follows each resize with the new size in context", () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 1, max: 400 }), fc.integer({ min: 1, max: 400 })),
      ([w, h]) => {
        const seenSizes: unknown[] = [];
        const view: ViewFn = (_state, context) => {
          seenSizes.push(context[CONTAINER_SIZE_KEY]);
          return rectangle(w, h);
        };
        const backend = new CanvasBackend({ containerSize: [50, 50], view, state: {} });
        const before = backend.drawCount;
        backend.resize([w, h]);
        expect(backend.drawCount).toBeGreaterThan(before);
        expect(backend.containerSize).toEqual([w, h]);
        expect(seenSizes[seenSizes.length - 1]).toEqual([w, h]);
      },
    ),
  );
});

// p_input — derives_from: backend.render.input_forwarded
// generator: scripted pointer events
// predicate: the router receives view-space coordinates
it("p_input: the router receives view-space coordinates for scripted pointer events", () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.nat(300), fc.nat(200), fc.constantFrom(0, 17, 40)),
      ([dx, dy, originX]) => {
        const backend = new CanvasBackend({ containerSize: [400, 400] });
        const surface = createCanvas();
        surface.rect = { x: originX, y: originX, width: 400, height: 400 };
        backend.attach(surface);
        const { view, received } = probeView();
        const forwarded: Vec2[] = [];
        backend.subscribe((ev) => {
          forwarded.push(ev.pos ?? [0, 0]);
          dispatch(view, ev);
        });
        // the scripted pointer sequence: down, move, up at one raw
        // device position
        const clientX = originX + dx;
        const clientY = originX + dy;
        surface.dispatch({ type: "pointerdown", clientX, clientY });
        surface.dispatch({ type: "pointermove", clientX, clientY });
        surface.dispatch({ type: "pointerup", clientX, clientY });
        // every forwarded event carries the view-space position …
        expect(forwarded).toEqual([
          [dx, dy],
          [dx, dy],
          [dx, dy],
        ]);
        // … and the router (the view handler) received it once
        expect(received).toEqual([[dx, dy]]);
      },
    ),
  );
});

// p_keys — derives_from: backend.render.key_normalisation
// generator: a, A, Enter, Backspace, ArrowLeft, Shift
// predicate: a, A, enter, backspace, left and nothing
it("p_keys: a, A, Enter, Backspace, ArrowLeft, Shift forward a, A, enter, backspace, left and nothing", () => {
  const backend = new CanvasBackend({ containerSize: [120, 60] });
  const surface = createCanvas();
  surface.rect = { x: 0, y: 0, width: 120, height: 60 };
  backend.attach(surface);
  const keys: (string | undefined)[] = [];
  backend.subscribe((ev) => keys.push(ev.key));

  const script: readonly (readonly [string, string | undefined])[] = [
    ["a", "a"],
    ["A", "A"],
    ["Enter", "enter"],
    ["Backspace", "backspace"],
    ["ArrowLeft", "left"],
    ["Shift", undefined],
  ];
  for (const [raw] of script) {
    surface.dispatch({ type: "keydown", key: raw });
  }
  expect(keys).toEqual(script.map(([, expected]) => expected));
});

// p_touch_action — derives_from: backend.render.touch_action_none
// generator: mounted canvas — predicate: computed touch-action is none
it("p_touch_action: a mounted canvas has computed touch-action none", () => {
  const backend = new CanvasBackend({ containerSize: [320, 480] });
  const surface = createCanvas();
  backend.attach(surface);
  expect(computedStyle(surface)["touch-action"]).toBe("none");
});

// p_raf — derives_from: backend.render.raf_coalesced
// generator: N requests per frame — predicate: one draw per frame
it("p_raf: N requests per frame produce one draw per frame", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 }), (n1, n2) => {
      const backend = new CanvasBackend({ containerSize: [80, 80] });
      backend.draw(labelNode("raf"));
      const frames: (() => void)[] = [];
      vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
        frames.push(cb);
        return frames.length;
      });
      try {
        for (let i = 0; i < n1; i++) backend.requestDraw();
        expect(frames).toHaveLength(1);
        expect(backend.drawCount).toBe(1);
        // one flush = one frame = one draw, however many requests
        frames.splice(0).forEach((cb) => cb());
        expect(backend.drawCount).toBe(2);
        for (let i = 0; i < n2; i++) backend.requestDraw();
        expect(frames).toHaveLength(1);
        frames.splice(0).forEach((cb) => cb());
        expect(backend.drawCount).toBe(3);
      } finally {
        vi.unstubAllGlobals();
      }
    }),
  );
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

// p_a11y — derives_from: backend.render.a11y_mirror
// generator: views with buttons — predicate: one accessible node per interactive node
it("p_a11y: one accessible node per interactive node", () => {
  const arbButtonView: fc.Arbitrary<AnyDraw> = fc.letrec((tie) => ({
    leaf: fc.oneof(
      fc.constant(labelNode("inert") as AnyDraw),
      fc.constant(button("Save") as AnyDraw),
      fc.constant(button("Cancel") as AnyDraw),
      fc.constant(checkbox(true) as AnyDraw),
      fc.constant(checkbox(false) as AnyDraw),
    ),
    node: fc.oneof(
      tie("leaf"),
      fc.tuple(tie("node"), tie("node")).map(([a, b]) => [a, b] as AnyDraw),
      fc.tuple(fc.nat(10), fc.nat(10), tie("node")).map(([x, y, d]) => translate(x, y, d)),
      tie("node").map((d) => withColor([0, 0, 1], d)),
    ),
  })).node;

  fc.assert(
    fc.property(arbButtonView, (view) => {
      const backend = new CanvasBackend({ containerSize: [200, 200] });
      backend.draw(view);
      const tree: readonly A11yNode[] = backend.a11y;
      const interactive = countInteractive(view);
      // one accessible node per interactive node
      expect(tree).toHaveLength(interactive);
      // the mirror names the buttons it mirrors
      const labels = tree
        .filter((n) => n.role === "button")
        .map((n) => n.label);
      const buttonLabels: string[] = [];
      collectButtons(view, buttonLabels);
      expect(labels).toEqual(buttonLabels);
    }),
  );
});

// p_safe_area — derives_from: backend.render.safe_area_respected
// generator: simulated insets — predicate: content stays inside the insets
it("p_safe_area: content stays inside the insets", () => {
  fc.assert(
    fc.property(fc.nat(10), fc.nat(10), fc.nat(10), fc.nat(10), (top, right, bottom, left) => {
      const insets: Insets = { top, right, bottom, left };
      const ink = inkOf(rectangle(100, 100), [100, 100], { safeAreaInsets: insets });
      expect(ink.inked).toBe(true);
      expect(ink.minX).toBeGreaterThanOrEqual(left);
      expect(ink.minY).toBeGreaterThanOrEqual(top);
      expect(ink.maxX).toBeLessThan(100 - right);
      expect(ink.maxY).toBeLessThan(100 - bottom);
    }),
  );
});

// re-exported types keep the annotation-only imports meaningful
export type { Font, Insets };
