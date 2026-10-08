// Purpose: executable contract tests for the components-textarea spec —
//   the textarea component (the basic_components.cljc port).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-textarea.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every check encodes its row's stated
//   behavior. The test state mirrors text_state_split: text and focus
//   live in the app state (top-level keys here), while cursor,
//   select-cursor, down-pos, mpos and last-click live under the
//   textarea-state extra map. request-focus is an external intent (the
//   top-level handler owns where focus lives, app.toplevel); the
//   harness applies it by setting focus to the carried path, exactly
//   what focus_by_path states. Clipboard event encoding: data
//   "copy"/"cut" trigger the copy/cut ops; any other data string is a
//   paste carrying its string (backend_render clipboard_service says
//   paste events carry the string; copy/cut event encoding is an
//   interim convention flagged to the corpus owner).

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  applyTextareaIntents,
  initialTextareaExtra,
  type TextareaExtra,
} from "../src/components/textarea/edit.ts";
import { isFocused, textarea, type TextareaProps } from "../src/components/textarea/textarea.ts";
import type { Path } from "../src/effects/paths.ts";
import type { IntentList } from "../src/events/bubble.ts";
import {
  clipboard,
  keyPress,
  mouseDown,
  mouseMove,
  mouseUp,
  type TamborEvent,
} from "../src/events/event.ts";
import { dispatch } from "../src/events/dispatch.ts";

// text and focus are app state (text_state_split); textarea-state is
// the extra map.
const TEXT_PATH: Path = [["keypath", "text"]];
const EXTRA_PATH: Path = [["keypath", "textarea-state"]];

// An opaque font handle: indexForPosition is a backend service
// (backend.render.backend_contract), so the tests inject a stub with
// monospace-ish metrics (one cell per character, like the text
// backend's default measure).
const FONT = { family: "test" };
const stubIndex = (_font: unknown, text: string, x: number, _y: number): number =>
  Math.max(0, Math.min(text.length, Math.round(x)));

type HarnessState = {
  text: string | null;
  focus: unknown;
  "textarea-state": TextareaExtra;
};

function harnessState(
  text: string | null,
  extra: Partial<TextareaExtra> = {},
  focus: unknown = null,
): HarnessState {
  return { text, focus, "textarea-state": initialTextareaExtra(extra) };
}

type PropsOverrides = Partial<TextareaProps>;

function render(state: HarnessState, overrides: PropsOverrides = {}) {
  return textarea({
    text: state.text,
    textPath: TEXT_PATH,
    extraPath: EXTRA_PATH,
    focus: state.focus,
    state: state["textarea-state"],
    font: FONT,
    indexForPosition: stubIndex,
    ...overrides,
  });
}

// One routed event: dispatch into the rendered tree, then apply the
// returned intents through the textarea's interpreter. The external
// intents (request-focus, clipboard effects) come back separately.
function send(state: HarnessState, event: TamborEvent, overrides: PropsOverrides = {}) {
  const tree = render(state, overrides);
  const intents: IntentList = dispatch(tree, event);
  const applied = applyTextareaIntents(state, intents);
  return { tree, intents, state: applied.state, external: applied.external };
}

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
  const focus = res.external[0][1];

  // focused exactly when context focus deep-equals the text path
  expect(isFocused(focus, pathA)).toBe(true);
  expect(isFocused(focus, pathB)).toBe(false);

  // the other textarea stays unfocused: its key events yield nothing
  expect(dispatch(render(b, { textPath: pathB, focus }), keyPress("x"))).toEqual([]);

  // and the reverse: focusing B leaves A unfocused
  const resB = send(b, mouseDown([7, 2]), { textPath: pathB });
  expect(resB.external[0]).toEqual(["request-focus", pathB]);
  expect(isFocused(resB.external[0][1], pathA)).toBe(false);
  expect(isFocused(resB.external[0][1], pathB)).toBe(true);
});

