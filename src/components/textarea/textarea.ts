// Purpose: the textarea component — the basic_components.cljc port of
//   `textarea` (and its `textarea-light` variant).
// Responsibilities: the component view (bordered by default with
//   padding 5 on x and 2 on y and a 0.65 gray stroke; the light variant
//   has no border and a 0.97 gray fill; a selection draws a highlight
//   over its range; a focused textarea draws a translucent gray
//   cursor), and the event handlers that return the editing intents:
//   a pointer down inside yields request-focus followed by the cursor
//   effects (pointer_down_cursor), a pointer move with down-pos set
//   stores mpos (drag_tracks), key-press maps the named keys and
//   inserts any string while focused (key_map), and clipboard events
//   copy, cut and paste while focused (clipboard rules).
// Rationale: specs/components-textarea.md is the design authority.
//   Focus is a path: the textarea is focused exactly when the context
//   focus deep-equals its text path (focus_by_path). Editing state is
//   split: text and focus are app state; cursor, select-cursor,
//   down-pos, mpos and last-click live in the textarea-state extra map
//   (text_state_split), so the handlers close over the current extra
//   map at render time and every edit they return is a data intent —
//   raw updates against the extra paths, or named editing effects that
//   carry their text and extra paths, all applied by
//   applyTextareaIntents. indexForPosition is a backend service
//   (backend.render.backend_contract) injected through the props; the
//   `now` prop is the clock for the double-click detector
//   (double_click_word). Clipboard encoding: a clipboard event whose
//   data is "copy"/"cut" triggers the copy/cut op; any other data
//   string is a paste carrying its string (interim convention flagged
//   to the corpus owner).

import { onPairs, type Intent, type IntentList } from "../../events/bubble.ts";
import { bounds, label, rectangle, translate, withColor, withStyle, type Color, type Elem, type Vec2 } from "../../views/model.ts";
import type { Path } from "../../effects/paths.ts";
import type { TextareaExtra } from "./edit.ts";

// The variants of border_default: bordered is the default.
export type TextareaVariant = "bordered" | "light";

// border_default colors.
export const BORDER_COLOR: Color = [0.65, 0.65, 0.65];
export const LIGHT_FILL: Color = [0.97, 0.97, 0.97];

// selection_drawn: a selection draws a highlight over its range and a
// focused textarea draws a translucent gray cursor.
export const SELECTION_HIGHLIGHT: Color = [0.68, 0.85, 0.99, 0.5];
export const CURSOR_COLOR: Color = [0, 0, 0, 0.3];

// double_click_word thresholds: a second click within 500 ms and with
// squared distance under 100 from the last click is a double click.
export const DOUBLE_CLICK_MS = 500;
export const DOUBLE_CLICK_DIST2 = 100;

export interface TextareaProps {
  /** the text being edited; nil before the first insert */
  readonly text: string | null;
  /** $text — the text's path in app state */
  readonly textPath: Path;
  /** the path of the textarea-state extra map */
  readonly extraPath: Path;
  /** the contextual focus value */
  readonly focus: unknown;
  /** the current textarea-state extra map */
  readonly state: TextareaExtra;
  /** opaque font handle for indexForPosition */
  readonly font: unknown;
  /** the backend service that turns a position into a character index */
  readonly indexForPosition: (
    font: unknown,
    text: string,
    x: number,
    y: number,
  ) => number;
  /** the variant; bordered is the default (border_default) */
  readonly variant?: TextareaVariant;
  /** the clock for the double-click detector; defaults to Date.now() */
  readonly now?: number;
}

// Deep equality for path values (focus_by_path: context focus
// deep-equals the text path).
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  return false;
}

// focus_by_path: a textarea is focused exactly when the context focus
// deep-equals its text path.
export function isFocused(focus: unknown, textPath: Path): boolean {
  return deepEqual(focus, textPath);
}

// A selection exists when select-cursor is set and differs from the
// cursor; its range runs from the smaller to the larger index.
export function selectionRange(extra: TextareaExtra): readonly [number, number] | null {
  const sc = extra["select-cursor"];
  if (sc === null || sc === extra.cursor) return null;
  return [Math.min(sc, extra.cursor), Math.max(sc, extra.cursor)];
}

