// Purpose: the soft-keyboard bridge of the corpus — focusing a textarea
//   focuses a hidden input so the OS keyboard opens, and the hidden
//   input's events become key-press events the existing handlers
//   already understand.
// Responsibilities: bridgeEvents maps soft-input events (text input,
//   hardware key-downs of the mobile keyboard, composition end) onto
//   key-press events; makeKeyboardBridge tracks which textarea holds
//   focus so the host can focus or blur the hidden input with it.
// Rationale: openspec/specs/ui-mobile/spec.md soft_keyboard_bridge is the design
//   authority. The key-press names are the textarea key map's own
//   (components.textarea.key_map: up, down, left, right, enter,
//   backspace, any string inserts text), so every existing handler
//   works unchanged; the DOM key names of the mobile keyboard map onto
//   them. Composition is applied as one insert at the end, which is
//   exactly the ime_compose advisory of components.textarea. The hidden
//   input mirrors the textarea's focus (focus_by_path: focus is the
//   text path). No behavior beyond the corpus.

import { keyPress, type TamborEvent } from "../events/event.ts";

// One soft-input event of the hidden input. A hardware key-down carries
// the modifier flags the hardware reported; the bridge rides them along
// on the key-press event so the extended profile's command layer sees
// them.
export type SoftInput =
  | { readonly kind: "input"; readonly data: string }
  | { readonly kind: "keydown"; readonly key: string; readonly mods?: readonly string[] }
  | { readonly kind: "composition-end"; readonly data: string };

// The DOM key names of the mobile keyboard that map onto named keys of
// the textarea key map; anything else keeps the name the hardware
// reported (a named key is never case-folded — a name is a name, not
// text).
const DOM_KEYS: ReadonlyMap<string, string> = new Map([
  ["Backspace", "backspace"],
  ["Enter", "enter"],
  ["ArrowUp", "up"],
  ["ArrowDown", "down"],
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
  ["Home", "home"],
  ["End", "end"],
  ["Delete", "delete"],
]);

// Soft-input events become key-press events (soft_keyboard_bridge).
export function bridgeEvents(input: SoftInput): readonly TamborEvent[] {
  switch (input.kind) {
    case "input":
      return [keyPress(input.data)];
    case "composition-end":
      // one insert at the end of composition (ime_compose)
      return [keyPress(input.data)];
    case "keydown": {
      const name = DOM_KEYS.get(input.key) ?? input.key;
      const mods = input.mods ?? [];
      return [keyPress(name, mods.length > 0 ? { mods } : {})];
    }
  }
}

// The hidden-input mirror of the textarea focus: while a textarea path
// holds focus the hidden input is focused so the OS keyboard opens.
export interface KeyboardBridge {
  /** the host focuses the hidden input when a path is set */
  focus(path: unknown): void;
  /** whether the hidden input should currently be focused */
  hiddenFocused(): boolean;
}

export function makeKeyboardBridge(): KeyboardBridge {
  let focused: unknown = null;
  return {
    focus(path: unknown): void {
      focused = path;
    },
    hiddenFocused: () => focused !== null,
  };
}
