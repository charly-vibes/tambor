// Purpose: the editor buffer — the headless pure editing model over
//   { text, anchor, head, goalX } plus the task-6 undo timeline that the
//   textarea's `extended` profile routes through (openspec/specs/editor-buffer/spec.md).
// Responsibilities: the buffer state type, the grapheme cluster
//   boundary helper (Intl.Segmenter, granularity "grapheme") and the
//   task-1 operation slice: move-by-cluster and delete-by-cluster.
// Rationale: the buffer is a pure model over text + selection + goalX
//   (pure buffer state) and every operation steps over whole grapheme
//   clusters so no index ever rests inside a cluster (grapheme boundary
//   snapping). Task 1.2 of tambor-72m lands this Red->Green slice; the
//   selection model, line/word navigation, goal-column moves, hit-test
//   and undo land in later tasks.

import { lineRange } from "./hit-test.ts";
import { initialUndoHistory, pushDelete, type UndoHistory } from "./undo.ts";

// The multi-line hit-test seam (task 5, design D5) lives in its own module;
// the buffer re-exports it so the buffer-level API surface stays stable for
// callers and tests.
export { indexAt, positionFor } from "./hit-test.ts";

// The undo timeline (task 6, design D6) lives in its own module; the buffer re-exports it (hit-test seam pattern).
export { insertText, redo, undo } from "./undo.ts";
export type { UndoEntry, UndoHistory } from "./undo.ts";

// The editor buffer state: the text being edited, the selection (the
// range between anchor and head, empty exactly when they are equal), the
// goal x offset (task 4) and the task-6 undo timeline (design D6: bounded
// splice history).
export interface EditorBufferState {
  readonly text: string | null;
  readonly anchor: number;
  readonly head: number;
  readonly goalX: number;
  readonly history?: UndoHistory;
}

// The initial buffer state for a text (nil text -> nil buffer) with the
// cursor at `head` and an empty selection (anchor == head) unless an
// explicit anchor is given.
export function initialEditorBuffer(
  text: string | null,
  head = 0,
  anchor: number | null = null,
  goalX = 0,
): EditorBufferState {
  return { text, anchor: anchor ?? head, head, goalX, history: initialUndoHistory() };
}

// Design D3 (task 4): geometry is injected, not ambient — operations that
// reason about widths take a Metrics { measure; lineHeight }; the fixed-width
// stub is the headless default and the DOM and canvas backends supply their
// own measure (and the hit-test layer its line pitch).
export interface Metrics {
  readonly measure: (text: string) => number;
  readonly lineHeight: number;
}

// The headless fixed-width stub (design D3): every character is 8 x units
// wide with a line pitch of 16; tests inject their own stub.
export const fixedMetrics: Metrics = {
  measure: (text: string) => text.length * 8,
  lineHeight: 16,
};

// The goal x offset (design D4) of the cursor `head` within its line, under
// the injected measure: the width of the line content before the head.
function goalXOf(text: string, head: number, metrics: Metrics): number {
  return metrics.measure(text.slice(lineRange(text, head).start, head));
}

// The boundary in a line (design D4): the offset into the line whose x under
// the injected measure is nearest the goal x, or the line end when the line
// is shorter than the goal (the line end is the last boundary).
function lineLandingBoundary(
  lineText: string,
  goalX: number,
  metrics: Metrics,
): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let rel = 0; rel <= lineText.length; rel += 1) {
    const x = metrics.measure(lineText.slice(0, rel));
    const dist = Math.abs(x - goalX);
    if (dist < bestDist) {
      bestDist = dist;
      best = rel;
    }
  }
  return best;
}

// Grapheme cluster boundaries of a text as sorted string indices: the
// set of cluster-start offsets including 0 and the text length. Uses
// Intl.Segmenter with granularity "grapheme"; indices are string indices
// (UTF-16 code units), matching the textarea's existing index space.
export function clusterBoundaries(text: string): number[] {
  const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
  const starts: number[] = [];
  for (const s of Array.from(seg.segment(text))) {
    starts.push(s.index);
  }
  const bounds = new Set<number>([0]);
  for (const st of starts) {
    bounds.add(st);
  }
  bounds.add(text.length);
  return Array.from(bounds).sort((a, b) => a - b);
}

// Move the cursor (head) by one grapheme cluster in `dir` (1 = forward,
// -1 = backward), snapping to the adjacent cluster boundary. With
// `extend` the move keeps the selection anchor (shift extends); without
// it, a move over a non-empty selection collapses to the selection edge
// in the move direction without stepping further, clearing the selection
// (task 2 collapse rule). Pure: the input state is not mutated and a
// fresh state is returned. Moving past the first/last boundary is a
// no-op (task 1 keeps indices in range).
export function moveByCluster(
  s: EditorBufferState,
  dir: -1 | 1,
  extend = false,
  metrics: Metrics = fixedMetrics,
): EditorBufferState {
  const text = s.text ?? "";
  const head = Math.min(Math.max(s.head, 0), text.length);
  const bounds = clusterBoundaries(text);
  const idx = bounds.indexOf(head);
  const next =
    dir === 1 ? (bounds[idx + 1] ?? head) : (bounds[idx - 1] ?? head);
  let headN = next;
  let anchorN = s.anchor;
  if (!extend && anchorN !== head) {
    // collapse to the selection edge in the move direction, without
    // stepping further; the selection is cleared (it is now empty)
    headN = dir === 1 ? head : anchorN;
    anchorN = headN;
  }
  const goalX = goalXOf(text, headN, metrics);
  return { ...s, head: headN, anchor: anchorN, goalX };
}