// p_request_focus — derives_from: components.textarea.request_focus_on_hit
// generator: click inside and on empty space
// predicate: inside returns request-focus first, empty returns nothing
it("p_request_focus: inside returns request-focus first, empty returns nothing", () => {
  const state = harnessState("hello");

  // a click inside yields intents, and request-focus comes first
  const inside = send(state, mouseDown([7, 2]));
  expect(inside.external[0][0]).toBe("request-focus");
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

// p_insert — derives_from: components.textarea.insert_splice
// generator: text hello cursor 2 s XY and nil text
// predicate: hello becomes heXYllo cursor 4, and nil gives XY
it("p_insert: hello becomes heXYllo cursor 4, and nil gives XY", () => {
  const state = harnessState("hello", { cursor: 2 }, TEXT_PATH);
  const res = send(state, keyPress("XY"));
  expect(res.state.text).toBe("heXYllo");
  expect(res.state["textarea-state"].cursor).toBe(4);
  expect(res.state["textarea-state"]["select-cursor"]).toBe(null);

  // a nil text yields s
  const nil = harnessState(null, {}, TEXT_PATH);
  const resNil = send(nil, keyPress("XY"));
  expect(resNil.state.text).toBe("XY");
  expect(resNil.state["textarea-state"].cursor).toBe(2);
});

// p_insert_sel — derives_from: components.textarea.insert_replaces_selection
// generator: text hello cursor 4 select-cursor 1 s Z
// predicate: text becomes hZo cursor 2 selection nil
it("p_insert_sel: text becomes hZo cursor 2 selection nil", () => {
  const state = harnessState("hello", { cursor: 4, "select-cursor": 1 }, TEXT_PATH);
  const res = send(state, keyPress("Z"));
  expect(res.state.text).toBe("hZo");
  expect(res.state["textarea-state"].cursor).toBe(2);
  expect(res.state["textarea-state"]["select-cursor"]).toBe(null);
});

// p_delete — derives_from: components.textarea.delete_backward_rule
// generator: cursor 0, cursor 3 and a selection
// predicate: no change at 0, one char removed at 3, range removed with a selection
it("p_delete: no change at 0, one char removed at 3, range removed with a selection", () => {
  // a cursor at 0 removes nothing
  const atZero = harnessState("hello", { cursor: 0 }, TEXT_PATH);
  const r0 = send(atZero, keyPress("backspace"));
  expect(r0.state.text).toBe("hello");
  expect(r0.state["textarea-state"].cursor).toBe(0);

  // one char removed at 3
  const atThree = harnessState("hello", { cursor: 3 }, TEXT_PATH);
  const r3 = send(atThree, keyPress("backspace"));
  expect(r3.state.text).toBe("helo");
  expect(r3.state["textarea-state"].cursor).toBe(2);

  // with a selection the range is removed
  const selected = harnessState("hello", { cursor: 3, "select-cursor": 1 }, TEXT_PATH);
  const rs = send(selected, keyPress("backspace"));
  expect(rs.state.text).toBe("hlo");
  expect(rs.state["textarea-state"].cursor).toBe(1);
  expect(rs.state["textarea-state"]["select-cursor"]).toBe(null);
});

// p_cursor — derives_from: components.textarea.cursor_clamped
// generator: random moves
// predicate: 0 <= cursor <= len(text)
it("p_cursor: 0 <= cursor <= len(text) after random moves", () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 0, maxLength: 12 }),
      fc.integer({ min: 0, max: 15 }),
      fc.option(fc.integer({ min: 0, max: 12 }), { nilChance: 0.5 }),
      fc.constantFrom("left", "right"),
      (text, cursor, selectCursor, key) => {
        const state = harnessState(text, { cursor, "select-cursor": selectCursor }, TEXT_PATH);
        const res = send(state, keyPress(key));
        const cur = res.state["textarea-state"].cursor;
        expect(cur).toBeGreaterThanOrEqual(0);
        expect(cur).toBeLessThanOrEqual(text.length);
        // both moves clear the selection
        expect(res.state["textarea-state"]["select-cursor"]).toBe(null);
      },
    ),
  );
});

