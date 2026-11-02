// Purpose: the editor-buffer intent application for the textarea's
//   extended profile edits — the single application point that routes an
//   editing intent through the editor-buffer operation and writes the
//   buffer result back through the textarea's paths (design D5/D6/D8).
// Responsibilities: derive the editor buffer state from the textarea
//   state through the carried paths, apply the editor-buffer operation
//   the intent names, and write the buffer result back through the text
//   and extra paths in one atomic pass (text, cursor, selection, goal-x,
//   history).
// Rationale: design D8 — the extended profile routes editing effects
//   through the editor-buffer operations; design D5 — the hit-test and
//   design D6 — the undo timeline each live in their own seam module, and
//   this is their intent-application twin (the buffer facade stays the
//   stable public surface).

import { select, setPath, type Path } from "../../effects/paths.ts";
import type { Intent } from "../../events/bubble.ts";
import { initialUndoHistory, type UndoHistory } from "./undo.ts";
import {
  deleteByCluster,
  deleteForward,
  insertText,
  moveByCluster,
  moveByLine,
  moveByWord,
  moveToDocumentBoundary,
  moveToLineBoundary,
  redo,
  selectAll,
  undo,
  type EditorBufferState,
  type Metrics,
} from "./buffer.ts";

// The editor buffer state an editing op works on, derived from the
// textarea state through its carried paths (text_state_split plus the
// extended state: goal-x and history).
export function editorBufferFrom(state: unknown, textPath: Path, extraPath: Path): EditorBufferState {
  const text = select(state, textPath) as string | null;
  const cursor = select(state, [...extraPath, ["keypath", "cursor"]]) as number;
  const selectCursor = select(state, [...extraPath, ["keypath", "select-cursor"]]) as number | null;
  const history = (select(state, [...extraPath, ["keypath", "history"]]) as UndoHistory | null) ?? initialUndoHistory();
  const goalX = (select(state, [...extraPath, ["keypath", "goal-x"]]) as number | null) ?? 0;
  return { text, anchor: selectCursor ?? cursor, head: cursor, goalX, history };
}

// Write a computed editor-buffer result back through the textarea's
// paths in one pass: the text through its app-state path, the cursor and
// selection through the extra map's keypaths, and the goal x and history
// through the extra map's keypaths — the atomic multi-path edit update
// (text_state_split, design D4/D6).
export function writeBufferState(
  state: unknown,
  next: EditorBufferState,
  textPath: Path,
  extraPath: Path,
): unknown {
  let out = setPath(state, textPath, next.text);
  out = setPath(out, [...extraPath, ["keypath", "cursor"]], next.head);
  out = setPath(out, [...extraPath, ["keypath", "select-cursor"]], next.anchor === next.head ? null : next.anchor);
  out = setPath(out, [...extraPath, ["keypath", "goal-x"]], next.goalX);
  out = setPath(out, [...extraPath, ["keypath", "history"]], next.history);
  return out;
}

// The editor-buffer operation an extended editing intent routes to, and
// applies over the derived buffer — the inserts apply their own text-level
// operation, every other editing op applies its movement/effect op over
// the buffer (design D5/D6/D8).
type BufferOpFn = (
  buf: EditorBufferState,
  extend: boolean,
  metrics: Metrics,
) => EditorBufferState;

const opFns: Record<string, BufferOpFn | undefined> = {
  "delete-backward": (buf) => deleteByCluster(buf),
  "delete-forward": (buf) => deleteForward(buf),
  "backward-char": (buf, extend, metrics) => moveByCluster(buf, -1, extend, metrics),
  "forward-char": (buf, extend, metrics) => moveByCluster(buf, 1, extend, metrics),
  "previous-line": (buf, extend, metrics) => moveByLine(buf, -1, metrics, extend),
  "next-line": (buf, extend, metrics) => moveByLine(buf, 1, metrics, extend),
  "backward-word": (buf, extend, metrics) => moveByWord(buf, -1, extend, metrics),
  "forward-word": (buf, extend, metrics) => moveByWord(buf, 1, extend, metrics),
  "move-to-line-start": (buf, extend, metrics) => moveToLineBoundary(buf, "start", extend, metrics),
  "move-to-line-end": (buf, extend, metrics) => moveToLineBoundary(buf, "end", extend, metrics),
  "move-to-document-start": (buf, extend, metrics) => moveToDocumentBoundary(buf, "start", extend, metrics),
  "move-to-document-end": (buf, extend, metrics) => moveToDocumentBoundary(buf, "end", extend, metrics),
  "select-all": (buf) => selectAll(buf),
  undo: (buf) => undo(buf),
  redo: (buf) => redo(buf),
};

// The editor-buffer operation an extended editing intent routes to, and
// the write-back of the resulting buffer state (design D5/D6/D8).
export function applyBufferIntent(state: unknown, intent: Intent, metrics: Metrics): unknown {
  const op = intent[0] as string;
  const rest = intent.slice(1) as readonly unknown[];
  const textPath = rest[0] as Path;
  const extraPath = rest[1] as Path;
  const extend = (rest[2] as boolean | undefined) ?? false;
  if (op === "insert-text") {
    const buf = editorBufferFrom(state, rest[1] as Path, rest[2] as Path);
    const next = insertText(buf, rest[0] as string, { now: (rest[3] as number | undefined) ?? 0, metrics });
    return writeBufferState(state, next, rest[1] as Path, rest[2] as Path);
  }
  if (op === "insert-newline") {
    const buf = editorBufferFrom(state, textPath, extraPath);
    const next = insertText(buf, "\n", { now: (rest[2] as number | undefined) ?? 0, metrics });
    return writeBufferState(state, next, textPath, extraPath);
  }
  const opFn: BufferOpFn | undefined = opFns[op];
  if (opFn === undefined) return state;
  const next = opFn(editorBufferFrom(state, textPath, extraPath), extend, metrics);
  return writeBufferState(state, next, textPath, extraPath);
}