// The line boundary kinds: the start of the current line or the end
// (just before the next newline, or the end of text on the last line).
export type LineBoundary = "start" | "end";

// The document boundary kinds: the start or the end of the text.
export type DocumentBoundary = "start" | "end";

// The character class of the code unit at index `i`: "word" for
// letters, digits and underscore (design D7), "space" for whitespace
// and "other" for every other character. The word rule is class-based
// and headless: a word is a run of word-class characters, while
// whitespace and each punctuation run are their own stops.
function charClass(text: string, i: number): "word" | "space" | "other" {
  const ch = text[i];
  if (ch === undefined) return "other";
  if (/[\p{L}\p{N}_]/u.test(ch)) return "word";
  if (/\s/u.test(ch)) return "space";
  return "other";
}

// The exclusive end of the word run that starts at or before `from`
// (a word is a maximal run of word-class characters).
function wordRunEnd(text: string, from: number): number {
  let end = from + 1;
  while (end < text.length && charClass(text, end) === "word") {
    end += 1;
  }
  return end;
}

// The inclusive start of the word run that ends at `from`.
function wordRunStart(text: string, from: number): number {
  let start = from;
  while (start > 0 && charClass(text, start - 1) === "word") {
    start -= 1;
  }
  return start;
}

// The exclusive end of the next word run at or after `i`; when there is
// none it returns `i` (the move is a no-op).
function nextWordEnd(text: string, i: number): number {
  let j = i;
  while (j < text.length && charClass(text, j) !== "word") {
    j += 1;
  }
  return j < text.length ? wordRunEnd(text, j) : i;
}

// The exclusive end of the previous word run before `i`; when there is
// none it returns `i` (the move is a no-op).
function prevWordEnd(text: string, i: number): number {
  let j = i - 1;
  while (j >= 0 && charClass(text, j) !== "word") {
    j -= 1;
  }
  return j >= 0 ? j + 1 : i;
}

// The shared step for the task-3 navigation moves: `next` is the snapped
// target boundary; extend keeps the anchor (a shift move), a move
// without extend over a selection collapses to the selection edge in the
// move direction without stepping further (task 2 collapse rule), and a
// move without a selection moves the cursor (anchor follows head).
function stepHead(
  s: EditorBufferState,
  next: number,
  dir: -1 | 1,
  extend: boolean,
): EditorBufferState {
  const text = s.text ?? "";
  const len = text.length;
  const head = Math.min(Math.max(s.head, 0), len);
  const headN = Math.min(Math.max(next, 0), len);
  if (extend) {
    const anchor = s.anchor === s.head ? next : s.anchor;
    return { ...s, head: headN, anchor };
  }
  if (s.anchor !== head) {
    const edge = dir === 1 ? head : s.anchor;
    return { ...s, head: edge, anchor: edge };
  }
  return { ...s, head: headN, anchor: headN };
}

// Move the cursor to a line boundary (task 3.1): the line is delimited by
// newline characters, "end" stops before the next newline (or at the end
// of text on the last line) and "start" is the first index of the current
// line. Any horizontal move resets the goal x to the new position under
// the injected measure (design D4). Idempotent at the edges. Pure: the
// input state is not mutated and a fresh state is returned.
export function moveToLineBoundary(
  s: EditorBufferState,
  boundary: LineBoundary,
  extend = false,
  metrics: Metrics = fixedMetrics,
): EditorBufferState {
  const text = s.text ?? "";
  const range = lineRange(text, Math.min(Math.max(s.head, 0), text.length));
  const target = boundary === "start" ? range.start : range.end;
  const dir: -1 | 1 = boundary === "start" ? -1 : 1;
  const moved = stepHead(s, target, dir, extend);
  return { ...moved, goalX: goalXOf(text, moved.head, metrics) };
}

// Move the cursor to a document boundary (task 3.1): "start" lands at 0
// and "end" at the end of the text. Any horizontal move resets the goal x
// to the new position under the injected measure (design D4). Idempotent
// at the edges. Pure.
export function moveToDocumentBoundary(
  s: EditorBufferState,
  boundary: DocumentBoundary,
  extend = false,
  metrics: Metrics = fixedMetrics,
): EditorBufferState {
  const text = s.text ?? "";
  const target = boundary === "start" ? 0 : text.length;
  const dir: -1 | 1 = boundary === "start" ? -1 : 1;
  const moved = stepHead(s, target, dir, extend);
  return { ...moved, goalX: goalXOf(text, moved.head, metrics) };
}

