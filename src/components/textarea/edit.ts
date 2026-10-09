// Purpose: the textarea's editing state and effect interpreter — the
//   second half of the basic_components.cljc textarea port.
// Responsibilities: the textarea-state extra map (cursor, select-cursor,
//   down-pos, mpos, last-click — text_state_split), and
//   applyTextareaIntents, the interpreter for the intents the textarea's
//   handlers return: it applies the editing effects (insert-text,
//   insert-newline, delete-backward, backward-char, forward-char,
//   previous-line, next-line) and raw update effects against the state,
//   and returns the external intents (request-focus, clipboard-copy,
//   clipboard-cut) untouched for the app-level dispatcher.
// Rationale: openspec/specs/components-textarea/spec.md is the design authority —
//   editing state is split (text and focus in app state, cursor,
//   select-cursor, down-pos, mpos and last-click in the textarea-state
//   extra map), editing effects carry their text and extra paths as
//   data so they remain replaceable intents, and every editing op keeps
//   0 <= cursor <= len(text) (cursor_clamped).

import { select, setPath, updatePath, type Path } from "../../effects/paths.ts";
import type { Intent, IntentList } from "../../events/bubble.ts";
import type { Vec2 } from "../../views/model.ts";

// The last click, for the double-click detector (double_click_word:
// within 500 ms and squared distance under 100 of the previous click).
export interface LastClick {
  readonly pos: Vec2;
  readonly time: number;
}

// The textarea-state extra map (text_state_split): everything the
// textarea edits that is NOT the text or the focus.
export interface TextareaExtra {
  readonly cursor: number;
  readonly "select-cursor": number | null;
  readonly "down-pos": Vec2 | null;
  readonly mpos: Vec2 | null;
  readonly "last-click": LastClick | null;
}

export function initialTextareaExtra(over: Partial<TextareaExtra> = {}): TextareaExtra {
  return {
    cursor: 0,
    "select-cursor": null,
    "down-pos": null,
    mpos: null,
    "last-click": null,
    ...over,
  };
}

// The editing-intent interpreter table: one applier per editing effect
// (the intents the textarea handlers return that applyTextareaIntents
// applies itself). External intents (request-focus, the clipboard
// effects — applied by the top-level handler and the effect
// dispatcher's backend service respectively) and unknown intents pass
// through unchanged.
type EditApplier = (state: unknown, intent: Intent) => unknown;

const rest = (intent: Intent): readonly unknown[] => intent.slice(1) as readonly unknown[];

const EDIT_OPS: Readonly<Record<string, EditApplier>> = {
  "update": (s, it) => updatePath(s, rest(it)[0] as Path, rest(it)[1] as (old: unknown) => unknown),
  "insert-text": (s, it) => withPaths(s, rest(it)[1] as Path, rest(it)[2] as Path, (t, c, sc) =>
    insertOp(t, c, sc, rest(it)[0] as string)),
  "insert-newline": (s, it) => withPaths(s, rest(it)[0] as Path, rest(it)[1] as Path, (t, c, sc) =>
    insertOp(t, c, sc, "\n")),
  "delete-backward": (s, it) => withPaths(s, rest(it)[0] as Path, rest(it)[1] as Path, deleteOp),
  "backward-char": (s, it) => withPaths(s, rest(it)[0] as Path, rest(it)[1] as Path, (t, c, sc) =>
    charOp(t, c, sc, "backward")),
  "forward-char": (s, it) => withPaths(s, rest(it)[0] as Path, rest(it)[1] as Path, (t, c, sc) =>
    charOp(t, c, sc, "forward")),
  "previous-line": (s, it) => withPaths(s, rest(it)[0] as Path, rest(it)[1] as Path, (t, c, sc) =>
    lineOp(t, c, sc, "prev")),
  "next-line": (s, it) => withPaths(s, rest(it)[0] as Path, rest(it)[1] as Path, (t, c, sc) =>
    lineOp(t, c, sc, "next")),
};

// Apply the textarea's intents against the state, in order. Editing
// effects read and write through their carried paths; the external
// intents (request-focus, the clipboard effects — applied by the
// top-level handler and the effect dispatcher's backend service
// respectively) pass through unchanged.
export function applyTextareaIntents<S>(
  state: S,
  intents: IntentList,
): { state: S; external: IntentList } {
  let out: unknown = state;
  const external: Intent[] = [];
  for (const intent of intents) {
    const edit = EDIT_OPS[intent[0] as string];
    if (edit !== undefined) {
      out = edit(out, intent);
      continue;
    }
    // an intent this interpreter does not know is not ours to
    // apply — pass it through for the app-level dispatcher
    external.push(intent);
  }
  return { state: out as S, external };
}