// The drawn content: highlight (when a selection is present), the text
// label, and the cursor (when focused). Geometry uses the default
// one-cell-per-character measure, so glyph positions are character
// indices; multiline layout is the backend's drawing concern.
export function textareaBody(props: TextareaProps): Elem {
  const t = props.text ?? "";
  const extra = props.state;
  const focused = isFocused(props.focus, props.textPath);
  const nodes: Elem[] = [];
  const range = selectionRange(extra);
  if (range) {
    const [start, end] = range;
    nodes.push(translate(start, 0, withColor(SELECTION_HIGHLIGHT, rectangle(end - start, 1))));
  }
  nodes.push(label(t));
  if (focused) {
    nodes.push(translate(extra.cursor, 0, withColor(CURSOR_COLOR, rectangle(1, 1))));
  }
  return nodes;
}

// The textarea component: the framed, handler-wrapped view.
export function textarea(props: TextareaProps): Elem {
  const focused = isFocused(props.focus, props.textPath);
  const extra = props.state;
  const t = props.text ?? "";
  const padX = props.variant === "light" ? 0 : 5;
  const padY = props.variant === "light" ? 0 : 2;

  const body = textareaBody(props);
  const [bw, bh] = bounds(body);
  const frame: Elem =
    props.variant === "light"
      ? [
          withStyle("fill", withColor(LIGHT_FILL, rectangle(bw, bh))),
          body,
        ]
      : [
          withStyle("stroke", withColor(BORDER_COLOR, rectangle(bw + 10, bh + 4))),
          translate(padX, padY, body),
        ];

  // an update intent against one key of the extra map
  const u = (key: string, value: unknown): Intent => [
    "update",
    [...props.extraPath, ["keypath", key]],
    () => value,
  ];
  const toTextPos = (pos: Vec2): Vec2 => [pos[0] - padX, pos[1] - padY];
  const indexAt = (pos: Vec2): number =>
    props.indexForPosition(props.font, t, pos[0], pos[1]);

  // request_focus_on_hit: a pointer down inside that yields intents
  // returns request-focus followed by those intents; one that yields
  // none returns nothing. pointer_down_cursor: the cursor moves to
  // indexForPosition at the position, mpos and down-pos store the
  // position, and the selection is cleared.
  const onMouseDown = (pos: Vec2): IntentList => {
    const local = toTextPos(pos);
    const idx = indexAt(local);
    return [
      ["request-focus", props.textPath],
      u("cursor", idx),
      u("mpos", local),
      u("down-pos", local),
      u("select-cursor", null),
    ];
  };

  // drag_tracks: a pointer move while down-pos is set stores mpos;
  // with no down-pos it returns nothing.
  const onMouseMove = (pos: Vec2): IntentList => {
    if (extra["down-pos"] === null) return [];
    return [u("mpos", toTextPos(pos))];
  };

  // finish_drag_rule: on pointer up the end index is indexForPosition
  // at the position; the selection start is the index at down-pos when
  // it differs from the end index, plus one when it lies after the end
  // index; down-pos is cleared.
  const onMouseUp = (pos: Vec2): IntentList => {
    const down = extra["down-pos"];
    if (down === null) return [];
    const local = toTextPos(pos);
    const end = indexAt(local);
    const start = indexAt(down);
    const out: Intent[] = [];
    if (start !== end) {
      out.push(u("cursor", start > end ? start + 1 : start), u("select-cursor", end));
    }
    out.push(u("down-pos", null));
    return out;
  };

  // keys_need_focus: an unfocused textarea returns no effects for
  // key-press or clipboard events. key_map: the named keys map to
  // their effects, any string inserts text, any other key is ignored.
  const onKeyPress = (key: unknown): IntentList => {
    if (!focused) return [];
    const tp = props.textPath;
    const ep = props.extraPath;
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
  };

  // clipboard_copy_rule / clipboard_cut_rule / clipboard_paste_rule:
  // all clipboard ops need focus; copy returns the clipboard-copy
  // effect with the selected text range, cut edits the text and
  // returns clipboard-cut with the range, paste returns insert-text
  // with the pasted string.
  const onClipboard = (data: string): IntentList => {
    if (!focused) return [];
    if (data === "copy") {
      const range = selectionRange(extra);
      return range ? [["clipboard-copy", t.slice(range[0], range[1])]] : [];
    }
    if (data === "cut") {
      const range = selectionRange(extra);
      if (!range) return [];
      const [start, end] = range;
      return [
        ["update", props.textPath, () => t.slice(0, start) + t.slice(end)],
        u("cursor", start),
        u("select-cursor", null),
        ["clipboard-cut", t.slice(start, end), range],
      ];
    }
    // paste: the data is the pasted string
    return [["insert-text", data, props.textPath, props.extraPath]];
  };

  return onPairs([
    ["mouse-down", onMouseDown],
    ["mouse-move", onMouseMove],
    ["mouse-up", onMouseUp],
    ["key-press", onKeyPress],
    ["clipboard", onClipboard],
  ], frame);
}
