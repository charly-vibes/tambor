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
// Rationale: specs/components-textarea.md is the design authority —
//   editing state is split (text and focus in app state, cursor,
//   select-cursor, down-pos, mpos and last-click in the textarea-state
//   extra map), editing effects carry their text and extra paths as
//   data so they remain replaceable intents, and every editing op keeps
//   0 <= cursor <= len(text) (cursor_clamped).

import { updatePath, type Path } from "../../effects/paths.ts";
import type { Intent, IntentList } from "../../events/bubble.ts";

// One end of the pointer gesture state, in view coordinates.
export type Vec2 = readonly [number, number];

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

// External intents: returned to the caller untouched. request-focus is
// applied by the top-level handler (app.toplevel), the clipboard
// effects by the effect dispatcher's backend service.
const EXTERNAL_TYPES: ReadonlySet<string> = new Set([
  "request-focus",
  "clipboard-copy",
  "clipboard-cut",
]);

// Apply the textarea's intents against the state, in order. Editing
// effects read and write through their carried paths; the external
// intents pass through unchanged.
export function applyTextareaIntents<S>(
  state: S,
  intents: IntentList,
): { state: S; external: IntentList } {
  let out = state;
  const external: Intent[] = [];
  for (const intent of intents) {
    const type = intent[0] as string;
    const rest = intent.slice(1) as readonly unknown[];
    switch (type) {
      case "update":
        out = updatePath(out, rest[0] as Path, rest[1] as (old: unknown) => unknown);
        break;
      case "request-focus":
      case "clipboard-copy":
      case "clipboard-cut":
        external.push(intent);
        break;
      default:
        // an intent this interpreter does not know is not ours to
        // apply — pass it through for the app-level dispatcher
        external.push(intent);
        break;
    }
  }
  return { state: out, external };
}
