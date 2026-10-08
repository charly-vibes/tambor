// Purpose: executable contract tests for the ui-mobile spec — the
//   mobile mapping layer (touch to pointer, hit slop, reflow, gestures,
//   soft keyboard, selection, orientation, motion, theme, haptics).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/ui-mobile.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text). No
//   vacuous predicates: every check encodes its row's stated behavior,
//   with contrasting cases asserted where the row implies them.

import { expect, it, vi } from "vitest";
import fc from "fast-check";

import {
  bounds,
  button,
  children,
  on,
  rectangle,
  translate,
  type ButtonNode,
  type Elem,
  type HandlerNode,
  type Node,
  type Vec2,
} from "../src/views/model.ts";

// Descendants of a node across the view and event layers: the event
// layer's bubble/wrap nodes carry drawables that views/model children()
// does not know about.
function descendantsOf(node: Node): readonly unknown[] {
  const d = (node as { drawables?: readonly unknown[] }).drawables;
  if (Array.isArray(d)) return d;
  if (node.type === "translate") return [(node as { drawable: unknown }).drawable];
  return children(node);
}
import type { EventElem, IntentList } from "../src/events/bubble.ts";
import { dispatch } from "../src/events/dispatch.ts";
import {
  classifyTap,
  mouseDown,
  mouseMove,
  TAP_SLOP_PX,
  TAP_TIMEOUT_MS,
  type PointerMoment,
} from "../src/events/event.ts";
import { render, type ComponentCall } from "../src/model/component.ts";
import { CONTAINER_SIZE_KEY, makeApp } from "../src/effects/dispatch.ts";
import { makeHeadlessApp, type HeadlessApp } from "../src/app/app.ts";
import { select, setPath, type Path } from "../src/effects/paths.ts";
import {
  applyTextareaIntents,
  initialTextareaExtra,
  type TextareaExtra,
} from "../src/components/textarea/edit.ts";
import { textarea } from "../src/components/textarea/textarea.ts";
import { button as hoverButton } from "../src/components/hover/hover.ts";
import { counter } from "../src/views/counter.ts";

// The ui-mobile layer under test (src/ui/).
import {
  mapTouchDown,
  mapTouchMove,
  touchTap,
} from "../src/ui/touch.ts";
import { slopDispatch, touchTargets } from "../src/ui/slop.ts";
import { recognize, LONG_PRESS_MS, FLICK_MIN_VELOCITY } from "../src/ui/gestures.ts";
import { bridgeEvents, makeKeyboardBridge } from "../src/ui/keyboard.ts";
import { avoidScroll } from "../src/ui/avoid.ts";
import {
  dragHandle,
  longPressSelection,
  selectionHandles,
} from "../src/ui/handles.ts";
import { rotatedSize } from "../src/ui/rotate.ts";
import {
  momentumSchedule,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
} from "../src/ui/motion.ts";
import {
  colorSchemePref,
  SCHEMES,
  TOKENS,
  tokenValue,
} from "../src/ui/theme.ts";
import { TAP_VIBRATE_MS, tapHaptics } from "../src/ui/haptics.ts";
import { overflowNodes } from "../src/ui/overflow.ts";
import {
  mobileTodoView,
  todoItem,
  todoState,
  type TodoState,
} from "../src/ui/fixture_todo.ts";

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

// Depth-first scan for nodes of one type.
function findAll(elem: unknown, type: string): readonly Node[] {
  if (elem == null) return [];
  if (Array.isArray(elem)) return elem.flatMap((child) => findAll(child, type));
  const node = elem as Node;
  if (node.type === type) return [node];
  return descendantsOf(node).flatMap((child) => findAll(child, type));
}

// Absolute origin of a node inside a tree: walk accumulating translates.
function absoluteOrigin(root: unknown, target: Node): Vec2 {
  let found: Vec2 | null = null;
  const walk = (elem: unknown, ox: number, oy: number): void => {
    if (elem == null || found !== null) return;
    if (Array.isArray(elem)) {
      for (const child of elem) walk(child, ox, oy);
      return;
    }
    const node = elem as Node;
    if (node === target) {
      found = [ox, oy];
      return;
    }
    let dx = 0;
    let dy = 0;
    if (node.type === "translate") {
      dx = node.x;
      dy = node.y;
    }
    for (const child of descendantsOf(node)) walk(child, ox + dx, oy + dy);
  };
  walk(root, 0, 0);
  if (found === null) throw new Error("target node not found in tree");
  return found;
}

const ROOT_EXTRA: Path = [["keypath", "::extra"]];

// A components-hover button wired against the root ::extra scratch, as
// in tests/components-hover.test.ts: the view re-binds the call on every
// render so hover? edits land in the app state.
function hoverWired(text: string): { app: HeadlessApp; $hover: Path } {
  const probe: ComponentCall = hoverButton(text, () => []);
  const $hover = probe.props["$hover?"] as Path;
  const app = makeHeadlessApp({
    view: (s) => {
      const root = (s ?? {}) as Record<string, unknown>;
      const callsite = {
        extra: (root["::extra"] as Record<string, unknown>) ?? {},
        $extra: ROOT_EXTRA,
      };
      return render(hoverButton(text, () => [], callsite)) as Elem;
    },
    state: {},
  });
  return { app, $hover };
}

function viewOf(app: HeadlessApp): EventElem {
  return app.render() as EventElem;
}

// ---------------------------------------------------------------------------
// p_touch_map — touch_maps_to_pointer
// ---------------------------------------------------------------------------