// Move the cursor by one word in `dir` (1 = forward, -1 = backward) using
// the class-based word rule (design D7): a word is a run of letters,
// digits and underscore; whitespace and each punctuation run is its own
// stop, so word moves are deterministic and headless. Moving past the
// first/last word is a no-op (task 3 keeps indices in range). Any
// horizontal move resets the goal x to the new position under the
// injected measure (design D4). Pure.
export function moveByWord(
  s: EditorBufferState,
  dir: -1 | 1,
  extend = false,
  metrics: Metrics = fixedMetrics,
): EditorBufferState {
  const text = s.text ?? "";
  const len = text.length;
  const head = Math.min(Math.max(s.head, 0), len);
  let next: number;
  if (dir === 1) {
    if (head >= len) {
      next = head;
    } else if (charClass(text, head) === "word") {
      next = wordRunEnd(text, head);
    } else {
      next = nextWordEnd(text, head);
    }
  } else {
    if (head <= 0) {
      next = head;
    } else if (charClass(text, head - 1) === "word") {
      next = wordRunStart(text, head - 1);
    } else {
      next = prevWordEnd(text, head);
    }
  }
  const moved = stepHead(s, next, dir, extend);
  return { ...moved, goalX: goalXOf(text, moved.head, metrics) };
}

// The boundary a vertical move lands on: the target line's boundary nearest
// the goal x, or the line end when the line is shorter (design D4).
function verticalLanding(
  text: string,
  range: { start: number; end: number },
  dir: -1 | 1,
  goalX: number,
  metrics: Metrics,
): number {
  const movingDown = dir === 1;
  let base: number;
  let lineEnd: number;
  if (movingDown) {
    base = range.end + 1;
    const nextNL = text.indexOf("\n", base);
    lineEnd = nextNL === -1 ? text.length : nextNL;
  } else {
    const prevNL = range.start - 1;
    base = prevNL < 0 ? 0 : text.lastIndexOf("\n", prevNL - 1) + 1;
    lineEnd = prevNL;
  }
  const line = text.slice(base, lineEnd);
  return base + lineLandingBoundary(line, goalX, metrics);
}

// Move the cursor by one line in `dir` (1 = down, -1 = up) preserving the
// goal x offset (design D4): the cursor lands on the boundary in the target
// line nearest to the goal x under the injected measure, or on the line end
// when the line is shorter, and consecutive up/down moves reuse the goal x.
// Up on the first line and down on the last line move to document start and
// end respectively. Pure: the input state is not mutated and a fresh state is
// returned; the vertical move keeps the goal x (it is not a horizontal move).
export function moveByLine(
  s: EditorBufferState,
  dir: -1 | 1,
  metrics: Metrics,
  extend = false,
): EditorBufferState {
  const text = s.text ?? "";
  const len = text.length;
  const range = lineRange(text, Math.min(Math.max(s.head, 0), len));
  const movingDown = dir === 1;
  const atEdge = movingDown ? range.end >= len : range.start <= 0;
  if (atEdge) {
    const next = movingDown ? len : 0;
    const moved = stepHead(s, next, movingDown ? 1 : -1, extend);
    return { ...moved, goalX: s.goalX };
  }
  const landing = verticalLanding(text, range, dir, s.goalX, metrics);
  const moved = stepHead(s, landing, dir, extend);
  return { ...moved, goalX: s.goalX };
}

// Select all: the selection spans the whole text (anchor 0 .. head len);
// the selection is empty exactly when anchor equals head (task 2).
export function selectAll(s: EditorBufferState): EditorBufferState {
  const len = s.text?.length ?? 0;
  return { ...s, anchor: 0, head: len };
}

// Delete: with a non-empty selection delete the selected range whole;
// without one, delete the grapheme cluster immediately before the cursor
// (head), as a whole cluster: the text splits at the previous boundary and
// the head moves to that boundary. Pure: the input state is not mutated
// and a fresh state is returned; indices stay in range and the resulting
// head rests on a cluster boundary. Select-all then delete therefore
// empties the text.
export function deleteByCluster(s: EditorBufferState): EditorBufferState {
  const text = s.text;
  if (text === null) {
    return { ...s };
  }
  const head = Math.min(Math.max(s.head, 0), text.length);
  const anchor = Math.min(Math.max(s.anchor, 0), text.length);
  let start: number;
  let end: number;
  if (anchor !== head) {
    start = Math.min(anchor, head);
    end = Math.max(anchor, head);
  } else if (head === 0) {
    return { ...s };
  } else {
    const bounds = clusterBoundaries(text);
    const idx = bounds.indexOf(head);
    start = idx > 0 ? (bounds[idx - 1] ?? 0) : 0;
    end = head;
  }
  const nextText = text.slice(0, start) + text.slice(end);
  const nextPos = Math.min(start, nextText.length);
  const before: readonly [number, number] = anchor !== head
    ? [Math.min(anchor, head), Math.max(anchor, head)]
    : [head, head];
  const nextHistory = pushDelete(s.history ?? initialUndoHistory(), start, text.slice(start, end), before, [nextPos, nextPos]);
  return { text: nextText, anchor: nextPos, head: nextPos, goalX: s.goalX, history: nextHistory };
}
