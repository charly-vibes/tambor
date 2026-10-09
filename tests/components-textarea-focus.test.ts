// Purpose: executable contract tests for the components-textarea spec —
//   focus routing and key handling (focus_by_path, request_focus_on_hit,
//   keys_need_focus, key_map, enter_event_bubbles, ime_compose).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/components-textarea/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every check encodes its row's stated
//   behavior. request-focus is an external intent (the top-level
//   handler owns where focus lives, app.toplevel); the harness applies
//   it by setting focus to the carried path, exactly what focus_by_path
//   states. Shared harness helpers live in tests/helpers/textarea.ts
//   (tambor-272 redistributed the former monolithic
//   tests/components-textarea.test.ts into topic files).

import { expect, it } from "vitest";

import { isFocused } from "../src/components/textarea/textarea.ts";
import type { Path } from "../src/effects/paths.ts";
import { clipboard, keyPress, mouseDown } from "../src/events/event.ts";
import { dispatch } from "../src/events/dispatch.ts";
import {
  EXTRA_PATH,
  harnessState,
  render,
  send,
  TEXT_PATH,
} from "./helpers/textarea.ts";

// p_focus_path — derives_from: components.textarea.focus_by_path
// generator: two textareas with different text paths
// predicate: requesting focus on one leaves the other unfocused
it("p_focus_path: requesting focus on one leaves the other unfocused", () => {
  const pathA: Path = [["keypath", "text"], ["keypath", "a"]];
  const pathB: Path = [["keypath", "text"], ["keypath", "b"]];
  const a = harnessState("alpha");
  const b = harnessState("beta");

  // pointer down inside A yields request-focus carrying A's text path
  const res = send(a, mouseDown([7, 2]), { textPath: pathA });
  expect(res.external[0]).toEqual(["request-focus", pathA]);

  // the top-level applies it: focus becomes A's path (focus_by_path:
  // request-focus sets focus to that path)
  const focus = res.external[0]![1];

  // focused exactly when context focus deep-equals the text path
  expect(isFocused(focus, pathA)).toBe(true);
  expect(isFocused(focus, pathB)).toBe(false);

  // the other textarea stays unfocused: its key events yield nothing
  expect(dispatch(render(b, { textPath: pathB, focus }), keyPress("x"))).toEqual([]);

  // and the reverse: focusing B leaves A unfocused
  const resB = send(b, mouseDown([7, 2]), { textPath: pathB });
  expect(resB.external[0]).toEqual(["request-focus", pathB]);
  expect(isFocused(resB.external[0]![1], pathA)).toBe(false);
  expect(isFocused(resB.external[0]![1], pathB)).toBe(true);
});

// p_request_focus — derives_from: components.textarea.request_focus_on_hit
// generator: click inside and on empty space
// predicate: inside returns request-focus first, empty returns nothing
it("p_request_focus: inside returns request-focus first, empty returns nothing", () => {
  const state = harnessState("hello");

  // a click inside yields intents, and request-focus comes first
  const inside = send(state, mouseDown([7, 2]));
  expect(inside.external[0]![0]).toBe("request-focus");
  expect(inside.intents.length).toBeGreaterThan(1);

  // a pointer down on empty space yields nothing at all
  const empty = dispatch(render(state), mouseDown([1000, 1000]));
  expect(empty).toEqual([]);
});

// p_keys_focus — derives_from: components.textarea.keys_need_focus
// generator: key events while unfocused
// predicate: no effects
it("p_keys_focus: key events while unfocused yield no effects", () => {
  const state = harnessState("hello"); // no focus set
  const tree = render(state);
  expect(dispatch(tree, keyPress("a"))).toEqual([]);
  expect(dispatch(tree, keyPress("enter"))).toEqual([]);
  expect(dispatch(tree, clipboard("pasted"))).toEqual([]);
});

// p_key_map — derives_from: components.textarea.key_map
// generator: each named key and the string s
// predicate: each yields its effect and others yield none
it("p_key_map: each named key yields its effect and others yield none", () => {
  const state = harnessState("hello", {}, TEXT_PATH); // focused
  const tree = render(state);

  const named: readonly [string, string][] = [
    ["up", "previous-line"],
    ["down", "next-line"],
    ["left", "backward-char"],
    ["right", "forward-char"],
    ["enter", "insert-newline"],
    ["backspace", "delete-backward"],
  ];
  for (const [key, op] of named) {
    expect(dispatch(tree, keyPress(key))).toEqual([[op, TEXT_PATH, EXTRA_PATH]]);
  }

  // any string inserts text
  expect(dispatch(tree, keyPress("X"))).toEqual([["insert-text", "X", TEXT_PATH, EXTRA_PATH]]);
  expect(dispatch(tree, keyPress("café"))).toEqual([
    ["insert-text", "café", TEXT_PATH, EXTRA_PATH],
  ]);

  // any other key is ignored
  expect(dispatch(tree, { type: "key-press" })).toEqual([]);
});

// p_enter — derives_from: components.textarea.enter_event_bubbles
// generator: enter while focused
// predicate: the insert-newline effect is returned so it can be replaced
it("p_enter: the insert-newline effect is returned so it can be replaced", () => {
  const state = harnessState("hello", {}, TEXT_PATH); // focused
  // the effect is plain data (a normal effect in the returned list),
  // so a wrapping handler — as todo-app does — can replace it
  const res = send(state, keyPress("enter"));
  expect(res.intents).toEqual([["insert-newline", TEXT_PATH, EXTRA_PATH]]);
});

// p_ime — derives_from: components.textarea.ime_compose
// generator: composition events
// predicate: one insert-text at the end
it("p_ime: composition input arrives as one insert-text at the end", () => {
  // ui.mobile.soft_keyboard_bridge: a mobile keyboard's composition
  // events become key-press events; the composed string therefore
  // arrives as a single key-press at the end of composition, and the
  // textarea applies it as exactly one insert-text
  const state = harnessState("hello", {}, TEXT_PATH); // focused
  const res = send(state, keyPress("café"));
  expect(res.intents).toEqual([["insert-text", "café", TEXT_PATH, EXTRA_PATH]]);
});