// p_touch_map — derives_from: ui.mobile.touch_maps_to_pointer
// generator: a tap on the more button
// predicate: the same effect as a mouse click is returned
it("p_touch_map: the same effect as a mouse click is returned", () => {
  const NUM_PATH: Path = [["keypath", "num"]];
  const view = (): EventElem => {
    const rows = counter(10);
    const btn = rows[0] as ButtonNode;
    return [button(btn.text, () => [["counter-increment", NUM_PATH]]), rows[1]];
  };
  // The spec's example: a tap on the more button.
  const btn = (view() as readonly unknown[])[0] as ButtonNode;
  const [w, h] = bounds(btn);
  const at: Vec2 = [Math.floor(w / 2), Math.floor(h / 2)];
  const down: PointerMoment = { pos: at, time: 0 };
  const up: PointerMoment = { pos: at, time: 100 };
  const touchEvents = touchTap(down, up);
  expect(touchEvents).toHaveLength(2);
  expect(touchEvents[0]!.type).toBe("mouse-down");
  expect(touchEvents[0]!.pos).toEqual(at);
  const fromTouch = slopDispatch(view(), touchEvents[0]!);
  const fromMouse = dispatch(view(), mouseDown(at));
  expect(fromTouch).toEqual(fromMouse);
  expect(fromTouch).toEqual([["counter-increment", NUM_PATH]]);

  // Generalized property: for every tap point inside the drawn bounds,
  // the mapped touch tap returns exactly what a mouse click returns.
  fc.assert(
    fc.property(fc.nat(Math.max(0, w - 1)), fc.nat(Math.max(0, h - 1)), (x, y) => {
      const p: Vec2 = [x, y];
      const events = touchTap({ pos: p, time: 0 }, { pos: p, time: 50 });
      expect(slopDispatch(view(), events[0]!)).toEqual(dispatch(view(), mouseDown(p)));
    }),
  );
});

// ---------------------------------------------------------------------------
// p_slop — hit_slop
// ---------------------------------------------------------------------------

// p_slop — derives_from: ui.mobile.hit_slop
// generator: todo delete X with a touch 15 px right of its centre
// predicate: the delete effect fires while drawn bounds stay 10 by 10
it("p_slop: the delete effect fires while drawn bounds stay 10 by 10", () => {
  const TODO_PATH: Path = [["keypath", "todos"], ["keypath", "0"]];
  const row = todoItem({ description: "second" }, TODO_PATH) as EventElem;
  // The delete X is the row's first interactive target (leftmost
  // mouse-down handler in scan order).
  const targets = touchTargets(row).filter((t) => t.node.type === "handler");
  expect(targets.length).toBeGreaterThan(0);
  const x = targets.reduce((a, b) => (b.origin[0] < a.origin[0] ? b : a));
  const [xw, xh] = bounds((x.node as HandlerNode).drawables[0] as Node);
  const cx = x.origin[0] + xw / 2;
  const cy = x.origin[1] + xh / 2;
  // 15 px right of the centre: outside the 10 by 10 drawn bounds.
  const touch = mapTouchDown([cx + 15, cy]);
  expect(slopDispatch(row, touch)).toEqual([["delete", TODO_PATH]]);
  // The drawn bounds stay 10 by 10 — no padded node entered the view.
  expect(bounds((x.node as HandlerNode).drawables[0] as Node)).toEqual([10, 10]);
  expect(xw).toBe(10);
  expect(xh).toBe(10);

  // Generalized property: every touch inside the 44 by 44 slop region
  // centred on the X fires the delete effect; drawn bounds never grow.
  fc.assert(
    fc.property(
      fc.integer({ min: -20, max: 20 }),
      fc.integer({ min: -20, max: 20 }),
      (dx, dy) => {
        const intents = slopDispatch(row, mapTouchDown([cx + dx, cy + dy]));
        expect(intents).toEqual([["delete", TODO_PATH]]);
      },
    ),
  );
  // Far outside every slop region no target is hit.
  expect(slopDispatch(row, mapTouchDown([cx, cy + 40]))).toEqual([]);
});

// ---------------------------------------------------------------------------
// p_overlap — slop_resolves_overlap
// ---------------------------------------------------------------------------

// p_overlap — derives_from: ui.mobile.slop_resolves_overlap
// generator: two 20 px targets 10 px apart
// predicate: a touch between them picks the nearer centre
it("p_overlap: a touch between them picks the nearer centre", () => {
  const left = on("mouse-down", () => [["left"]], rectangle(20, 20));
  const right = on("mouse-down", () => [["right"]], rectangle(20, 20));
  const tree: EventElem = [translate(0, 0, left), translate(30, 0, right)];
  // Both slop regions contain the gap; the nearer centre wins.
  fc.assert(
    fc.property(
      fc.integer({ min: 19, max: 31 }).filter((x) => x !== 25),
      (x) => {
        const intents = slopDispatch(tree, mapTouchDown([x, 10]));
        expect(intents).toEqual([[x < 25 ? "left" : "right"]]);
      },
    ),
  );
  // The exact midpoint is a documented tie: the first target in tree
  // order wins, deterministically.
  expect(slopDispatch(tree, mapTouchDown([25, 10]))).toEqual([["left"]]);
});

// ---------------------------------------------------------------------------
// p_reflow — viewport_responsive
// ---------------------------------------------------------------------------

