// Purpose: executable contract tests for the components-textarea spec —
//   text editing (insert_splice, insert_replaces_selection,
//   delete_backward_rule, cursor_clamped, previous_line_quirk,
//   next_line_rule).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/components-textarea/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every check encodes its row's stated
//   behavior. The test state mirrors text_state_split: text and focus
//   live in the app state (top-level keys), while cursor, select-cursor
//   and their kin live under the textarea-state extra map. Shared
//   harness helpers live in tests/helpers/textarea.ts (tambor-272
//   redistributed the former monolithic tests/components-textarea.test.ts
//   into topic files).

import { expect, it } from "vitest";
import fc from "fast-check";

import { keyPress } from "../src/events/event.ts";
import { EXTRA_PATH, harnessState, send, TEXT_PATH } from "./helpers/textarea.ts";

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
      fc.option(fc.integer({ min: 0, max: 12 }), { freq: 2 }),
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
