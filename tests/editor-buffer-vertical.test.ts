// Purpose: executable contract tests for the editor-buffer spec — the RED
//   phase of task 4.1 (goal-column vertical movement).
// Responsibilities: encode the task-4 RED properties as vitest tests
//   against the headless buffer: up-then-down returns to the original
//   index, the goal x survives a short line, first/last line edges, and
//   horizontal moves reset goalX.
// Rationale: openspec/specs/editor-buffer/spec.md is the design authority;
//   each predicate here mirrors the Goal-column vertical movement
//   requirement. Task 4.2 lands the Metrics interface, the fixed-width
//   stub and the vertical move (design D3/D4).

import { expect, it } from "vitest";

import {
  initialEditorBuffer,
  moveByCluster,
  moveByLine,
  type EditorBufferState,
  type Metrics,
} from "../src/components/textarea/buffer.ts";

// The fixed-width stub for the headless buffer (design D3): every character
// is 8 x units wide, line pitch 16.
const metrics: Metrics = { measure: (t) => t.length * 8, lineHeight: 16 };

// task 4.1 Red — up then down returns to the original index
it("p_goal_column: up then down returns to the original index and the goal x survives a short line", () => {
  // "abcdef\nghijkl": the cursor is on the second line at the boundary after
  // "g" (index 8, goal column x 8); up lands on the first line at x 8, down
  // lands back on the boundary after "g" (index 8)
  const s0 = initialEditorBuffer("abcdef\nghijkl", 8, 8, 8);
  const up = moveByLine(s0, -1, metrics);
  expect(up.head).toBe(1);
  const down = moveByLine(up, 1, metrics);
  expect(down.head).toBe(8);
});

// task 4.1 Red — the goal x survives a short line
it("task 4.1 Red: the goal x survives a short line", () => {
  // the cursor is at x 40 on a long line, moves down through a one-character
  // line and down again onto a long line: the final cursor lands on the
  // boundary nearest x 40, not at the short line's end
  const text = "aaaaaaaaaaaa\nx\naaaaaaaaaaa";
  const s0 = initialEditorBuffer(text, 5, 5, 40);
  const down1 = moveByLine(s0, 1, metrics);
  expect(down1.head).toBe(14);
  const down2 = moveByLine(down1, 1, metrics);
  expect(down2.head).toBe(20);
});

// task 4.1 Red — up on the first line moves to document start
it("task 4.1 Red: up on the first line moves to document start", () => {
  const s = initialEditorBuffer("abc\ndef", 2, 2, 0);
  expect(moveByLine(s, -1, metrics).head).toBe(0);
});

// task 4.1 Red — down on the last line moves to document end
it("task 4.1 Red: down on the last line moves to document end", () => {
  const s = initialEditorBuffer("abc\ndef", 6, 6, 0);
  expect(moveByLine(s, 1, metrics).head).toBe(7);
});

// task 4.1 Red — horizontal moves reset goalX to the new position
it("task 4.1 Red: horizontal moves reset goalX to the new position", () => {
  const s: EditorBufferState = initialEditorBuffer("hello world", 0, 0, 999);
  const moved = moveByCluster(s, 1, false, metrics);
  expect(moved.head).toBe(1);
  expect(moved.goalX).toBe(metrics.measure("h"));
});
