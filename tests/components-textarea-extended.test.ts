// Purpose: executable contract tests for the components-textarea spec —
//   task 7 (editor-buffer textarea integration): the opt-in `profile`
//   (design D1), the extended key routing (design D8), pointer placement
//   via the buffer, the `goal-x` / `history` extra-map state placement and
//   the shared op-sequence invariants under `"extended"`.
// Responsibilities: encode the task-7 RED surface as vitest + fast-check
//   properties against the textarea component (the basic_components.cljc
//   port): the default profile stays the membrane baseline, an extended
//   textarea preserves the goal column across vertical moves, shift
//   extends the selection, home/end and ctrl/meta commands route through
//   the editor-buffer operations, unknown modified keys stay ignored, the
//   extra map carries `goal-x` and `history`, pointer placement resolves
//   through the multi-line hit-test, and under `"extended"` the
//   invariants of the editor-buffer hold after any generated mix of key
//   and pointer events.
// Rationale: openspec/changes/add-textarea-editing-model/specs/
//   components-textarea/spec.md and specs/editor-buffer/spec.md are the
//   design authorities; each predicate here mirrors a task-7 scenario or a
//   task-7.3 shared op-sequence property. Task 7.1 is the regression gate
//   (the default profile keeps the membrane behavior); task 7.2 is the
//   Red→Green integration slice; task 7.3 is the shared op-sequence
//   property.

import { expect, it } from "vitest";
import fc from "fast-check";

import { keyPress, mouseDown } from "../src/events/event.ts";
import { clusterBoundaries } from "../src/components/textarea/buffer.ts";
import { harnessState, send, TEXT_PATH } from "./helpers/textarea.ts";
import type { HarnessState } from "./helpers/textarea.ts";
import type { TextareaExtra } from "../src/components/textarea/edit.ts";

// The extended profile's injected geometry stub (design D3): every
// character is 8 x units wide with a line pitch of 16.
const METRICS = { measure: (t: string) => t.length * 8, lineHeight: 16 };

// Task 7.1 Red — regression gate: with no `profile` prop the textarea
// keeps the membrane baseline (the previous-line quirk).
it("task 7.1 Red: the default profile keeps the membrane previous-line behavior", () => {
  const state = harnessState("ab\ncd", { cursor: 4, "select-cursor": 1 }, TEXT_PATH);
  const res = send(state, keyPress("up"));
  expect(res.state["textarea-state"].cursor).toBe(2);
  expect(res.state["textarea-state"]["select-cursor"]).toBe(null);
});

// Task 7.2 Red→Green — extended down moves by goal column, not to the
// next line's start: from column 3 (x 24) of "abcdef\nghijkl" the down
// key lands at column 3 of the second line (index 10).
it("task 7.2 Red→Green: an extended down preserves the goal column", () => {
  const state = harnessState("abcdef\nghijkl", { cursor: 3, "goal-x": 24 }, TEXT_PATH);
  const res = send(state, keyPress("down"), { profile: "extended", metrics: METRICS });
  expect(res.state["textarea-state"].cursor).toBe(10);
});

// Task 7.2 Red→Green — extended shift extends the selection of any move.
it("task 7.2 Red→Green: an extended shift extends the selection", () => {
  const state = harnessState("hello world", { cursor: 3 }, TEXT_PATH);
  const once = send(state, keyPress("right", { mods: ["shift"] }), { profile: "extended", metrics: METRICS });
  expect(once.state["textarea-state"].cursor).toBe(4);
  expect(once.state["textarea-state"]["select-cursor"]).toBe(3);

  const twice = send(once.state, keyPress("right", { mods: ["shift"] }), { profile: "extended", metrics: METRICS });
  expect(twice.state["textarea-state"].cursor).toBe(5);
  expect(twice.state["textarea-state"]["select-cursor"]).toBe(3);
});

// Task 7.2 Red→Green — extended home and end move to line boundaries.
it("task 7.2 Red→Green: an extended end moves to the end of the current line", () => {
  const state = harnessState("ab\ncd", { cursor: 3 }, TEXT_PATH);
  const res = send(state, keyPress("end"), { profile: "extended", metrics: METRICS });
  expect(res.state["textarea-state"].cursor).toBe(5);
});

// Task 7.2 Red→Green — extended ctrl/meta shortcuts route through the
// editor-buffer operations: ctrl+z undoes the typed text.
it("task 7.2 Red→Green: an extended ctrl+z undoes the typed text", () => {
  let state = harnessState("hello", { cursor: 2 }, TEXT_PATH);
  state = send(state, keyPress("X"), { profile: "extended", metrics: METRICS }).state;
  expect(state.text).toBe("heXllo");

  const undone = send(state, keyPress("z", { mods: ["ctrl"] }), { profile: "extended", metrics: METRICS });
  expect(undone.state.text).toBe("hello");
});

// Task 7.2 Red→Green — extended ctrl+a selects all.
it("task 7.2 Red→Green: an extended meta+a selects all", () => {
  const state = harnessState("hello", { cursor: 2 }, TEXT_PATH);
  const res = send(state, keyPress("a", { mods: ["meta"] }), { profile: "extended", metrics: METRICS });
  expect(res.state["textarea-state"]["select-cursor"]).toBe(0);
  expect(res.state["textarea-state"].cursor).toBe(5);
});