// p_prev_line — derives_from: components.textarea.previous_line_quirk
// generator: text ab newline cd with cursor 4
// predicate: cursor becomes 2 and the selection is cleared
it("p_prev_line: cursor becomes 2 and the selection is cleared", () => {
  const state = harnessState("ab\ncd", { cursor: 4, "select-cursor": 1 }, TEXT_PATH);
  const res = send(state, keyPress("up"));
  expect(res.state["textarea-state"].cursor).toBe(2);
  expect(res.state["textarea-state"]["select-cursor"]).toBe(null);
});

// p_next_line — derives_from: components.textarea.next_line_rule
// generator: the same text with cursor 0 and cursor 4
// predicate: cursor becomes 3 then 5
it("p_next_line: cursor becomes 3 then 5", () => {
  const atZero = harnessState("ab\ncd", { cursor: 0 }, TEXT_PATH);
  expect(send(atZero, keyPress("down")).state["textarea-state"].cursor).toBe(3);

  const atFour = harnessState("ab\ncd", { cursor: 4 }, TEXT_PATH);
  expect(send(atFour, keyPress("down")).state["textarea-state"].cursor).toBe(5);
});

// p_down_cursor — derives_from: components.textarea.pointer_down_cursor
// generator: click at a known glyph
// predicate: cursor, mpos and down-pos are set and selection is nil
it("p_down_cursor: cursor, mpos and down-pos are set and selection is nil", () => {
  const state = harnessState("hello", { cursor: 4, "select-cursor": 1 }, TEXT_PATH);
  // the click at [7, 2] is text position [2, 0] — the third glyph
  const res = send(state, mouseDown([7, 2]));
  const ex = res.state["textarea-state"];
  expect(ex.cursor).toBe(2);
  expect(ex.mpos).toEqual([2, 0]);
  expect(ex["down-pos"]).toEqual([2, 0]);
  expect(ex["select-cursor"]).toBe(null);
});

// p_drag — derives_from: components.textarea.drag_tracks
// generator: move with and without down-pos
// predicate: mpos is set only with down-pos
it("p_drag: mpos is set only with down-pos", () => {
  const withDown = harnessState("hello", { "down-pos": [1, 0] }, TEXT_PATH);
  const res = send(withDown, mouseMove([8, 2])); // frame [8,2] is text position [3,0]
  expect(res.state["textarea-state"].mpos).toEqual([3, 0]);

  // with no down-pos a move returns nothing
  const withoutDown = harnessState("hello");
  const noRes = send(withoutDown, mouseMove([8, 2]));
  expect(noRes.intents).toEqual([]);
  expect(noRes.state["textarea-state"].mpos).toBe(null);
});

// p_finish_drag — derives_from: components.textarea.finish_drag_rule
// generator: drag from index 1 to index 4
// predicate: selection and cursor follow the rule and down-pos is nil
it("p_finish_drag: selection and cursor follow the rule and down-pos is nil", () => {
  // down at index 1, move, up at index 4: start 1, end 4
  let s = harnessState("hello", {}, TEXT_PATH);
  s = send(s, mouseDown([6, 2])).state;
  s = send(s, mouseMove([8, 2])).state;
  const up = send(s, mouseUp([9, 2]));
  const ex = up.state["textarea-state"];
  expect(ex.cursor).toBe(1);
  expect(ex["select-cursor"]).toBe(4);
  expect(ex["down-pos"]).toBe(null);

  // the reverse drag: start 4 lies after end 1, so the selection start
  // is the down index plus one
  let r = harnessState("hello", {}, TEXT_PATH);
  r = send(r, mouseDown([9, 2])).state;
  const rup = send(r, mouseUp([6, 2]));
  const rex = rup.state["textarea-state"];
  expect(rex.cursor).toBe(5);
  expect(rex["select-cursor"]).toBe(1);
  expect(rex["down-pos"]).toBe(null);
});

