// Purpose: executable contract tests for the editor-buffer spec — the
//   RED phase of task 2.1 (selection model: extend keeps anchor,
//   collapse-to-edge, select-all then delete empties).
// Responsibilities: encode the editor-buffer selection RED properties as
//   vitest + fast-check properties against the headless buffer.
// Rationale: openspec/specs/editor-buffer/spec.md is the design authority;
//   each predicate here mirrors a Requirements row (extend keeps the
//   anchor; collapse to the selection edge; select-all then delete).

import { expect, it } from "vitest";

import {
  deleteByCluster,
  initialEditorBuffer,
  moveByCluster,
  selectAll,
} from "../src/components/textarea/buffer.ts";

// task 2.1 Red — extend keeps the anchor
it("shift-extend keeps the anchor while moving the head", () => {
  const s = initialEditorBuffer("hello world", 3);
  const m1 = moveByCluster(s, 1, true);
  const m2 = moveByCluster(m1, 1, true);
  expect(m2.anchor).toBe(3);
  expect(m2.head).toBe(5);
});

// task 2.1 Red — collapse to the selection edge in the move direction
it("a move without extend collapses to the selection edge in the move direction", () => {
  // the selection spans 2..6; a backward move without extend collapses to
  // the backward edge (head at 2) without stepping further
  const back = moveByCluster(initialEditorBuffer("abcdef", 6, 2), -1, false);
  expect(back.anchor).toBe(2);
  expect(back.head).toBe(2);

  // a forward move without extend collapses to the forward edge (head at 6)
  const fwd = moveByCluster(initialEditorBuffer("abcdef", 6, 2), 1, false);
  expect(fwd.anchor).toBe(6);
  expect(fwd.head).toBe(6);
});

// task 2.1 Red — select-all then delete empties the text
it("select-all then delete empties the text", () => {
  const s = selectAll(initialEditorBuffer("hello", 0));
  expect(s.anchor).toBe(0);
  expect(s.head).toBe(5);
  const del = deleteByCluster(s);
  expect(del.text).toBe("");
  expect(del.head).toBe(0);
});