// Task 7.2 Red→Green — extended ctrl+right moves by word.
it("task 7.2 Red→Green: an extended ctrl+right moves by word", () => {
  const state = harnessState("hello world", { cursor: 0 }, TEXT_PATH);
  const res = send(state, keyPress("right", { mods: ["ctrl"] }), { profile: "extended", metrics: METRICS });
  expect(res.state["textarea-state"].cursor).toBe(5);
});

// Task 7.2 Red→Green — an unknown modified key is ignored and inserts no
// text, and an unfocused textarea ignores shortcuts.
it("task 7.2 Red→Green: an extended unknown modified key and an unfocused shortcut are ignored", () => {
  const focused = harnessState("hello", { cursor: 2 }, TEXT_PATH);
  const unknown = send(focused, keyPress("q", { mods: ["ctrl"] }), { profile: "extended", metrics: METRICS });
  expect(unknown.intents).toEqual([]);
  expect(unknown.state.text).toBe("hello");

  const unfocused = harnessState("hello", { cursor: 2 });
  const shortcut = send(unfocused, keyPress("a", { mods: ["ctrl"] }), { profile: "extended", metrics: METRICS });
  expect(shortcut.intents).toEqual([]);
});

// Task 7.2 Red→Green — the extended textarea-state extra map carries
// `goal-x` (null before any move) and a bounded empty `history`.
it("task 7.2 Red→Green: the extended extra map carries goal-x and history", () => {
  const initial = (harnessState("hello", {}) as { readonly "textarea-state": TextareaExtra })["textarea-state"];
  expect(initial["goal-x"]).toBe(null);
  expect(initial.history.entries.length).toBe(0);

  const moved = send(harnessState("hello world", { cursor: 0 }, TEXT_PATH), keyPress("right"), { profile: "extended", metrics: METRICS });
  expect(moved.state["textarea-state"]["goal-x"]).toBe(8);
});

// Task 7.2 Red→Green — an extended pointer down resolves its index with
// the buffer's multi-line hit-test (design D5): a click that lands in the
// second row of two-line text resolves within that line (the membrane
// backend service is single-line and ignores y).
it("task 7.2 Red→Green: an extended pointer down resolves through the multi-line hit-test", () => {
  const state = harnessState("ab\ncd", { cursor: 0 }, TEXT_PATH);
  // frame position [5, 4] is the node-local position minus the bordered
  // frame padding (padX 5, padY 2): text position [0, 2] is the second row
  // (line pitch 2 under the injected stub metrics)
  const res = send(state, mouseDown([5, 4]), { profile: "extended", metrics: { ...METRICS, lineHeight: 2 } });
  expect(res.state["textarea-state"].cursor).toBe(3);
});

// Task 7.3 Red→Green — the shared op-sequence property: under `"extended"`
// the editor-buffer invariants hold after any generated mix of key and
// pointer events.
it("task 7.3 Red→Green: under extended the editor-buffer invariants hold after any generated mix of key and pointer events", () => {
  const texts = fc
    .array(fc.constantFrom("a", "b", " ", "\n", "é"), { maxLength: 3 })
    .map((arr) => arr.join(""));
  type MoveKey = "left" | "right" | "up" | "down";
  const moveArb = fc.constantFrom<MoveKey>("left", "right", "up", "down");
  const ops = fc
    .array(
      fc.record({
        kind: fc.constantFrom("key", "pointer"),
        key: fc.option(moveArb, { freq: 1 }),
        shift: fc.option(fc.constant(true), { freq: 1 }),
        ctrl: fc.option(fc.constant(true), { freq: 1 }),
        pos: fc.option(fc.tuple(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 64 })), { freq: 1 }),
        now: fc.option(fc.integer({ min: 0, max: 5000 }), { freq: 1 }),
      }),
      { maxLength: 5 },
    );

  fc.assert(
    fc.property(texts, fc.integer({ min: 0, max: 6 }), ops, (text, cursor, opList) => {
      let state: HarnessState = harnessState(text.length > 0 ? text : null, { cursor: Math.min(cursor, text.length), "goal-x": 0 }, TEXT_PATH);
      for (const op of opList) {
        const event = op.kind === "key"
          ? keyPress(op.key ?? "left", {
            ...(op.shift ? { mods: ["shift"] } : {}),
            ...(op.ctrl ? { mods: ["ctrl"] } : {}),
            ...(op.now !== null ? { now: op.now } : {}),
          })
          : mouseDown(op.pos ?? [0, 0]);
        const res = send(state, event, { profile: "extended", metrics: METRICS });
        const t = res.state.text;
        const ex = res.state["textarea-state"] as TextareaExtra;
        const len = t?.length ?? 0;
        // cursor_clamped: the cursor stays within 0..len(text)
        expect(ex.cursor).toBeGreaterThanOrEqual(0);
        expect(ex.cursor).toBeLessThanOrEqual(len);
        // the selection, when present, is within range and well formed
        const sc = ex["select-cursor"];
        if (sc !== null) {
          expect(sc).toBeGreaterThanOrEqual(0);
          expect(sc).toBeLessThanOrEqual(len);
          if (sc !== ex.cursor) {
            expect(Math.min(sc, ex.cursor)).toBeLessThanOrEqual(Math.max(sc, ex.cursor));
          }
        }
        // grapheme_boundaries: horizontal moves step over whole clusters
        if (op.key === "left" || op.key === "right") {
          const bounds = clusterBoundaries(t ?? "");
          expect(bounds).toContain(ex.cursor);
        }
        state = res.state;
      }
    }),
  );
});
