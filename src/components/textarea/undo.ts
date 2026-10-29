// Purpose: the editor buffer's undo timeline — design D6 (task 6.2): a
//   bounded stack of splice entries; undo applies the inverse splice and
//   restores the selection before, redo reapplies; a new edit after an
//   undo discards the redo tail (branch on act); consecutive
//   single-character inserts coalesce into one entry until a boundary
//   (whitespace, newline, cursor jump, elapsed-time gap).
// Responsibilities: the UndoEntry / UndoHistory shapes, the bounded
//   initial history, the undo / redo operations, the insert-text entry
//   point with coalescing, and the redo-tail discard on a new edit.
// Rationale: design D6 puts the timeline in the buffer's pure model; the
//   seam lives in its own module (as the task-5 hit-test seam did) so the
//   buffer facade keeps its size while the undo surface stays the
//   buffer's public undo/redo face (textarea integration lands in task 7).

import type { EditorBufferState, Metrics } from "./buffer.ts";
import { lineRange } from "./hit-test.ts";

// Design D6 (task 6): one undo history entry is one applied edit: the
//   splice position, the text removed and inserted, and the selection
//   before and after the edit. `before` / `after` are the anchor..head
//   selection ranges (a degenerate [pos, pos] pair is an empty selection
//   at `pos`). `time` is the clock reading when the edit was applied (the
//   coalescing time gap, design D6).
export interface UndoEntry {
  readonly at: number;
  readonly deleted: string;
  readonly inserted: string;
  readonly before: readonly [number, number];
  readonly after: readonly [number, number];
  readonly time: number | undefined;
}

// Design D6: the undo timeline — the undo stack (oldest → newest) plus the
//   redo stack (newest first), bounded by `limit`; consecutive
//   single-character inserts coalesce while the gap to the last entry is
//   under `coalesceTime` (a heuristic prop with default, not a spec'd constant).
export interface UndoHistory {
  readonly entries: readonly UndoEntry[];
  readonly redo: readonly UndoEntry[];
  readonly limit: number;
  readonly coalesceTime: number;
}

// Design D6: the default undo bound and the default coalescing time gap.
export const DEFAULT_UNDO_LIMIT = 100;
export const DEFAULT_UNDO_COALESCE_TIME = 500;

export function initialUndoHistory(
  limit: number = DEFAULT_UNDO_LIMIT,
  coalesceTime: number = DEFAULT_UNDO_COALESCE_TIME,
): UndoHistory {
  return { entries: [], redo: [], limit, coalesceTime };
}

// Design D6: the coalescing boundary check — a new edit coalesces into the
//   last entry when it is a consecutive single-character insert inside the
//   same word (no boundary crossed) within the coalescing time gap.
function isCoalescable(history: UndoHistory, last: UndoEntry | undefined, entry: UndoEntry): boolean {
  if (last === undefined) return false;
  if (last.deleted !== "") return false;
  if (entry.deleted !== "") return false;
  if (entry.inserted.length !== 1) return false;
  if (entry.at !== last.at + last.inserted.length) return false;
  if (/\s/u.test(entry.inserted)) return false;
  return (entry.time ?? 0) - (last.time ?? 0) < history.coalesceTime;
}

// Design D6: record a new edit — coalesce into the last entry when the
//   edit is a consecutive single-character insert inside the same word
//   (no boundary crossed) within the coalescing time gap; a coalescable
//   merge extends the last entry's inserted text and after-selection, and
//   anything else appends a fresh entry. A new edit after an undo discards
//   the redo tail (branch on act), and the undo stack is bounded by the
//   limit.
export function pushHistory(history: UndoHistory, entry: UndoEntry): UndoHistory {
  const redo = history.redo;
  const last = history.entries[history.entries.length - 1];
  const coalescable = redo.length === 0 && isCoalescable(history, last, entry);
  const entries = coalescable && last !== undefined
    ? [
      ...history.entries.slice(0, -1),
      {
        ...entry,
        at: last.at,
        inserted: last.inserted + entry.inserted,
        before: last.before,
        after: [
          last.at + last.inserted.length + entry.inserted.length,
          last.at + last.inserted.length + entry.inserted.length,
        ] as readonly [number, number],
        time: entry.time,
      },
    ]
    : [...history.entries, entry];
  const bounded = entries.length > history.limit ? entries.slice(entries.length - history.limit) : entries;
  return { entries: bounded, redo: [], limit: history.limit, coalesceTime: history.coalesceTime };
}

