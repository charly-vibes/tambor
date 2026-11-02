// Purpose: executable contract tests for the editor-buffer spec — the
//   RED phase of task 3.1 (line, word and document navigation).
// Responsibilities: encode the task-3 RED properties as vitest +
//   fast-check properties against the headless buffer: line-start/end
//   bounds, class-based word stops, document start/end, idempotence at
//   the edges.
// Rationale: openspec/specs/editor-buffer/spec.md is the design authority;
//   each predicate here mirrors a Requirements row (the line, word and
//   document navigation requirement). Task 3.2 lands the class-based word
//   rule (design D7).

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  initialEditorBuffer,
  moveByWord,
  moveToDocumentBoundary,
  moveToLineBoundary,
} from "../src/components/textarea/buffer.ts";

// task 3.1 Red — line_end stops before the newline
it("line_end stops before the newline", () => {
  // "ab⏎cd": the cursor at 1 is inside the first line; line_end lands on
  // the newline (2), not past it into the second line
  const end = moveToLineBoundary(initialEditorBuffer("ab\ncd", 1), "end");
  expect(end.head).toBe(2);
});

// task 3.1 Red — line_start moves to the start of the current line
it("line_start moves to the start of the current line", () => {
  // "ab\ncd": the cursor at 4 is on the second line, which starts after
  // the newline at 2
  const start = moveToLineBoundary(initialEditorBuffer("ab\ncd", 4), "start");
  expect(start.head).toBe(3);
});

// task 3.1 Red — line moves are idempotent at the text edges
it("line moves are idempotent at the edges", () => {
  const atStart = moveToLineBoundary(initialEditorBuffer("ab\ncd", 0), "start");
  expect(atStart.head).toBe(0);
  const atEnd = moveToLineBoundary(initialEditorBuffer("ab\ncd", 5), "end");
  expect(atEnd.head).toBe(5);
});

// task 3.1 Red — document start and end move to the text edges
it("document start and end move to the text edges", () => {
  expect(moveToDocumentBoundary(initialEditorBuffer("ab\ncd", 4), "start").head).toBe(0);
  expect(moveToDocumentBoundary(initialEditorBuffer("ab\ncd", 4), "end").head).toBe(5);
});

// task 3.1 Red — document moves are idempotent at the edges
it("document moves are idempotent at the edges", () => {
  expect(moveToDocumentBoundary(initialEditorBuffer("ab\ncd", 0), "start").head).toBe(0);
  expect(moveToDocumentBoundary(initialEditorBuffer("ab\ncd", 5), "end").head).toBe(5);
});

// task 3.1 Red — word forward moves to the end of the current word
it("word forward moves to the end of the current word", () => {
  // "foo bar": from the start of the text the first word-forward lands
  // on the end of "foo" (3)
  expect(moveByWord(initialEditorBuffer("foo bar", 0), 1).head).toBe(3);
});

// task 3.1 Red — word forward from a stop before a word moves to the
// next word end
it("word forward from a stop before a word moves to the next word end", () => {
  // from the whitespace stop at 3 (end of "foo") forward lands at the
  // end of "bar" (7)
  expect(moveByWord(initialEditorBuffer("foo bar", 3), 1).head).toBe(7);
});

// task 3.1 Red — word stops are class-based: punctuation runs are
// their own stops
it("word stops are class-based: punctuation runs are their own stops", () => {
  // "hello, world": forward from 0 stops at the end of "hello" (5) — the
  // comma at 5 is its own punctuation stop, not part of the word
  expect(moveByWord(initialEditorBuffer("hello, world", 0), 1).head).toBe(5);
});

// task 3.1 Red — word stops join letters, digits and underscore into
// one class
it("word stops join letters digits and underscore into one class", () => {
  // "foo_1": letters, underscore and digit form one word class, so the
  // whole run is one word ending at 5
  expect(moveByWord(initialEditorBuffer("foo_1 bar", 0), 1).head).toBe(5);
});

// task 3.1 Red — word backward moves to the start of the current word
it("word backward moves to the start of the current word", () => {
  // from the end of "bar" (7) backward lands at the start of "bar" (4)
  expect(moveByWord(initialEditorBuffer("foo bar", 7), -1).head).toBe(4);
});

// task 3.1 Red — word backward from the start of a word moves to the end
// of the previous word
it("word backward from the start of a word moves to the end of the previous word", () => {
  // from the start of "bar" (4) backward lands at the end of "foo" (3)
  expect(moveByWord(initialEditorBuffer("foo bar", 4), -1).head).toBe(3);
});

// task 3.1 Red — word moves at the document edges are no-ops
it("word moves at the document edges are no-ops", () => {
  expect(moveByWord(initialEditorBuffer("foo", 0), -1).head).toBe(0);
  expect(moveByWord(initialEditorBuffer("foo", 3), 1).head).toBe(3);
});

// task 3.1 Red — property: word moves stay in range and are idempotent
// at the edges
it("p_navigation_moves: line, word and document moves land on the specified boundaries and stay in range", () => {
  const text = fc
    .array(fc.constantFrom("a", "b", "1", "_", ",", "-", " ", "\n"), { maxLength: 8 })
    .map((arr) => arr.join(""));
  fc.assert(
    fc.property(text, fc.nat(), (t, start) => {
      const full = t.length > 0 ? t : "";
      const n = full.length;
      let s = initialEditorBuffer(t.length > 0 ? t : null, Math.min(start, n));
      for (let i = 0; i < 4; i += 1) {
        const moved = moveByWord(s, i % 2 === 0 ? 1 : -1);
        expect(moved.head).toBeGreaterThanOrEqual(0);
        expect(moved.head).toBeLessThanOrEqual(n);
        s = moved;
      }
      const atStart = moveByWord(initialEditorBuffer(t.length > 0 ? t : null, 0), -1);
      expect(atStart.head).toBe(0);
      const atEnd = moveByWord(initialEditorBuffer(t.length > 0 ? t : null, n), 1);
      expect(atEnd.head).toBeLessThanOrEqual(n);
    }),
  );
});
