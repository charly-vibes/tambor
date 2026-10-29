// Purpose: the multi-line hit-test seam for the editor buffer — task 5
//   (design D5): resolve text-space (x, y) points to buffer indices and
//   back, delegating per line to the single-line `indexForPosition`.
// Responsibilities: line content bounds, the injected line measure, and
//   the `indexAt` / `positionFor` hit-test operations.
// Rationale: the hit-test is a cohesive pure geometry seam over the buffer
//   state; hosting it in its own module keeps the buffer model file under
//   the 400-line pretender gate while the buffer stays the public facade.

import { indexForPosition } from "../../render/backend.ts";
import type { EditorBufferState, Metrics } from "./buffer.ts";
import type { Vec2 } from "../../views/model.ts";

// The content range [start, end) of line `lineIndex` (design D5): the
// line content runs from the first character after the (lineIndex)th newline
// to the next newline (or the end of text on the last line).
function lineBounds(
  text: string,
  lineIndex: number,
): { start: number; end: number } {
  const lines = text.split("\n");
  let start = 0;
  for (let i = 0; i < lineIndex; i += 1) {
    start += (lines[i] ?? "").length + 1;
  }
  const end = start + (lines[lineIndex] ?? "").length;
  return { start, end };
}

// The single-line measure service over the injected metrics (design D3):
// the buffer's headless measure plus its line pitch, shaped as the backend
// Vec2 measure the shared single-line `indexForPosition` consumes (design
// D5: the hit-test delegates here, per line, instead of adding backend
// contract surface).
function lineMeasure(metrics: Metrics): (text: string) => Vec2 {
  return (text: string): Vec2 => [metrics.measure(text), metrics.lineHeight];
}

// The content range [start, end) of the line containing `head`: the line
// content runs from the first character after the previous newline to the
// next newline (or the end of text on the last line).
export function lineRange(text: string, head: number): { start: number; end: number } {
  let start = 0;
  for (let i = head - 1; i >= 0; i -= 1) {
    if (text[i] === "\n") {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = head; i < text.length; i += 1) {
    if (text[i] === "\n") {
      end = i;
      break;
    }
  }
  return { start, end };
}

// Multi-line hit-test (task 5, design D5): resolve a text-space point
// (x, y) to a buffer index. The line is chosen as
// clamp(floor(y / lineHeight), 0, lines - 1) and the single-line
// `indexForPosition` service is then called with that line's text and the
// x offset; the line start is added back, so the result is a document
// index. Pure: the input state is not mutated and a fresh number is
// returned; out-of-range points clamp to the first or last line.
export function indexAt(s: EditorBufferState, pos: Vec2, metrics: Metrics): number {
  const text = s.text ?? "";
  const lines = text.split("\n").length;
  const lastLine = Math.max(lines - 1, 0);
  const lineIndex = Math.min(Math.max(Math.floor(pos[1] / metrics.lineHeight), 0), lastLine);
  const { start, end } = lineBounds(text, lineIndex);
  const idx = indexForPosition(lineMeasure(metrics), null, text.slice(start, end), pos[0]);
  return start + idx;
}

// The inverse of the multi-line hit-test (task 5, design D5): positionFor
// is the same math reversed — the point whose line is the index's line and
// whose x is the width of the content before the index under the injected
// measure; resolving that point back yields the original index (the round
// trip). Out-of-range indices clamp to the text bounds.
export function positionFor(s: EditorBufferState, index: number, metrics: Metrics): Vec2 {
  const text = s.text ?? "";
  const idx = Math.min(Math.max(index, 0), text.length);
  const range = lineRange(text, idx);
  let lineIndex = 0;
  for (let i = 0; i < range.start; i += 1) {
    if (text[i] === "\n") lineIndex += 1;
  }
  const lineText = text.slice(range.start, range.end);
  const x = metrics.measure(lineText.slice(0, idx - range.start));
  const y = lineIndex * metrics.lineHeight;
  const pos: Vec2 = [x, y];
  return pos;
}
