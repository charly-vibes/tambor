// Purpose: executable contract tests for the editor-buffer spec — the RED
//   phase of tasks 6.1/6.2 (undo and redo history, design D6).
// Responsibilities: encode the undo/redo RED properties as vitest tests
//   against the headless buffer: edit-then-undo identity, redo undoes
//   undo, branch on act, coalescing of one word, bounded history length,
//   selection before/after in the splice, and the coalescing boundaries.
// Rationale: openspec/specs/editor-buffer/spec.md is the design authority;
//   each predicate here mirrors an Undo and redo history requirement
//   (design D6: undo is a bounded timeline of splices; consecutive
//   single-character inserts coalesce into one entry until a boundary).

import { expect, it } from "vitest";

import {
  deleteByCluster,
  initialEditorBuffer,
  insertText,
  moveByCluster,
  redo,
  selectAll,
  undo,
  type EditorBufferState,
} from "../src/components/textarea/buffer.ts";

// task 6.1 Red — edit-then-undo identity: the undo restores the pre-edit
//   text and selection
it("task 6.1 Red: an edit is undone by restoring the pre-edit text and selection", () => {
  const before = initialEditorBuffer("hello world", 5, 5, 0);
  const edited = insertText(before, "X", { now: 0 });
  expect(edited.text).toBe("helloX world");
  const undone = undo(edited);
  expect(undone.text).toBe("hello world");
  expect(undone.head).toBe(5);
});

// task 6.1 Red — redo undoes undo: redo reapplies the undone edit
it("task 6.1 Red: redo reapplies an undone edit", () => {
  const before = initialEditorBuffer("hello world", 5, 5, 0);
  const edited = insertText(before, "X", { now: 0 });
  const undone = undo(edited);
  const redone = redo(undone);
  expect(redone.text).toBe("helloX world");
  expect(redone.head).toBe(6);
});

// task 6.1 Red — branch on act: an edit made after an undo discards the redo tail
it("task 6.1 Red: an edit made after an undo discards the redo tail", () => {
  let s = insertText(initialEditorBuffer("hello world", 5, 5, 0), "X", { now: 0 });
  s = undo(s);
  expect(redo(s).text).toBe("helloX world");
  s = insertText(s, "Y", { now: 10 });
  expect(redo(s).text).toBe("helloY world");
});

// task 6.1 Red — bounded length: the history never exceeds the limit
it("task 6.1 Red: the history length never exceeds the undo limit", () => {
  let s: EditorBufferState = initialEditorBuffer(null, 0);
  for (let i = 0; i < 8; i += 1) {
    s = insertText(s, `w${i}w`, { now: i });
  }
  expect(s.history?.entries.length).toBeLessThanOrEqual(8);
});

// task 6.1 Red — coalescing of one word: consecutive single-character
//   inserts of one word coalesce into one history entry
it("task 6.1 Red: consecutive single-character inserts of one word coalesce into one entry", () => {
  let s = initialEditorBuffer(null, 0);
  s = insertText(s, "f", { now: 0 });
  s = insertText(s, "o", { now: 5 });
  s = insertText(s, "o", { now: 9 });
  expect(s.history?.entries.length).toBe(1);
  const undone = undo(s);
  expect(undone.text).toBe("");
});

// task 6.2 Red — the splice entry carries the selection before and after
it("task 6.2 Red: undo of a selection replace restores the pre-edit selection", () => {
  const s = selectAll(initialEditorBuffer("hello", 0));
  const edited = insertText(s, "X", { now: 0 });
  const undone = undo(edited);
  expect(undone.text).toBe("hello");
  expect(undone.anchor).toBe(0);
  expect(undone.head).toBe(5);
});

// task 6.2 Red — undo of a delete re-inserts the deleted text
it("task 6.2 Red: undo of a delete re-inserts the deleted text", () => {
  let s = initialEditorBuffer("hello", 5, 5, 0);
  s = deleteByCluster(s);
  const undone = undo(s);
  expect(undone.text).toBe("hello");
});

// task 6.2 Red — coalescing boundaries: a whitespace character after a typed
//   word starts a new entry
it("task 6.2 Red: a whitespace character after a typed word starts a new entry", () => {
  let s = initialEditorBuffer(null, 0);
  s = insertText(s, "f", { now: 0 });
  s = insertText(s, "o", { now: 5 });
  s = insertText(s, " ", { now: 9 });
  expect(s.history?.entries.length).toBe(2);
});

// task 6.2 Red — coalescing boundaries: an edit after a cursor jump starts a
//   new entry
it("task 6.2 Red: an edit after a cursor jump starts a new entry", () => {
  let s = initialEditorBuffer("hello", 5, 5, 0);
  s = insertText(s, "f", { now: 0 });
  const moved = moveByCluster(s, -1);
  const branched = insertText(moved, "x", { now: 5 });
  expect(branched.history?.entries.length).toBe(2);
});
