// Purpose: textarea event handlers — the intent-returning handlers
//   extracted from the textarea view so the view stays readable.
// Responsibilities: pointer down (request-focus + cursor effects,
//   double-click word selection), pointer move (mpos tracking), pointer
//   up (selection finalization), key-press (named keys + text insert)
//   and clipboard (copy/cut/paste) handlers.
// Rationale: openspec/specs/components-textarea/spec.md is the design authority.
//   Handlers are pure functions of the render-time context (props, the
//   extra map snapshot, the text, focus, the intent builder and the
//   position/index helpers) — textarea() composes them into the
//   onPairs node (tambor-272). Under the opt-in "extended" profile
//   (design D1/D8) the key and pointer handlers route through the
//   editor-buffer operations and the injected metrics; the membrane
//   profile keeps the faithful baseline handlers.

import { type Intent, type IntentList } from "../../events/bubble.ts";
import { type Vec2 } from "../../views/model.ts";
import { wordBounds } from "../../ui/handles.ts";
import { indexAt, lineRange } from "./hit-test.ts";
import { type EditorBufferState, type Metrics } from "./buffer.ts";
import { initialUndoHistory, type UndoHistory } from "./undo.ts";
import { type TextareaExtra, type TextareaProfile } from "./edit.ts";
import { type TextareaProps } from "./textarea.ts";

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
  /** the opt-in editing profile (design D1); "membrane" by default */
  readonly profile: TextareaProfile;
  /** the injected geometry for the buffer's goal-column moves (design D3) */
  readonly metrics: Metrics;
  /** an update intent against one key of the extra map */
  readonly u: (key: string, value: unknown) => Intent;
  /** view position → text-space position (padding removed) */
  readonly toTextPos: (pos: Vec2) => Vec2;
  /** text-space position → character index */
  readonly indexAt: (pos: Vec2) => number;
}

// One intent in a single-element intent list: the intent itself is
// [op, ...args] and the list carries it.
function single(op: string, ...args: readonly unknown[]): IntentList {
  return [[op, ...args]] as IntentList;
}

// The editor buffer state the extended profile routes through (design
// D8): text + selection + goal x + undo history, derived from the
// textarea state through the extra map.
function bufferFromCtx(c: TextareaCtx): EditorBufferState {
  const extra = c.extra;
  const cursor = extra.cursor;
  const selectCursor = extra["select-cursor"];
  // an extra map persisted before the undo timeline existed carries no
  // history key; the widened type is the honest boundary here (the
  // buffer-edit seam guards the same absence the same way)
  const history = (extra.history as UndoHistory | undefined) ?? initialUndoHistory();
  const goalX = extra["goal-x"] ?? 0;
  return { text: c.t, anchor: selectCursor ?? cursor, head: cursor, goalX, history };
}

// request_focus_on_hit: a pointer down inside that yields intents
// returns request-focus followed by those intents; one that yields
// none returns nothing. pointer_down_cursor: the cursor moves to
// indexForPosition at the position, mpos and down-pos store the
// position, and the selection is cleared. Under the extended profile
// the index resolves through the buffer's multi-line hit-test (design
// D5) and the goal x is set from the resolved position (design D4).
export function onMouseDown(c: TextareaCtx, args: readonly unknown[]): IntentList {
  const pos = args[0] as Vec2;
  const local = c.toTextPos(pos);
  const now = c.props.now ?? Date.now();
  const lc = c.extra["last-click"];
  const idx = c.profile === "extended"
    ? indexAt(bufferFromCtx(c), local, c.metrics)
    : c.indexAt(local);
  return c.profile === "extended"
    ? extendedDownIntents(c, idx, local, now)
    : membraneDownIntents(c, idx, local, now, lc);
}

// The extended pointer-down intents (design D5/D4): the placement
// resolves through the buffer's multi-line hit-test and sets the goal x
// from the resolved position.
function extendedDownIntents(c: TextareaCtx, idx: number, local: Vec2, now: number): IntentList {
  const goalX = c.metrics.measure(c.t.slice(lineRange(c.t, idx).start, idx));
  return [
    ["request-focus", c.props.textPath],
    c.u("cursor", idx),
    c.u("mpos", local),
    c.u("down-pos", local),
    c.u("select-cursor", null),
    c.u("last-click", { pos: local, time: now }),
    c.u("goal-x", goalX),
  ];
}

// The membrane pointer-down intents: request-focus, cursor, mpos,
// down-pos, selection clear and last-click; double-click_word overrides
// the selection for a second click inside the double-click thresholds.
function membraneDownIntents(
  c: TextareaCtx,
  idx: number,
  local: Vec2,
  now: number,
  lc: TextareaExtra["last-click"],
): IntentList {
  const downIntents: Intent[] = [
    ["request-focus", c.props.textPath],
    c.u("cursor", idx),
    c.u("mpos", local),
    c.u("down-pos", local),
    c.u("select-cursor", null),
    c.u("last-click", { pos: local, time: now }),
  ];
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
      c.u("last-click", { pos: local, time: now }),
    ];
  }
  return downIntents;
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
  const end = c.profile === "extended"
    ? indexAt(bufferFromCtx(c), local, c.metrics)
    : c.indexAt(local);
  const start = c.profile === "extended"
    ? indexAt(bufferFromCtx(c), down, c.metrics)
    : c.indexAt(down);
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
// A ctrl/cmd-modified key is not text (tambor-hyw): the named keys
// still apply, but the default insert branch drops modified keys so
// Ctrl+A/Z reach the component as distinct no-op key-presses instead of
// typing an a/z into the text.
// The extended profile (design D8) routes the named keys through the
// editor-buffer operations and adds the shift-extend / ctrl-meta-command
// layer on top of the same map.
export function onKeyPress(c: TextareaCtx, key: unknown, mods?: unknown): IntentList {
  if (!c.focused) return [];
  const tp = c.props.textPath;
  const ep = c.props.extraPath;

  // The membrane profile: the faithful baseline key map.
  if (c.profile === "membrane") {
    const effect = namedKeyEffect(key, tp, ep);
    if (effect !== null) return effect;
    if (!isModified(mods) && typeof key === "string") {
      return [["insert-text", key, tp, ep]];
    }
    return [];
  }

  // The extended profile routes through the editor-buffer operations
  // (design D8).
  return extendedKeyIntents(c, key, mods);
}

