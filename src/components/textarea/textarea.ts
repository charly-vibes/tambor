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
// Rationale: openspec/specs/components-textarea/spec.md is the design authority.
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

import { onPairs, type Intent } from "../../events/bubble.ts";
import { bounds, label, rectangle, translate, withColor, withStyle, type Color, type Elem, type Vec2 } from "../../views/model.ts";
import type { Path } from "../../effects/paths.ts";
import type { TextareaExtra } from "./edit.ts";
import { onClipboard, onKeyPress, onMouseDown, onMouseMove, onMouseUp, selectionRange, type TextareaCtx } from "./handlers.ts";

// The variants of border_default: bordered is the default.
export type TextareaVariant = "bordered" | "light";

// border_default colors.
export const BORDER_COLOR: Color = [0.65, 0.65, 0.65];
export const LIGHT_FILL: Color = [0.97, 0.97, 0.97];

// selection_drawn: a selection draws a highlight over its range and a
// focused textarea draws a translucent gray cursor.
export const SELECTION_HIGHLIGHT: Color = [0.68, 0.85, 0.99, 0.5];
export const CURSOR_COLOR: Color = [0, 0, 0, 0.3];

// double_click_word thresholds and the double-click detector live in
// ./handlers.ts (exported from there since tambor-272).

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

// border_default: the bordered variant strokes the body's bounds with
// border padding; the light variant fills the bounds with no padding.
function textareaFrame(
  variant: TextareaVariant | undefined,
  body: Elem,
  bw: number,
  bh: number,
  padX: number,
  padY: number,
): Elem {
  return variant === "light"
    ? [withStyle("fill", withColor(LIGHT_FILL, rectangle(bw, bh))), body]
    : [withStyle("stroke", withColor(BORDER_COLOR, rectangle(bw + 10, bh + 4))), translate(padX, padY, body)];
}

// The textarea component: the framed, handler-wrapped view.
export function textarea(props: TextareaProps): Elem {
  const focused = isFocused(props.focus, props.textPath);
  const t = props.text ?? "";
  const padX = props.variant === "light" ? 0 : 5;
  const padY = props.variant === "light" ? 0 : 2;

  const body = textareaBody(props);
  const [bw, bh] = bounds(body);
  const frame = textareaFrame(props.variant, body, bw, bh, padX, padY);

  const c: TextareaCtx = {
    props,
    extra: props.state,
    t,
    focused,
    u: (key, value): Intent => [
      "update",
      [...props.extraPath, ["keypath", key]],
      () => value,
    ],
    toTextPos: (pos): Vec2 => [pos[0] - padX, pos[1] - padY],
    indexAt: (pos): number => props.indexForPosition(props.font, t, pos[0], pos[1]),
  };

  // onPairs over handler-only pairs returns a handler node — an Elem
  // (EventElem only widens when wrap/bubble pairs are used).
  return onPairs([
    ["mouse-down", (...args) => onMouseDown(c, args)],
    ["mouse-move", (...args) => onMouseMove(c, args)],
    ["mouse-up", (...args) => onMouseUp(c, args)],
    ["key-press", (key) => onKeyPress(c, key)],
    ["clipboard", (...args) => onClipboard(c, args)],
  ], frame) as Elem;
}
