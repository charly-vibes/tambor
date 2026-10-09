// Purpose: the touch selection layer of the corpus — a long-press on
//   text selects a word and shows draggable selection handles that
//   feed the drag-selection path.
// Responsibilities: longPressSelection selects the whitespace-bounded
//   word under an index; selectionHandles places the two draggable
//   handles at the selection's edges; dragHandle feeds the
//   drag-selection path by re-selecting through a dragged index.
// Rationale: openspec/specs/ui-mobile/spec.md selection_handles is the design
//   authority. The word definition is the corpus's own: the
//   whitespace-bounded word around an index, exactly as the textarea's
//   double_click_word rule states it (components.textarea), so the
//   long-press selection and the double-click selection agree.
//   Handle positions are glyph indices on the text line — the same
//   one-cell-per-character geometry the textarea's drawn selection
//   uses (components.textarea selection_drawn). Dragging a handle
//   feeds the drag-selection path by moving the selection end to the
//   dragged index, ordered. No behavior beyond the corpus.

import type { Vec2 } from "../views/model.ts";

// A selection range: text.slice(start, end).
export interface Selection {
  readonly start: number;
  readonly end: number;
}

const isSpace = (ch: string): boolean => /\s/.test(ch);

// The whitespace-bounded word around the index: from the word start to
// the next whitespace or the end of text — the same rule the
// textarea's double_click_word applies.
export function wordBounds(text: string, idx: number): readonly [number, number] {
  let start = Math.min(idx, text.length);
  while (start > 0 && !isSpace(text[start - 1]!)) start--;
  let end = start;
  while (end < text.length && !isSpace(text[end]!)) end++;
  return [start, end];
}

// A long-press on text selects the word under the index
// (selection_handles).
export function longPressSelection(text: string, idx: number): Selection {
  const [start, end] = wordBounds(text, idx);
  return { start, end };
}

// A draggable selection handle: which edge, the character index it
// drags, and its position on the text line in glyph indices.
export interface Handle {
  readonly which: "start" | "end";
  readonly index: number;
  readonly pos: Vec2;
}

// The two handles of a selection, at its edges (selection_handles:
// "draggable selection handles").
export function selectionHandles(text: string, sel: Selection): readonly [Handle, Handle] {
  void text;
  return [
    { which: "start", index: sel.start, pos: [sel.start, 0] },
    { which: "end", index: sel.end, pos: [sel.end, 0] },
  ];
}

// Dragging a handle feeds the drag-selection path: the dragged edge
// moves to the (clamped) index and the selection stays ordered.
export function dragHandle(
  text: string,
  sel: Selection,
  which: "start" | "end",
  toIndex: number,
): Selection {
  const t = Math.max(0, Math.min(toIndex, text.length));
  if (which === "end") {
    return { start: Math.min(sel.start, t), end: Math.max(sel.start, t) };
  }
  return { start: Math.min(t, sel.end), end: Math.max(t, sel.end) };
}