// p_double_click — derives_from: components.textarea.double_click_word
// generator: two clicks 200 ms apart then 600 ms apart
// predicate: the first pair selects a word and the second does not
it("p_double_click: the first pair selects a word and the second does not", () => {
  const t0 = 1000;
  let s = harnessState("hello world", {}, TEXT_PATH);

  // the first click records the time and position, no selection
  s = send(s, mouseDown([7, 2]), { now: t0 }).state;
  expect(s["textarea-state"]["select-cursor"]).toBe(null);
  expect(s["textarea-state"]["last-click"]).toEqual({ pos: [2, 0], time: t0 });

  // the second click 200 ms later at the same spot: within 500 ms and
  // squared distance under 100 — selects the word
  s = send(s, mouseDown([7, 2]), { now: t0 + 200 }).state;
  expect(s["textarea-state"].cursor).toBe(0);
  expect(s["textarea-state"]["select-cursor"]).toBe(5);
  expect(s["textarea-state"]["last-click"]).toEqual({ pos: [2, 0], time: t0 + 200 });

  // a pair 600 ms apart does not select a word
  let p = harnessState("hello world", {}, TEXT_PATH);
  p = send(p, mouseDown([7, 2]), { now: t0 }).state;
  p = send(p, mouseDown([7, 2]), { now: t0 + 600 }).state;
  expect(p["textarea-state"]["select-cursor"]).toBe(null);
  expect(p["textarea-state"].cursor).toBe(2);

  // neither does a pair over the distance threshold (10 px apart)
  let d = harnessState("hello world", {}, TEXT_PATH);
  d = send(d, mouseDown([7, 2]), { now: t0 }).state;
  d = send(d, mouseDown([17, 2]), { now: t0 + 200 }).state;
  expect(d["textarea-state"]["select-cursor"]).toBe(null);
});

// p_copy — derives_from: components.textarea.clipboard_copy_rule
// generator: selected and unselected
// predicate: text range or nothing
it("p_copy: text range or nothing", () => {
  // with focus and a selection: the clipboard-copy effect with
  // text[min..max]
  const selected = harnessState("hello", { cursor: 4, "select-cursor": 1 }, TEXT_PATH);
  const res = send(selected, clipboard("copy"));
  expect(res.external).toEqual([["clipboard-copy", "ell"]]);
  expect(res.state.text).toBe("hello"); // copy edits nothing

  // without a selection: nothing
  const unselected = harnessState("hello", { cursor: 2 }, TEXT_PATH);
  expect(send(unselected, clipboard("copy")).external).toEqual([]);

  // without focus: nothing
  const unfocused = harnessState("hello", { cursor: 4, "select-cursor": 1 });
  expect(send(unfocused, clipboard("copy")).external).toEqual([]);
});

// p_cut — derives_from: components.textarea.clipboard_cut_rule
// generator: selection 1 to 3 in hello
// predicate: text becomes hlo and the clipboard gets el
it("p_cut: text becomes hlo and the clipboard gets el", () => {
  const state = harnessState("hello", { cursor: 3, "select-cursor": 1 }, TEXT_PATH);
  const res = send(state, clipboard("cut"));
  expect(res.state.text).toBe("hlo");
  expect(res.state["textarea-state"].cursor).toBe(1);
  expect(res.state["textarea-state"]["select-cursor"]).toBe(null);
  // clipboard-cut carries the removed text and the range; the text
  // edit is the new-text notification
  expect(res.external).toEqual([["clipboard-cut", "el", [1, 3]]]);
});

// p_paste — derives_from: components.textarea.clipboard_paste_rule
// generator: paste focused and unfocused
// predicate: insert-text or nothing
it("p_paste: insert-text or nothing", () => {
  // paste with focus returns insert-text with the pasted string
  const focused = harnessState("hello", { cursor: 2 }, TEXT_PATH);
  const res = send(focused, clipboard("pasted"));
  expect(res.intents).toEqual([["insert-text", "pasted", TEXT_PATH, EXTRA_PATH]]);
  expect(res.state.text).toBe("hepastedllo");
  expect(res.state["textarea-state"].cursor).toBe(8);

  // unfocused: nothing
  const unfocused = harnessState("hello", { cursor: 2 });
  expect(send(unfocused, clipboard("pasted")).intents).toEqual([]);
});
