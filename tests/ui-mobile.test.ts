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
  type Node,
  type Vec2,
} from "../src/views/model.ts";
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
import { setPath, type Path } from "../src/effects/paths.ts";
import {
  applyTextareaIntents,
  initialTextareaExtra,
} from "../src/components/textarea/edit.ts";
import { textarea } from "../src/components/textarea/textarea.ts";
import { hoverButton } from "../src/components/hover/hover.ts";
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
  return children(node).flatMap((child) => findAll(child, type));
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
    for (const child of children(node)) walk(child, ox + dx, oy + dy);
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
  const btn = (view()[0]) as ButtonNode;
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
  const [xw, xh] = bounds(x.node.drawables[0] as Node);
  const cx = x.origin[0] + xw / 2;
  const cy = x.origin[1] + xh / 2;
  // 15 px right of the centre: outside the 10 by 10 drawn bounds.
  const touch = mapTouchDown([cx + 15, cy]);
  expect(slopDispatch(row, touch)).toEqual([["delete", TODO_PATH]]);
  // The drawn bounds stay 10 by 10 — no padded node entered the view.
  expect(bounds(x.node.drawables[0] as Node)).toEqual([10, 10]);
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
      fc.pre(dt <= (dist * 2) / FLICK_MIN_VELOCITY - 1);
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
    state: state["extra"],
    font: null,
    indexForPosition: () => 0,
  });
  const view = () => textarea(props()) as EventElem;

  // Focusing a textarea focuses the hidden input so the OS keyboard opens.
  const bridge = makeKeyboardBridge();
  expect(bridge.hiddenFocused()).toBe(false);
  state = setPath(state, [["keypath", "focus"]], TEXT_PATH);
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
    state = applyTextareaIntents(state, intents, (s) => s).state as Record<string, unknown>;
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
  const { app } = hoverWired("tap me");
  const btn = findAll(viewOf(app), "button")[0] as ButtonNode;
  const [w, h] = bounds(btn);
  // Touch moves over the button never set hover?.
  fc.assert(
    fc.property(
      fc.nat(Math.max(0, w)),
      fc.nat(Math.max(0, h + 2)),
      (x, y) => {
        app.send(mapTouchMove([x, y]));
        const root = (app.getState() ?? {}) as Record<string, unknown>;
        const extra = (root["::extra"] ?? {}) as Record<string, unknown>;
        expect(extra["hover?"]).not.toBe(true);
      },
    ),
  );
  // Contrasting case: a mouse move does set it — the assertion above
  // is not vacuous.
  app.send(mouseMove([0, 0]));
  const root = (app.getState() ?? {}) as Record<string, unknown>;
  const extra = (root["::extra"] ?? {}) as Record<string, unknown>;
  expect(extra["hover?"]).toBe(true);
  // And the mapped touch event carries the touch pointer type, which
  // is what keeps the hover machinery off.
  expect(mapTouchMove([0, 0]).pointerType).toBe("touch");
});
