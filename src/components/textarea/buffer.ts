// Purpose: the editor buffer — the headless pure editing model over
//   { text, anchor, head, goalX } that the textarea's `extended`
//   profile routes through (openspec/specs/editor-buffer/spec.md).
// Responsibilities: the buffer state type, the grapheme cluster
//   boundary helper (Intl.Segmenter, granularity "grapheme") and the
//   task-1 operation slice: move-by-cluster and delete-by-cluster.
// Rationale: the buffer is a pure model over text + selection + goalX
//   (pure buffer state) and every operation steps over whole grapheme
//   clusters so no index ever rests inside a cluster (grapheme boundary
//   snapping). Task 1.2 of tambor-72m lands this Red->Green slice; the
//   selection model, line/word navigation, goal-column moves, hit-test,
//   undo and textarea integration land in later tasks.

// The editor buffer state: the text being edited, the selection (the
// range between anchor and head, empty exactly when they are equal) and
// the goal x offset (the horizontal target for vertical movement; task 4).
export interface EditorBufferState {
  readonly text: string | null;
  readonly anchor: number;
  readonly head: number;
  readonly goalX: number;
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
  return { text, anchor: anchor ?? head, head, goalX };
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
): EditorBufferState {
  const text = s.text ?? "";
  const len = text.length;
  const head = Math.min(Math.max(s.head, 0), len);
  const bounds = clusterBoundaries(text);
  const idx = bounds.indexOf(head);
  const next = dir === 1 ? bounds[idx + 1] ?? head : bounds[idx - 1] ?? head;
  let headN = next;
  let anchorN = s.anchor;
  if (!extend && anchorN !== head) {
    // collapse to the selection edge in the move direction, without
    // stepping further; the selection is cleared (it is now empty)
    headN = dir === 1 ? head : anchorN;
    anchorN = headN;
  }
  return { ...s, head: headN, anchor: anchorN };
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
  return { text: nextText, anchor: nextPos, head: nextPos, goalX: s.goalX };
}
