// Purpose: executable contract tests for the components-textarea spec —
//   pointer interaction (pointer_down_cursor, drag_tracks,
//   finish_drag_rule, double_click_word).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-textarea.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every check encodes its row's stated
//   behavior. The test state mirrors text_state_split: text and focus
//   live in the app state (top-level keys), while cursor, select-cursor,
//   down-pos, mpos and last-click live under the textarea-state extra
//   map. Shared harness helpers live in tests/helpers/textarea.ts
//   (tambor-272 redistributed the former monolithic
//   tests/components-textarea.test.ts into topic files).

import { expect, it } from "vitest";

import { mouseDown, mouseMove, mouseUp } from "../src/events/event.ts";
import { harnessState, send, TEXT_PATH } from "./helpers/textarea.ts";

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