// Design D6: record a delete (or selection replace) as one undo entry and
//   return the updated history.
export function pushDelete(
  history: UndoHistory,
  at: number,
  deleted: string,
  before: readonly [number, number],
  after: readonly [number, number],
): UndoHistory {
  return pushHistory(history, { at, deleted, inserted: "", before, after, time: undefined });
}

// Design D6: undo applies the inverse splice of the newest entry and
//   restores the selection before the edit; the undone entry moves to the
//   redo stack (newest first).
function undoText(entry: UndoEntry, after: string): string {
  const head = after.slice(0, entry.at);
  if (entry.inserted === "") {
    // a delete (or selection replace): the before-text continues after the
    // deleted span
    return head + entry.deleted + after.slice(entry.at);
  }
  if (entry.deleted === "") {
    // a pure insert: the before-text continues after the inserted span
    return head + after.slice(entry.at + entry.inserted.length);
  }
  // a selection replace: the before-text continues after the inserted span
  return head + entry.deleted + after.slice(entry.at + entry.inserted.length);
}

// Design D6: redo reapplies the forward splice of the oldest redo entry.
function redoText(entry: UndoEntry, before: string): string {
  const head = before.slice(0, entry.at);
  if (entry.deleted === "") {
    // a pure insert: the after-text continues after the inserted span
    return head + entry.inserted + before.slice(entry.at);
  }
  if (entry.inserted === "") {
    // a delete (or selection replace): the after-text skips the deleted span
    return head + before.slice(entry.at + entry.deleted.length);
  }
  // a selection replace: the after-text continues after the deleted span
  return head + entry.inserted + before.slice(entry.at + entry.deleted.length);
}

// Design D6: undo — apply the inverse splice and restore the selection
//   before; pure, and a no-op without history entries.
export function undo(s: EditorBufferState): EditorBufferState {
  const history = s.history ?? initialUndoHistory();
  const entries = history.entries;
  const entry = entries[entries.length - 1];
  if (entry === undefined) {
    return s;
  }
  const nextHistory: UndoHistory = {
    ...history,
    entries: entries.slice(0, entries.length - 1),
    redo: [...history.redo, entry].slice(-history.limit),
  };
  const before = entry.before;
  return { ...s, text: undoText(entry, s.text ?? ""), anchor: before[0], head: before[1], goalX: s.goalX, history: nextHistory };
}

// Design D6: redo — reapply the forward splice and restore the selection
//   after; pure, and a no-op without redo entries.
export function redo(s: EditorBufferState): EditorBufferState {
  const history = s.history ?? initialUndoHistory();
  const redoStack = history.redo;
  const entry = redoStack[0];
  if (entry === undefined) {
    return s;
  }
  const nextHistory: UndoHistory = {
    ...history,
    entries: [...history.entries, entry],
    redo: redoStack.slice(1),
  };
  const after = entry.after;
  return { ...s, text: redoText(entry, s.text ?? ""), anchor: after[0], head: after[1], goalX: s.goalX, history: nextHistory };
}

// Design D6: insert text at the cursor (or over a selection), recording
//   one undo entry; the entry carries the selection before and after the
//   edit, and the goal x is set from the new head under the injected
//   metrics (design D3/D4).
export function insertText(
  s: EditorBufferState,
  text: string,
  opts: { now?: number; metrics?: Metrics } = {},
): EditorBufferState {
  const history = s.history ?? initialUndoHistory();
  const base = s.text ?? "";
  const n = base.length;
  const head = Math.min(Math.max(s.head, 0), n);
  const anchor = Math.min(Math.max(s.anchor, 0), n);
  const before: readonly [number, number] = anchor <= head ? [anchor, head] : [head, anchor];
  const hasSelection = before[0] < before[1];
  const at = hasSelection ? before[0] : head;
  const deleted = hasSelection ? base.slice(at, before[1]) : "";
  const nextText = hasSelection
    ? base.slice(0, at) + text + base.slice(before[1])
    : base.slice(0, head) + text + base.slice(head);
  const cursor = at + text.length;
  const entry: UndoEntry = { at, deleted, inserted: text, before, after: [cursor, cursor], time: opts.now };
  const nextHistory = pushHistory(history, entry);
  const goalX = opts.metrics !== undefined
    ? opts.metrics.measure(nextText.slice(lineRange(nextText, cursor).start, cursor))
    : s.goalX;
  return { text: nextText, anchor: cursor, head: cursor, goalX, history: nextHistory };
}