// p_reflow — derives_from: ui.mobile.viewport_responsive
// generator: widths 320 to 1024
// predicate: layout is valid at every width
it("p_reflow: layout is valid at every width", () => {
  const state: TodoState = todoState([
    { description: "first" },
    { description: "second" },
    { description: "third" },
  ]);
  fc.assert(
    fc.property(
      fc.integer({ min: 320, max: 1024 }),
      fc.integer({ min: 480, max: 2000 }),
      (w, h) => {
        const root = mobileTodoView(state, [w, h]);
        // Valid: the tree builds and nothing overflows the container.
        expect(root.view).toBeDefined();
        expect(overflowNodes(root.view, w, root.exempt)).toEqual([]);
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// p_overflow — no_horizontal_overflow
// ---------------------------------------------------------------------------

// p_overflow — derives_from: ui.mobile.no_horizontal_overflow
// generator: width 320 and the todo app
// predicate: no node extends past the viewport
it("p_overflow: no node extends past the viewport", () => {
  // A long description overflows its row — the mobile root places it
  // inside a horizontal scrollview, the stated exemption.
  const root = mobileTodoView(todoState([{ description: "x".repeat(300) }]), [320, 640]);
  expect(overflowNodes(root.view, 320, root.exempt)).toEqual([]);
  // The scan is not vacuous: the same tree scanned without the
  // exemption reports the scrollview body's overflow.
  const raw = overflowNodes(root.view, 320, () => false);
  expect(raw.length).toBeGreaterThan(0);
  // And a tree without any wide content stays clean even unexempted.
  const plain = mobileTodoView(todoState([{ description: "short" }]), [320, 640]);
  expect(overflowNodes(plain.view, 320, () => false)).toEqual([]);
});

// ---------------------------------------------------------------------------
// p_thumb — thumb_zone_actions
// ---------------------------------------------------------------------------

// p_thumb — derives_from: ui.mobile.thumb_zone_actions
// generator: primary actions
// predicate: y of each is in the bottom third
it("p_thumb: y of each is in the bottom third", () => {
  const state = todoState([{ description: "first" }]);
  fc.assert(
    fc.property(
      fc.integer({ min: 320, max: 1024 }),
      fc.integer({ min: 480, max: 2000 }),
      (w, h) => {
        const root = mobileTodoView(state, [w, h]);
        const buttons = findAll(root.view, "button") as ButtonNode[];
        const primaries = buttons.filter((b) => b.text === "Add Todo");
        expect(primaries.length).toBeGreaterThan(0);
        for (const p of primaries) {
          const abs = absoluteOrigin(root.view, p);
          expect(abs[1]).toBeGreaterThanOrEqual((2 * h) / 3);
        }
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// p_gestures — gesture_set
// ---------------------------------------------------------------------------

// p_gestures — derives_from: ui.mobile.gesture_set
// generator: scripted gestures
// predicate: each gesture emits its named intent
it("p_gestures: each gesture emits its named intent", () => {
  // tap: up within 10 px and 300 ms of down (tap_vs_drag thresholds).
  fc.assert(
    fc.property(
      fc.nat(1000),
      fc.nat(1000),
      fc.integer({ min: 10, max: TAP_TIMEOUT_MS - 10 }),
      (dx, dy, dt) => {
        const p: Vec2 = [dx, dy];
        const q: Vec2 = [dx + 3, dy + 3];
        const intent = recognize({ down: { pos: p, time: 0 }, up: { pos: q, time: dt } });
        expect(intent[0]).toBe("tap");
        expect(intent[1]).toEqual(q);
      },
    ),
  );
  // long-press: held past the threshold with no up and no movement.
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: LONG_PRESS_MS, max: LONG_PRESS_MS + 2000 }),
      (seed, hold) => {
        const p: Vec2 = [seed % 100, seed % 60];
        const intent = recognize({ down: { pos: p, time: 0 }, up: null, now: hold });
        expect(intent[0]).toBe("long-press");
        expect(intent[1]).toEqual(p);
      },
    ),
  );
  // drag: beyond the tap slop and slower than the flick threshold.
  fc.assert(
    fc.property(fc.integer({ min: 12, max: 150 }), fc.integer({ min: 600, max: 2000 }), (dist, dt) => {
      const from: Vec2 = [0, 0];
      const to: Vec2 = [dist, 0];
      expect(dist / dt).toBeLessThan(FLICK_MIN_VELOCITY);
      const intent = recognize({ down: { pos: from, time: 0 }, up: { pos: to, time: dt } });
      expect(intent[0]).toBe("drag");
      expect(intent[1]).toEqual(from);
      expect(intent[2]).toEqual(to);
    }),
  );
  // flick: beyond the tap slop and at or above the flick threshold.
  fc.assert(
    fc.property(fc.integer({ min: 50, max: 300 }), fc.integer({ min: 10, max: 400 }), (dist, dt) => {
      // speed = dist/dt must reach the flick threshold.
      fc.pre(dt <= dist / FLICK_MIN_VELOCITY - 1);
      const intent = recognize({
        down: { pos: [0, 0], time: 0 },
        up: { pos: [dist, 0], time: dt },
      });
      expect(intent[0]).toBe("flick");
      expect(intent[1]).toBeGreaterThan(0);
    }),
  );
  // pinch: two pointers, the intent carries the scale and centre.
  fc.assert(
    fc.property(fc.integer({ min: 40, max: 100 }), fc.constantFrom(1.5, 2, 0.5), (d0, f) => {
      const a: Vec2 = [100, 100];
      const b0: Vec2 = [100 + d0, 100];
      const b1: Vec2 = [100 + d0 * f, 100];
      const intent = recognize({
        down: { pos: a, time: 0 },
        up: null,
        second: { down: { pos: b0, time: 10 }, up: { pos: b1, time: 200 } },
      });
      expect(intent[0]).toBe("pinch");
      expect(intent[1]).toBeCloseTo(f, 5);
      expect(intent[2]).toEqual([100 + (d0 * f) / 2, 100]);
    }),
  );
  // The tap classifier the recognizer builds on keeps its thresholds.
  expect(
    classifyTap({ pos: [0, 0], time: 0 }, { pos: [TAP_SLOP_PX, 0], time: TAP_TIMEOUT_MS }),
  ).toBe("tap");
});

// ---------------------------------------------------------------------------
// p_keyboard_bridge — soft_keyboard_bridge
// ---------------------------------------------------------------------------

// p_keyboard_bridge — derives_from: ui.mobile.soft_keyboard_bridge
// generator: focus then input events
// predicate: insert, backspace and enter effects are emitted
it("p_keyboard_bridge: insert, backspace and enter effects are emitted", () => {
  const TEXT_PATH: Path = [["keypath", "text"]];
  const EXTRA_PATH: Path = [["keypath", "extra"]];
  let state: Record<string, unknown> = {
    text: null,
    extra: initialTextareaExtra(),
    focus: null,
  };
  const props = () => ({
    text: state["text"] as string | null,
    textPath: TEXT_PATH,
    extraPath: EXTRA_PATH,
    focus: state["focus"],
    state: state["extra"] as TextareaExtra,
    font: null,
    indexForPosition: () => 0,
  });
  const view = () => textarea(props()) as EventElem;

  // Focusing a textarea focuses the hidden input so the OS keyboard opens.
  const bridge = makeKeyboardBridge();
  expect(bridge.hiddenFocused()).toBe(false);
  state = setPath(state, [["keypath", "focus"]], TEXT_PATH) as Record<string, unknown>;
  bridge.focus(TEXT_PATH);
  expect(bridge.hiddenFocused()).toBe(true);
  bridge.focus(null);
  expect(bridge.hiddenFocused()).toBe(false);
  bridge.focus(TEXT_PATH);

  // Input events become key-press events; the textarea emits the
  // insert, backspace and enter effects.
  const run = (events: ReturnType<typeof bridgeEvents>): IntentList =>
    events.flatMap((e) => dispatch(view(), e));
  const inserts = run(bridgeEvents({ kind: "input", data: "a" }));
  expect(inserts).toEqual([["insert-text", "a", TEXT_PATH, EXTRA_PATH]]);
  const backspaces = run(bridgeEvents({ kind: "keydown", key: "Backspace" }));
  expect(backspaces).toEqual([["delete-backward", TEXT_PATH, EXTRA_PATH]]);
  const enters = run(bridgeEvents({ kind: "keydown", key: "Enter" }));
  expect(enters).toEqual([["insert-newline", TEXT_PATH, EXTRA_PATH]]);

  // Applying them edits the text: insert, then backspace removes the
  // character, then enter leaves a newline.
  for (const intents of [inserts, backspaces, enters]) {
    state = applyTextareaIntents(state, intents).state as Record<string, unknown>;
  }
  expect(state["text"]).toBe("\n");

  // Composition is applied as one insert at the end (ime_compose).
  const composed = run(bridgeEvents({ kind: "composition-end", data: "café" }));
  expect(composed).toEqual([["insert-text", "café", TEXT_PATH, EXTRA_PATH]]);

  // Generalized property: any input string inserts exactly that string.
  fc.assert(
    fc.property(fc.string({ maxLength: 50 }).filter((s) => s.length > 0), (s) => {
      const intents = run(bridgeEvents({ kind: "input", data: s }));
      expect(intents).toEqual([["insert-text", s, TEXT_PATH, EXTRA_PATH]]);
    }),
  );
});

// ---------------------------------------------------------------------------
// p_avoid — keyboard_avoidance
// ---------------------------------------------------------------------------

// p_avoid — derives_from: ui.mobile.keyboard_avoidance
// generator: random focus positions
// predicate: the focused textarea is inside the visible area
it("p_avoid: the focused textarea is inside the visible area", () => {
  fc.assert(
    fc.property(
      fc.nat(2000),
      fc.integer({ min: 1, max: 200 }),
      fc.integer({ min: 300, max: 1000 }),
      fc.integer({ min: 480, max: 2000 }),
      (focusTop, focusHeight, keyboardTop, viewportHeight) => {
        fc.pre(focusHeight < keyboardTop);
        fc.pre(keyboardTop <= viewportHeight);
        const scroll = avoidScroll(focusTop, focusHeight, viewportHeight, keyboardTop);
        const top = focusTop - scroll;
        // The focused textarea sits fully inside the visible area —
        // the viewport above the keyboard.
        expect(top).toBeGreaterThanOrEqual(0);
        expect(top + focusHeight).toBeLessThanOrEqual(keyboardTop);
        // Scrolling never goes backwards.
        expect(scroll).toBeGreaterThanOrEqual(0);
        // Already-visible textareas are not scrolled at all.
        if (focusTop + focusHeight <= keyboardTop) expect(scroll).toBe(0);
      },
    ),
  );
  // Integration: the mobile todo root's focused textarea is brought
  // into the visible area above the keyboard.
  const size: Vec2 = [320, 640];
  const root = mobileTodoView(todoState([{ description: "first" }]), size);
  expect(root.textareaRects.length).toBeGreaterThan(0);
  const rect = root.textareaRects[0]!;
  const keyboardTop = 400;
  const scroll = avoidScroll(rect.origin[1], rect.size[1], size[1], keyboardTop);
  expect(rect.origin[1] - scroll).toBeGreaterThanOrEqual(0);
  expect(rect.origin[1] - scroll + rect.size[1]).toBeLessThanOrEqual(keyboardTop);
});

// ---------------------------------------------------------------------------
// p_handles — selection_handles
// ---------------------------------------------------------------------------

// p_handles — derives_from: ui.mobile.selection_handles
// generator: long-press on a word
// predicate: the word is selected and two handles exist
it("p_handles: the word is selected and two handles exist", () => {
  // The spec's example: a long-press on a word of "hello world".
  const text = "hello world";
  const sel = longPressSelection(text, 7);
  expect(sel).toEqual({ start: 6, end: 11 });
  const handles = selectionHandles(text, sel);
  expect(handles).toHaveLength(2);
  expect(handles[0]!.which).toBe("start");
  expect(handles[1]!.which).toBe("end");
  expect(handles[0]!.index).toBe(6);
  expect(handles[1]!.index).toBe(11);

  // The handles feed the drag-selection path: dragging an end handle
  // to another index re-selects through that index.
  const dragged = dragHandle(text, sel, "end", 8);
  expect(dragged).toEqual({ start: 6, end: 8 });

  // Generalized property: for any word in any text, a long-press
  // inside it selects exactly that whitespace-bounded word and yields
  // exactly two handles at its edges.
  fc.assert(
    fc.property(
      fc.array(fc.string({ maxLength: 8 }).filter((s) => s.length > 0 && !/\s/.test(s)), {
        minLength: 1,
        maxLength: 5,
      }),
      fc.nat(4),
      (words, pick) => {
        const text2 = words.join(" ");
        const wordIndex = Math.min(pick, words.length - 1);
        // An index inside the chosen word.
        let start = 0;
        for (let i = 0; i < wordIndex; i++) start += words[i]!.length + 1;
        const idx = start + Math.floor(words[wordIndex]!.length / 2);
        const sel2 = longPressSelection(text2, idx);
        expect(text2.slice(sel2.start, sel2.end)).toBe(words[wordIndex]);
        const handles2 = selectionHandles(text2, sel2);
        expect(handles2).toHaveLength(2);
        expect(handles2[0]!.index).toBe(sel2.start);
        expect(handles2[1]!.index).toBe(sel2.end);
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// p_rotate — orientation_supported
// ---------------------------------------------------------------------------

// p_rotate — derives_from: ui.mobile.orientation_supported
// generator: rotation during use
// predicate: state is deep-equal after rotation
it("p_rotate: state is deep-equal after rotation", () => {
  expect(rotatedSize([320, 640])).toEqual([640, 320]);
  expect(rotatedSize([640, 320])).toEqual([320, 640]);

  const backend = { containerSize: [320, 640] as readonly [number, number] | null };
  const state0 = todoState([{ description: "first" }]);
  const app = makeApp({
    view: (s, ctx) =>
      mobileTodoView(
        s as TodoState,
        (ctx[CONTAINER_SIZE_KEY] as Vec2 | undefined) ?? [320, 640],
      ).view,
    state: state0,
    backend,
  });
  // Use the app: add a todo through its dispatcher.
  app.dispatch([
    ["update", [["keypath", "todos"]], (t: readonly unknown[]) => [...t, { description: "new" }]],
  ]);
  const afterUse = app.getState();
  expect(afterUse).not.toEqual(state0);

  // Rotate the device: the backend reports the rotated size and the
  // root relayouts; the state is deep-equal — nothing was lost.
  backend.containerSize = rotatedSize(backend.containerSize!);
  const rotated = app.view();
  expect(rotated).toBeDefined();
  expect(app.getState()).toEqual(afterUse);
  // The relayout actually happened: the bottom bar follows the new
  // height's bottom third.
  const buttons = findAll(rotated, "button") as ButtonNode[];
  const add = buttons.find((b) => b.text === "Add Todo")!;
  const abs = absoluteOrigin(rotated, add);
  expect(abs[1]).toBeGreaterThanOrEqual((2 * 320) / 3);
});

// ---------------------------------------------------------------------------
// p_motion — reduced_motion
// ---------------------------------------------------------------------------

// p_motion — derives_from: ui.mobile.reduced_motion
// generator: the media query on
// predicate: no momentum frames are scheduled
it("p_motion: no momentum frames are scheduled", () => {
  expect(REDUCED_MOTION_QUERY).toBe("prefers-reduced-motion");
  // The media query on: no momentum frames are scheduled.
  const raf = vi.fn();
  const frames = momentumSchedule([0, 0], [5, 0], [1000, 100], [320, 100], {
    matchMedia: (q) => (q === REDUCED_MOTION_QUERY ? { matches: true } : undefined),
    raf,
    apply: () => {},
  });
  expect(frames).toEqual([]);
  expect(raf).not.toHaveBeenCalled();
  expect(
    prefersReducedMotion((q) => (q === REDUCED_MOTION_QUERY ? { matches: true } : undefined)),
  ).toBe(true);

  // Contrasting case: without the query the flick does schedule
  // decaying momentum frames.
  const raf2 = vi.fn();
  const frames2 = momentumSchedule([0, 0], [5, 0], [1000, 100], [320, 100], {
    matchMedia: () => ({ matches: false }),
    raf: raf2,
    apply: () => {},
  });
  expect(frames2.length).toBeGreaterThan(0);
  expect(raf2).toHaveBeenCalledTimes(frames2.length);
});

// ---------------------------------------------------------------------------
// p_theme — theme_aware
// ---------------------------------------------------------------------------

// p_theme — derives_from: ui.mobile.theme_aware
// generator: both color schemes
// predicate: tokens resolve in each
it("p_theme: tokens resolve in each", () => {
  // Both color schemes, exhaustively.
  expect(SCHEMES).toEqual(["light", "dark"]);
  expect(TOKENS.length).toBeGreaterThan(0);
  for (const scheme of SCHEMES) {
    for (const token of TOKENS) {
      const value = tokenValue(token, scheme);
      expect(value.length).toBeGreaterThanOrEqual(3);
      for (const c of value) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
        expect(Number.isFinite(c)).toBe(true);
      }
    }
  }
  // Colors follow prefers-color-scheme.
  expect(
    colorSchemePref((q) => (q === "prefers-color-scheme: dark" ? { matches: true } : undefined)),
  ).toBe("dark");
  expect(colorSchemePref(() => ({ matches: false }))).toBe("light");
  expect(colorSchemePref(() => undefined)).toBe("light");
  // The two themes differ on at least one token (explicit tokens for
  // both themes, not one shared palette).
  const differing = TOKENS.some(
    (t) => tokenValue(t, "light").join(",") !== tokenValue(t, "dark").join(","),
  );
  expect(differing).toBe(true);
});

// ---------------------------------------------------------------------------
// p_haptics — haptics_optional
// ---------------------------------------------------------------------------

// p_haptics — derives_from: ui.mobile.haptics_optional
// generator: vibrate present and absent
// predicate: no error either way
it("p_haptics: no error either way", () => {
  const calls: number[] = [];
  const present = { vibrate: (ms: number) => (calls.push(ms), true) };
  const absent = {};
  expect(TAP_VIBRATE_MS).toBeGreaterThan(0);
  fc.assert(
    fc.property(fc.constantFrom(present, absent, undefined, null), (nav) => {
      calls.length = 0;
      // No error either way.
      expect(() => tapHaptics(nav)).not.toThrow();
      if (nav === present) {
        // A short vibration on button taps where navigator.vibrate exists.
        expect(calls).toEqual([TAP_VIBRATE_MS]);
      } else {
        expect(calls).toEqual([]);
      }
    }),
  );
});

// ---------------------------------------------------------------------------
// p_no_hover — hover_off_on_touch
// ---------------------------------------------------------------------------

// p_no_hover — derives_from: ui.mobile.hover_off_on_touch
// generator: touch moves over a button
// predicate: hover? is never set
it("p_no_hover: hover? is never set", () => {
  const { app, $hover } = hoverWired("tap me");
  const btn = findAll(viewOf(app), "button")[0] as ButtonNode;
  const [w, h] = bounds(btn);
  // Touch moves over the button never set hover?.
  fc.assert(
    fc.property(
      fc.nat(Math.max(0, w)),
      fc.nat(Math.max(0, h + 2)),
      (x, y) => {
        app.send(mapTouchMove([x, y]));
        expect(select(app.getState(), $hover)).not.toBe(true);
      },
    ),
  );
  // Contrasting case: a mouse move does set it — the assertion above
  // is not vacuous.
  app.send(mouseMove([0, 0]));
  expect(select(app.getState(), $hover)).toBe(true);
  // And the mapped touch event carries the touch pointer type, which
  // is what keeps the hover machinery off.
  expect(mapTouchMove([0, 0]).pointerType).toBe("touch");
});

// ---------------------------------------------------------------------------
// scrollytelling-pin — the Pin (specs/scrollytelling-pin.md)
// ---------------------------------------------------------------------------

// The Pin under test: the scrollytelling.pin intent realized by
//   composing the ambient scrollview (the offset source) with
//   components.pinned_panel — no native document scroll, no position:
//   fixed.
import { call } from "../src/model/component.ts";
import { keyPress } from "../src/events/event.ts";
import { scrollview } from "../src/components/scrollview/scrollview.ts";
import { isGroup, spacer, type SpacerNode } from "../src/views/model.ts";
import { pin } from "../src/scrollytelling/pin.ts";

// A leaf node with its accumulated screen position: every translate on
// the way down applied — the ambient scrollview frame's [-ox, -oy]
// (components.scrollview.content_translated) plus the document's own
// translates.
interface Positioned {
  readonly node: Node;
  readonly pos: Vec2;
}

function walkScreen(elem: unknown, acc: Vec2, out: Positioned[]): void {
  if (elem == null) return;
  if (Array.isArray(elem)) {
    for (const e of elem as readonly unknown[]) walkScreen(e, acc, out);
    return;
  }
  const n = elem as {
    type?: string;
    drawables?: readonly unknown[];
    drawable?: unknown;
    x?: number;
    y?: number;
  };
  switch (n.type) {
    case "translate":
      walkScreen(n.drawable, [acc[0] + (n.x ?? 0), acc[1] + (n.y ?? 0)], out);
      return;
    case "handler":
    case "wrap":
    case "bubble":
    case "with-color":
    case "with-style":
    case "with-stroke-width":
      for (const d of n.drawables ?? []) walkScreen(d, acc, out);
      return;
    default:
      out.push({ node: elem as Node, pos: acc });
  }
}

// The painted leaves of a rendered frame, in painting order (later
// paints on top).
function screenPos(elem: unknown): readonly Positioned[] {
  const out: Positioned[] = [];
  walkScreen(elem, [0, 0], out);
  return out;
}

// The pin's target element in a rendered frame, by its authored width
// marker.
function findTarget(frame: unknown, marker: number): Vec2 {
  const hit = screenPos(frame).find(
    ({ node }) =>
      !isGroup(node) &&
      (node as Node).type === "rectangle" &&
      (node as { width: number }).width === marker,
  );
  if (hit === undefined) throw new Error("target not found in rendered frame");
  return hit.pos;
}

// The pin's reserved slot spacer: the first drawable of the pin's output
// (unwrapping the key-press boundary wrapper), as its height.
function pinSpacerHeight(pinTree: unknown): number {
  const wrapped = pinTree as HandlerNode;
  const content = wrapped.drawables[0];
  const parts: readonly unknown[] = isGroup(content) ? content : [content];
  const first = parts[0] as SpacerNode | undefined;
  if (first == null || Array.isArray(first) || first.type !== "spacer") {
    throw new Error("expected the reserved spacer first in the pin's output");
  }
  return first.y;
}

// One composed frame: the pin at its document slot inside a real
// scrollview with the ambient offset. context.scroll is the offset
// source — the scrollview's own stored offset, wired at the view layer
// (the scrollview component itself does not publish context).
function pinFrame(opts: {
  readonly start: number;
  readonly duration: number;
  readonly body: Elem;
  readonly slot: Vec2;
  readonly offset: Vec2;
  readonly viewport: Vec2;
  readonly pinState?: string;
}): Elem {
  const { start, duration, body, slot, offset, viewport } = opts;
  const args: Record<string, unknown> = { duration, body, start };
  if (opts.pinState !== undefined) args["pin-state"] = opts.pinState;
  const pinTree = render(
    call(pin, args, { context: { scroll: offset } }),
  ) as Elem;
  return render(
    call(
      scrollview,
      {
        offset,
        "scroll-bounds": viewport,
        body: [translate(slot[0], slot[1], pinTree)],
      },
    ),
  ) as Elem;
}

// A headless app with a pinned document: the scrollview's stored offset
// in state, the pin's lifecycle state beside it, and the pin's target
// carrying a width marker inside its body (after a button — the last
// interactive element inside the pin).
function pinApp(spec: {
  readonly start: number;
  readonly duration: number;
  readonly oy: number;
  readonly ox: number;
  readonly vw: number;
  readonly vh: number;
  readonly slot: Vec2;
  readonly w: number;
}): { app: HeadlessApp; $pin: Path; marker: number } {
  const marker = spec.w + 1000;
  const $pin: Path = [["keypath", "pin_state"]];
  const body: Elem = [button("next"), rectangle(marker, 30)];
  const app = makeHeadlessApp({
    state: { pin_state: "unpinned", offset: [spec.ox, spec.oy] as Vec2 },
    view: (s) => {
      const st = s as { pin_state: string; offset: Vec2 };
      const pinTree = render(
        call(
          pin,
          {
            duration: spec.duration,
            body,
            start: spec.start,
            "pin-state": st.pin_state,
            "state-path": $pin,
          },
          { context: { scroll: st.offset } },
        ),
      ) as Elem;
      return render(
        call(scrollview, {
          offset: st.offset,
          "scroll-bounds": [spec.vw, spec.vh],
          body: [translate(spec.slot[0], spec.slot[1], pinTree)],
        }),
      ) as Elem;
    },
  });
  return { app, $pin, marker };
}

// position_constant_while_pinned — derives_from: scrollytelling.pin.fixed_during_active
// generator: `scroll_sweep_within_pin_boundary()`
// predicate: `viewport_position(target) is constant across every sampled frame`
it("position_constant_while_pinned: viewport_position(target) is constant across every sampled frame", () => {
  fc.assert(
    fc.property(
      fc.nat(200), // the Boundary start (content-space y)
      fc.nat(199).map((n) => n + 1), // the authored scroll duration d
      fc.nat(80), // ambient offset.x
      fc.nat(60), fc.nat(80), // target width/height
      fc.nat(90), fc.nat(140), // viewport
      (start, duration, ox, w, h, vw, vh) => {
        const marker = w + 1000;
        const target = rectangle(marker, h);
        // the pin's document slot is the Boundary start: the pin
        // activates as its slot reaches the viewport top
        let first: Vec2 | undefined;
        for (let i = 0; i <= 4; i++) {
          const oy = start + (duration * i) / 4; // every sampled frame inside the Boundary
          const frame = pinFrame({
            start,
            duration,
            body: target,
            slot: [0, start],
            offset: [ox, oy],
            viewport: [vw, vh],
          });
          const pos = findTarget(frame, marker);
          if (first === undefined) {
            first = pos;
          } else {
            expect(pos).toEqual(first);
          }
        }
      },
    ),
  );
});

// spacer_matches_duration — derives_from: scrollytelling.pin.spacer_reserves_height
// generator: `pin_with(authored_duration: d)`
// predicate: `spacer_height == d`
it("spacer_matches_duration: spacer_height == d", () => {
  fc.assert(
    fc.property(
      fc.nat(300), // the authored duration d
      fc.nat(60), // target width
      fc.nat(100), // the Boundary start
      (d, w, start) => {
        const body = rectangle(w, 40);
        // the spacer reserves the authored height in every frame — active
        // (including both Boundary ends) and inactive alike
        for (const oy of [start, start + Math.floor(d / 2), start + d, start + d + 3]) {
          const tree = render(
            call(pin, { duration: d, body, start }, { context: { scroll: [0, oy] } }),
          ) as Elem;
          expect(pinSpacerHeight(tree)).toBe(d);
        }
        // and in the released lifecycle too — the Pin back in native flow
        // still reserves its slot with the same authored height
        const released = render(
          call(
            pin,
            { duration: d, body, start, "pin-state": "released" },
            { context: { scroll: [0, start] } },
          ),
        ) as Elem;
        expect(pinSpacerHeight(released)).toBe(d);
      },
    ),
  );
});

// no_visual_jump_on_release — derives_from: scrollytelling.pin.release_no_jump
// generator: `scroll_past_pin_end_boundary()`
// predicate: `rendered_position(frame_before_release) == rendered_position(frame_after_release)`
it("no_visual_jump_on_release: rendered_position(frame_before_release) == rendered_position(frame_after_release)", () => {
  fc.assert(
    fc.property(
      fc.nat(200),
      fc.nat(199).map((n) => n + 1),
      fc.nat(80),
      fc.nat(60),
      fc.nat(90), fc.nat(140),
      (start, duration, ox, w, vw, vh) => {
        const end = start + duration;
        const marker = w + 1000;
        const target = rectangle(marker, 40);
        const slot: Vec2 = [0, start];
        // the last pinned frame before the boundary: the body fixed at the
        // release-boundary screen position
        const before = findTarget(
          pinFrame({ start, duration, body: target, slot, offset: [ox, end - 1], viewport: [vw, vh] }),
          marker,
        );
        // the release frame: at the Boundary end the pin releases and
        // control returns to native flow within the same frame — the
        // released lifecycle draws the body in its native document slot
        const after = findTarget(
          pinFrame({ start, duration, body: target, slot, offset: [ox, end], viewport: [vw, vh], pinState: "released" }),
          marker,
        );
        expect(after).toEqual(before);
        // past the Boundary the body scrolls with the content again —
        // native flow resumed, the pin no longer fixes the position
        const later = findTarget(
          pinFrame({ start, duration, body: target, slot, offset: [ox, end + 2], viewport: [vw, vh], pinState: "released" }),
          marker,
        );
        expect(later).toEqual([before[0], before[1] - 2]);
      },
    ),
  );
});

// resize_recomputes_spacer — derives_from: scrollytelling.pin.spacer_recomputed_on_resize
// generator: `resize_pinned_target_then_refresh()`
// predicate: `spacer_height == new authored duration`
it("resize_recomputes_spacer: spacer_height == new authored duration", () => {
  fc.assert(
    fc.property(
      fc.nat(150), // the authored duration before the resize
      fc.nat(60), fc.nat(60), // target widths before/after
      fc.nat(100), // the Boundary start
      fc.nat(80), // ambient offset.x
      (d1, w1, w2, start, ox) => {
        // the target is resized: the duration is re-authored (d2 ≠ d1)
        const d2 = 300 - d1;
        const oy = start; // the refresh happens while the Pin is active
        // before: the spacer reserves the originally authored duration
        const beforeTree = render(
          call(pin, { duration: d1, body: rectangle(w1, 40), start }, { context: { scroll: [ox, oy] } }),
        ) as Elem;
        expect(pinSpacerHeight(beforeTree)).toBe(d1);
        // after the resize the next refresh is a plain re-render — nothing
        // is cached (render_pure) — so the spacer is recomputed to the new
        // authored duration, not the stale one
        const afterTree = render(
          call(pin, { duration: d2, body: rectangle(w2, 90), start }, { context: { scroll: [ox, oy] } }),
        ) as Elem;
        expect(pinSpacerHeight(afterTree)).toBe(d2);
      },
    ),
  );
});

// nested_priority_resolved — derives_from: scrollytelling.pin.nested_pin_priority
// generator: `two_nested_pins(priority: unset)`
// predicate: `stacking_order == document_order`
it("nested_priority_resolved: stacking_order == document_order", () => {
  fc.assert(
    fc.property(
      fc.nat(199).map((n) => n + 1), // outer pin's authored duration
      fc.nat(199).map((n) => n + 1), // inner pin's authored duration
      fc.nat(60), fc.nat(40), // marker widths
      fc.nat(80), fc.nat(90), fc.nat(140),
      (outerD, innerD, wOuter, wInner, ox, vw, vh) => {
        const outerMarker = wOuter + 2000;
        const innerMarker = wInner + 3000;
        // both pins simultaneously active: the shared Boundary encloses
        // the sampled offset for both
        const oy = Math.max(outerD, innerD);
        // the inner pin is nested inside the outer pin's body, after the
        // outer's own target; priority is unset on both (no z prop)
        const inner = call(
          pin,
          { duration: innerD, body: rectangle(innerMarker, 25), start: 0 },
          { context: { scroll: [ox, oy] } },
        );
        const innerTree = render(inner) as Elem;
        const outerTree = render(
          call(
            pin,
            { duration: outerD, body: [rectangle(outerMarker, 40), innerTree], start: 0 },
            { context: { scroll: [ox, oy] } },
          ),
        ) as Elem;
        const frame = render(
          call(scrollview, {
            offset: [ox, oy],
            "scroll-bounds": [vw, vh],
            body: [outerTree],
          }),
        ) as Elem;
        const flat = screenPos(frame);
        const index = (marker: number): number => {
          const i = flat.findIndex(
            ({ node }) =>
              !isGroup(node) &&
              (node as Node).type === "rectangle" &&
              (node as { width: number }).width === marker,
          );
          if (i < 0) throw new Error(`marker ${marker} not painted`);
          return i;
        };
        // priority unset: painting order is document order — the nested
        // (later in the document) pin paints on top of the outer's target
        expect(index(innerMarker)).toBeGreaterThan(index(outerMarker));
      },
    ),
  );
});

// tab_out_releases_focus — derives_from: scrollytelling.pin.focus_releases_pin
// generator: `tab_past_last_interactive_element_in_pin()`
// predicate: `check(pin_state) == released`
it("tab_out_releases_focus: check(pin_state) == released", () => {
  fc.assert(
    fc.property(
      fc.nat(150),
      fc.nat(199).map((n) => n + 1),
      fc.nat(60),
      fc.nat(90), fc.nat(140),
      (start, duration, w, vw, vh) => {
        const oy = start; // inside the Boundary: the Pin is active
        const { app, $pin, marker } = pinApp({
          start,
          duration,
          oy,
          ox: 0,
          vw,
          vh,
          slot: [0, start],
          w,
        });
        // before: the target is pinned at the boundary screen position
        const pinnedPos = findTarget(app.render(), marker);
        // focus would move past the last interactive element inside the
        // active Pin: the tab key-press reaches the pin's boundary
        app.send(keyPress("tab"));
        // check(pin_state) == released
        expect(select(app.getState(), $pin)).toBe("released");
        // and the release is real: the body is back in native flow at its
        // own document slot (not trapped at the pinned position)
        expect(findTarget(app.render(), marker)).toEqual([
          pinnedPos[0],
          pinnedPos[1] + duration,
        ]);
        // the release is sticky while the scroll stays inside the Boundary
        app.send(keyPress("tab"));
        expect(select(app.getState(), $pin)).toBe("released");
      },
    ),
  );
  // a non-tab key does not release the pin
  const steady = pinApp({
    start: 5,
    duration: 10,
    oy: 5,
    ox: 0,
    vw: 90,
    vh: 140,
    slot: [0, 5],
    w: 20,
  });
  steady.app.send(keyPress("q"));
  expect(select(steady.app.getState(), steady.$pin)).toBe("unpinned");
  // and a tab on an inactive Pin (offset past the Boundary end) neither
  // releases nor pins
  const inactive = pinApp({
    start: 5,
    duration: 10,
    oy: 16,
    ox: 0,
    vw: 90,
    vh: 140,
    slot: [0, 5],
    w: 20,
  });
  inactive.app.send(keyPress("tab"));
  expect(select(inactive.app.getState(), inactive.$pin)).toBe("unpinned");
});
