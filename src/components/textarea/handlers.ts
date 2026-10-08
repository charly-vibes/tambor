// Purpose: textarea event handlers — the intent-returning handlers
//   extracted from the textarea view so the view stays readable.
// Responsibilities: pointer down (request-focus + cursor effects,
//   double-click word selection), pointer move (mpos tracking), pointer
//   up (selection finalization), key-press (named keys + text insert)
//   and clipboard (copy/cut/paste) handlers.
// Rationale: specs/components-textarea.md is the design authority.
//   Handlers are pure functions of the render-time context (props, the
//   extra map snapshot, the text, focus, the intent builder and the
//   position/index helpers) — textarea() composes them into the
//   onPairs node (tambor-272).

import { type Intent, type IntentList } from "../../events/bubble.ts";
import { type Vec2 } from "../../views/model.ts";
import { wordBounds } from "../../ui/handles.ts";
import type { TextareaProps } from "./textarea.ts";
import type { TextareaExtra } from "./edit.ts";

// A selection exists when select-cursor is set and differs from the
// cursor; its range runs from the smaller to the larger index.
export function selectionRange(extra: TextareaExtra): readonly [number, number] | null {
  const sc = extra["select-cursor"];
  if (sc === null || sc === extra.cursor) return null;
  return [Math.min(sc, extra.cursor), Math.max(sc, extra.cursor)];
}

// double_click_word thresholds: a second click within 500 ms and with
// squared distance under 100 from the last click is a double click.
export const DOUBLE_CLICK_MS = 500;
export const DOUBLE_CLICK_DIST2 = 100;

function dist2(a: Vec2, b: Vec2): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

// Everything the handlers need, built once per render in textarea().
export interface TextareaCtx {
  readonly props: TextareaProps;
  /** the current textarea-state extra map snapshot */
  readonly extra: TextareaExtra;
  /** the current text */
  readonly t: string;
  readonly focused: boolean;
  /** an update intent against one key of the extra map */
  readonly u: (key: string, value: unknown) => Intent;
  /** view position → text-space position (padding removed) */
  readonly toTextPos: (pos: Vec2) => Vec2;
  /** text-space position → character index */
  readonly indexAt: (pos: Vec2) => number;
}

// request_focus_on_hit: a pointer down inside that yields intents
// returns request-focus followed by those intents; one that yields
// none returns nothing. pointer_down_cursor: the cursor moves to
// indexForPosition at the position, mpos and down-pos store the
// position, and the selection is cleared.
export function onMouseDown(c: TextareaCtx, args: readonly unknown[]): IntentList {
  const pos = args[0] as Vec2;
  const local = c.toTextPos(pos);
  const idx = c.indexAt(local);
  const now = c.props.now ?? Date.now();
  const lc = c.extra["last-click"];
  // double_click_word: every click records the time and position; a
  // second click within 500 ms and with squared distance under 100
  // from the last click selects from the whitespace-bounded word
  // start to the next whitespace or the end of text
  const record = c.u("last-click", { pos: local, time: now });
  if (
    lc !== null &&
    now - lc.time < DOUBLE_CLICK_MS &&
    dist2(local, lc.pos) < DOUBLE_CLICK_DIST2
  ) {
    const [wordStart, wordEnd] = wordBounds(c.t, idx);
    return [
      ["request-focus", c.props.textPath],
      c.u("cursor", wordStart),
      c.u("select-cursor", wordEnd),
      record,
    ];
  }
  return [
    ["request-focus", c.props.textPath],
    c.u("cursor", idx),
    c.u("mpos", local),
    c.u("down-pos", local),
    c.u("select-cursor", null),
    record,
  ];
}

// drag_tracks: a pointer move while down-pos is set stores mpos;
// with no down-pos it returns nothing.
export function onMouseMove(c: TextareaCtx, args: readonly unknown[]): IntentList {
  if (c.extra["down-pos"] === null) return [];
  return [c.u("mpos", c.toTextPos(args[0] as Vec2))];
}

// finish_drag_rule: on pointer up the end index is indexForPosition
// at the position; the selection start is the index at down-pos when
// it differs from the end index, plus one when it lies after the end
// index; down-pos is cleared.
export function onMouseUp(c: TextareaCtx, args: readonly unknown[]): IntentList {
  const down = c.extra["down-pos"];
  if (down === null) return [];
  const local = c.toTextPos(args[0] as Vec2);
  const end = c.indexAt(local);
  const start = c.indexAt(down);
  const out: Intent[] = [];
  if (start !== end) {
    out.push(c.u("cursor", start > end ? start + 1 : start), c.u("select-cursor", end));
  }
  out.push(c.u("down-pos", null));
  return out;
}

// keys_need_focus: an unfocused textarea returns no effects for
// key-press or clipboard events. key_map: the named keys map to
// their effects, any string inserts text, any other key is ignored.
export function onKeyPress(c: TextareaCtx, key: unknown): IntentList {
  if (!c.focused) return [];
  const tp = c.props.textPath;
  const ep = c.props.extraPath;
  switch (key) {
    case "up":
      return [["previous-line", tp, ep]];
    case "down":
      return [["next-line", tp, ep]];
    case "left":
      return [["backward-char", tp, ep]];
    case "right":
      return [["forward-char", tp, ep]];
    case "enter":
      return [["insert-newline", tp, ep]];
    case "backspace":
      return [["delete-backward", tp, ep]];
    default:
      if (typeof key === "string") return [["insert-text", key, tp, ep]];
      return [];
  }
}

// clipboard_copy_rule / clipboard_cut_rule / clipboard_paste_rule:
// all clipboard ops need focus; copy returns the clipboard-copy
// effect with the selected text range, cut edits the text and
// returns clipboard-cut with the range, paste returns insert-text
// with the pasted string.
export function onClipboard(c: TextareaCtx, args: readonly unknown[]): IntentList {
  const data = args[0] as string;
  if (!c.focused) return [];
  if (data === "copy") {
    const range = selectionRange(c.extra);
    return range ? [["clipboard-copy", c.t.slice(range[0], range[1])]] : [];
  }
  if (data === "cut") {
    return clipboardCut(c);
  }
  // paste: the data is the pasted string
  return [["insert-text", data, c.props.textPath, c.props.extraPath]];
}

function clipboardCut(c: TextareaCtx): IntentList {
  const range = selectionRange(c.extra);
  if (!range) return [];
  const [start, end] = range;
  return [
    ["update", c.props.textPath, () => c.t.slice(0, start) + c.t.slice(end)],
    c.u("cursor", start),
    c.u("select-cursor", null),
    ["clipboard-cut", c.t.slice(start, end), range],
  ];
}
