// Purpose: executable contract tests for the components-textarea spec —
//   clipboard interaction and the state split (clipboard_copy_rule,
//   clipboard_cut_rule, clipboard_paste_rule, text_state_split).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-textarea.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every check encodes its row's stated
//   behavior. Clipboard event encoding: data "copy"/"cut" trigger the
//   copy/cut ops; any other data string is a paste carrying its string
//   (backend_render clipboard_service says paste events carry the
//   string; copy/cut event encoding is an interim convention flagged to
//   the corpus owner). The test state mirrors text_state_split: text
//   and focus live in the app state (top-level keys), while cursor,
//   select-cursor and their kin live under the textarea-state extra
//   map. Shared harness helpers live in tests/helpers/textarea.ts
//   (tambor-272 redistributed the former monolithic
//   tests/components-textarea.test.ts into topic files).

import { expect, it } from "vitest";

import type { Path } from "../src/effects/paths.ts";
import { clipboard, keyPress, mouseDown } from "../src/events/event.ts";
import {
  EXTRA_PATH,
  harnessState,
  send,
  TEXT_PATH,
} from "./helpers/textarea.ts";

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

// p_state_split — derives_from: components.textarea.text_state_split
// generator: editing and moving
// predicate: text paths point into app state and cursor paths into extra
it("p_state_split: text paths point into app state and cursor paths into extra", () => {
  // editing: the insert effect carries the text path (app state) and
  // the extra path; the applied edit lands in each respectively
  const s = harnessState("hello", { cursor: 2 }, TEXT_PATH);
  const res = send(s, keyPress("XY"));
  expect(res.intents[0]).toEqual(["insert-text", "XY", TEXT_PATH, EXTRA_PATH]);
  expect(res.state.text).toBe("heXYllo"); // app state
  expect(res.state["textarea-state"].cursor).toBe(4); // extra map

  // moving: every pointer-down update targets the extra map (only the
  // leading request-focus is not an update, and none of the updates
  // touch the text)
  const m = harnessState("hello", {}, TEXT_PATH);
  const resM = send(m, mouseDown([7, 2]));
  const updates = resM.intents.filter((i) => i[0] === "update");
  expect(updates.length).toBeGreaterThan(0);
  for (const intent of updates) {
    const path = intent[1] as Path;
    expect(path[0]).toEqual(["keypath", "textarea-state"]);
    expect(path.length).toBe(2);
  }
  expect(resM.state.text).toBe("hello");

  // the cut's text edit is the new-text notification against the
  // app-state text path
  const c = harnessState("hello", { cursor: 3, "select-cursor": 1 }, TEXT_PATH);
  const resC = send(c, clipboard("cut"));
  expect(resC.intents[0]).toEqual(["update", TEXT_PATH, expect.any(Function)]);
});