// The extended key routing (design D8): plain named keys go through the
// editor-buffer operations (shift extends the head of any move), ctrl/
// meta select commands, and an unknown modified key is ignored.
function extendedKeyIntents(c: TextareaCtx, key: unknown, mods: unknown): IntentList {
  const command = extendedCommand(c, key, mods);
  if (command !== null) return command;
  if (isModified(mods)) return [];
  const move = extendedMove(c, key, mods);
  if (move !== null) return move;
  // The remaining plain keys: enter, backspace, delete and text insert.
  const tp = c.props.textPath;
  const ep = c.props.extraPath;
  const now = c.props.now ?? Date.now();
  if (key === "enter") return single("insert-newline", tp, ep, now);
  if (key === "backspace") return single("delete-backward", tp, ep);
  // the delete key is a name, never text: it deletes forward
  if (key === "delete") return single("delete-forward", tp, ep);
  if (typeof key === "string") return single("insert-text", key, tp, ep, now);
  return [];
}

// The extended ctrl/meta command for a modified key (design D8); null
// when the key is not a defined command (an unknown modified key is not
// text and not a command, so the caller ignores it).
function extendedCommand(c: TextareaCtx, key: unknown, mods: unknown): IntentList | null {
  const tp = c.props.textPath;
  const ep = c.props.extraPath;
  const modified = isModified(mods);
  const extend = Array.isArray(mods) && (mods as readonly string[]).includes("shift");
  if (!modified) return null;
  if (key === "a") return single("select-all", tp, ep);
  if (key === "z") return single("undo", tp, ep);
  if (key === "y") return single("redo", tp, ep);
  if (key === "left") return single("backward-word", tp, ep, extend);
  if (key === "right") return single("forward-word", tp, ep, extend);
  if (key === "home") return single("move-to-document-start", tp, ep, extend);
  if (key === "end") return single("move-to-document-end", tp, ep, extend);
  // an unknown ctrl/meta modified key is not text and not a command
  return null;
}

// The extended plain-key move (design D8): shift extends the head of the
// move, plain keys follow the membrane map through the buffer ops.
function extendedMove(c: TextareaCtx, key: unknown, mods: unknown): IntentList | null {
  const tp = c.props.textPath;
  const ep = c.props.extraPath;
  const extend = Array.isArray(mods) && (mods as readonly string[]).includes("shift");
  switch (key) {
    case "up":
      return single("previous-line", tp, ep, extend);
    case "down":
      return single("next-line", tp, ep, extend);
    case "left":
      return single("backward-char", tp, ep, extend);
    case "right":
      return single("forward-char", tp, ep, extend);
    case "home":
      return single("move-to-line-start", tp, ep, extend);
    case "end":
      return single("move-to-line-end", tp, ep, extend);
    default:
      return null;
  }
}

// A ctrl/cmd-modified key is not text (tambor-hyw): the named keys
// still apply, but the default insert branch drops modified keys so
// Ctrl+A/Z reach the component as distinct no-op key-presses instead of
// typing an a/z into the text.
function isModified(mods: unknown): boolean {
  return Array.isArray(mods)
    && (mods as readonly string[]).some((m) => m === "ctrl" || m === "meta");
}

// key_map: the named keys map to their effects; any other key falls
// through to the default text-insert branch (null).
function namedKeyEffect(key: unknown, tp: unknown, ep: unknown): IntentList | null {
  switch (key) {
    case "up":
      return [[ "previous-line", tp, ep ]];
    case "down":
      return [[ "next-line", tp, ep ]];
    case "left":
      return [[ "backward-char", tp, ep ]];
    case "right":
      return [[ "forward-char", tp, ep ]];
    case "enter":
      return [[ "insert-newline", tp, ep ]];
    case "backspace":
      return [[ "delete-backward", tp, ep ]];
    default:
      return null;
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
  if (c.profile === "extended") {
    return [single("insert-text", data, c.props.textPath, c.props.extraPath, c.props.now ?? Date.now())];
  }
  return [[ "insert-text", data, c.props.textPath, c.props.extraPath ]];
}

function clipboardCut(c: TextareaCtx): IntentList {
  const range = selectionRange(c.extra);
  if (!range) return [];
  const [start, end] = range;
  if (c.profile === "extended") {
    // the selection delete routes through the buffer (history +
    // grapheme handling); the clipboard effect carries the removed text
    // and the range for the app-level dispatcher
    return [
      single("delete-backward", c.props.textPath, c.props.extraPath),
      ["clipboard-cut", c.t.slice(start, end), [start, end]],
    ];
  }
  return [
    ["update", c.props.textPath, () => c.t.slice(0, start) + c.t.slice(end)],
    c.u("cursor", start),
    c.u("select-cursor", null),
    ["clipboard-cut", c.t.slice(start, end), [start, end]],
  ];
}
