// Purpose: executable contract tests for the ui-mobile spec's soft
//   keyboard rows — the OS-keyboard bridge (focus, input events) and
//   keyboard avoidance scrolling.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/ui-mobile/spec.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text).
//   tambor-272: redistributed from the former monolithic
//   tests/ui-mobile.test.ts — test names are byte-identical contract
//   bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

import type { Vec2 } from "../src/views/model.ts";
import type { EventElem, IntentList } from "../src/events/bubble.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { setPath, type Path } from "../src/effects/paths.ts";
import {
  applyTextareaIntents,
  initialTextareaExtra,
  type TextareaExtra,
} from "../src/components/textarea/edit.ts";
import { textarea } from "../src/components/textarea/textarea.ts";

// The ui-mobile layer under test (src/ui/).
import { bridgeEvents, makeKeyboardBridge } from "../src/ui/keyboard.ts";
import { avoidScroll } from "../src/ui/avoid.ts";
import {
  mobileTodoView,
  todoState,
} from "../src/ui/fixture_todo.ts";

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