// The result of one editing op over (text, extra): the new text and the
// new cursor and selection (cursor_clamped keeps 0 <= cursor <= len).
interface EditResult {
  readonly text: string | null;
  readonly cursor: number;
  readonly "select-cursor": number | null;
}

const textLen = (text: string | null): number => text?.length ?? 0;

// Read the (text, cursor, selection) an editing op works on through
// its carried paths, apply the op, and write the result back: the text
// through its app-state path, the cursor and selection through the
// extra map's paths (text_state_split).
function withPaths(
  state: unknown,
  textPath: Path,
  extraPath: Path,
  op: (text: string | null, cursor: number, selectCursor: number | null) => EditResult,
): unknown {
  const r = op(
    select(state, textPath) as string | null,
    select(state, [...extraPath, ["keypath", "cursor"]]) as number,
    select(state, [...extraPath, ["keypath", "select-cursor"]]) as number | null,
  );
  let out = setPath(state, textPath, r.text);
  out = setPath(out, [...extraPath, ["keypath", "cursor"]], r.cursor);
  out = setPath(out, [...extraPath, ["keypath", "select-cursor"]], r["select-cursor"]);
  return out;
}

// insert_splice: inserting s with cursor c and no selection yields
// text[0..c] + s + text[c..] with cursor c + len(s); a nil text yields
// s. insert_replaces_selection: with a select cursor the range from
// min(c, sc) to max(c, sc), clamped to len(text), is replaced by s,
// the cursor becomes min(c, sc) + len(s), and the selection is cleared.
function insertOp(
  text: string | null,
  cursor: number,
  selectCursor: number | null,
  s: string,
): EditResult {
  const n = textLen(text);
  const base = text ?? "";
  if (selectCursor !== null) {
    const start = Math.min(cursor, selectCursor);
    const end = Math.min(Math.max(cursor, selectCursor), n);
    const nt = base.slice(0, start) + s + base.slice(end);
    return { text: nt, cursor: start + s.length, "select-cursor": null };
  }
  const c = Math.min(cursor, n);
  const nt = base.slice(0, c) + s + base.slice(c);
  return { text: nt, cursor: Math.min(c + s.length, nt.length), "select-cursor": null };
}

// delete_backward_rule: with no selection it removes the character
// before the cursor, where the cursor is first clamped to len(text)
// and a cursor at 0 removes nothing; with a selection it removes the
// selected range, and the cursor becomes max(0, min(sc, c)) (or c - 1
// without a selection) and the selection is cleared.
function deleteOp(
  text: string | null,
  cursor: number,
  selectCursor: number | null,
): EditResult {
  const n = textLen(text);
  const c = Math.min(cursor, n);
  const base = text ?? "";
  if (selectCursor !== null) {
    const start = Math.min(Math.min(cursor, selectCursor), n);
    const end = Math.min(Math.max(cursor, selectCursor), n);
    return {
      text: base.slice(0, start) + base.slice(end),
      cursor: Math.max(0, Math.min(selectCursor, c)),
      "select-cursor": null,
    };
  }
  if (c === 0) return { text, cursor: 0, "select-cursor": null };
  return { text: base.slice(0, c - 1) + base.slice(c), cursor: c - 1, "select-cursor": null };
}

// cursor_clamped: forward-char gives min(len, c + 1) and backward-char
// gives max(0, min(len, c) - 1); both clear the selection.
function charOp(
  text: string | null,
  cursor: number,
  selectCursor: number | null,
  dir: "forward" | "backward",
): EditResult {
  const n = textLen(text);
  const next =
    dir === "forward"
      ? Math.min(n, cursor + 1)
      : Math.max(0, Math.min(n, cursor) - 1);
  return { text, cursor: next, "select-cursor": null };
}

// previous_line_quirk: previous-line clears the selection and sets the
// cursor to the index of the last newline at or before c - 1, or to 0
// when there is none — the newline character itself, not the line
// start. next_line_rule: next-line sets the cursor to one past the
// next newline at or after c, or to len(text) when there is none.
function lineOp(
  text: string | null,
  cursor: number,
  selectCursor: number | null,
  dir: "prev" | "next",
): EditResult {
  const base = text ?? "";
  if (dir === "prev") {
    let found = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      if (base[i] === "\n") {
        found = i;
        break;
      }
    }
    return { text, cursor: found >= 0 ? found : 0, "select-cursor": null };
  }
  let next = -1;
  for (let i = cursor; i < base.length; i++) {
    if (base[i] === "\n") {
      next = i;
      break;
    }
  }
  return { text, cursor: next >= 0 ? next + 1 : base.length, "select-cursor": null };
}
