// Purpose: executable contract tests for the editor-buffer spec — the RED
//   phase of task 5.1 (multi-line hit-test: round trip, line selection,
//   out-of-range clamps, monotonicity in x within a line).
// Responsibilities: encode the task-5 RED properties as vitest tests
//   against the headless buffer's multi-line hit-test surface
//   (`indexAt` / `positionFor`).
// Rationale: design D5 (the hit-test lives in the buffer, delegating to
//   the existing single-line `indexForPosition` per line) and the editor-
//   buffer spec's Multi-line hit-test requirement; task 5.2 lands the
//   delegation so the RED surface exists.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  clusterBoundaries,
  indexAt,
  initialEditorBuffer,
  positionFor,
  type EditorBufferState,
  type Metrics,
} from "../src/components/textarea/buffer.ts";

// The fixed-width stub for the headless buffer (design D3): every character
// is 8 x units wide, line pitch 16.
const metrics: Metrics = { measure: (t) => t.length * 8, lineHeight: 16 };

// task 5.1 Red — round trip: resolving the position of any boundary index
// and back yields the original index, over generated multi-line text.
it("p_hit_test: indexAt(positionFor(i)) == i for every boundary index, y selects the line and out-of-range points clamp", () => {
  const text = fc
    .array(fc.string({ minLength: 0, maxLength: 3 }), { minLength: 1, maxLength: 3 })
    .map((arr) => arr.join("\n"));
  fc.assert(
    fc.property(text, (t) => {
      const full = t.length > 0 ? t : "";
      const s: EditorBufferState = initialEditorBuffer(full, 0);
      for (const i of clusterBoundaries(full)) {
        const pos = positionFor(s, i, metrics);
        expect(indexAt(s, pos, metrics)).toBe(i);
      }
    }),
  );
});

// task 5.1 Red — a point in the second row selects the second line: the
// line is picked from y / lineHeight and the single-line resolver maps the
// x offset within that line.
it("task 5.1 Red: a point in the second row selects the second line", () => {
  const s = initialEditorBuffer("aaa\nbbb\nccc", 0);
  // row pitch is 16, so the second row spans y 16..32 and holds "bbb"
  // (line content starts at document index 4; x 8 is the first boundary)
  expect(indexAt(s, [8, 16], metrics)).toBe(5);
});

// task 5.1 Red — out-of-range points clamp to the first or last line.
it("task 5.1 Red: out-of-range points clamp to the first or last line", () => {
  const s = initialEditorBuffer("aaa\nbbb", 0);
  // above the first row -> the first line
  expect(indexAt(s, [0, -64], metrics)).toBe(0);
  // below the last row -> the last line
  expect(indexAt(s, [8, 999], metrics)).toBe(5);
});

// task 5.1 Red — the hit-test is monotone in x within a line.
it("task 5.1 Red: the hit-test is monotone in x within a line", () => {
  const s = initialEditorBuffer("hello world", 0);
  const y = 0;
  expect(indexAt(s, [0, y], metrics)).toBe(0);
  expect(indexAt(s, [24, y], metrics)).toBe(3);
  expect(indexAt(s, [88, y], metrics)).toBe(11);
  expect(indexAt(s, [88, y], metrics)).toBeGreaterThanOrEqual(
    indexAt(s, [24, y], metrics),
  );
});
