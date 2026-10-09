// Purpose: the input normalisation the backends share — keyboard key
//   normalisation and raw DOM event to TamborEvent conversion.
// Responsibilities: normalizeKey (printable keys become one-character
//   strings, Enter/Backspace/arrows become the named keys, modifiers
//   alone produce nothing) and normalizeDOMEvent (pointer events
//   become mouse events at the position minus the canvas origin, key
//   events forward their normalised key, paste becomes a clipboard
//   event carrying the string).
// Rationale: openspec/specs/backend-render/spec.md is the design authority —
//   key_normalisation ("printable keys become one-character strings
//   and Enter, Backspace and the four arrows become the named keys
//   enter, backspace, up, down, left and right, and modifier keys
//   alone produce nothing") and input_forwarded ("raw pointer, wheel,
//   key and clipboard events are normalised and forwarded with
//   coordinates in view space"). The event shapes are
//   src/events/event.ts's (pointer_unified); the position here is
//   view space: the device position minus the canvas bounding-rect
//   origin. No behavior beyond the corpus.

import type { TamborEvent } from "../events/event.ts";
import type { Vec2 } from "../views/model.ts";
import type { SimEvent } from "./domsim.ts";

// The modifier keys: pressed alone they produce nothing
// (key_normalisation).
const MODIFIER_KEYS: readonly string[] = ["Shift", "Control", "Alt", "Meta", "CapsLock"];

// The key a raw KeyboardEvent.key forwards as, or null when the key
// produces no event (key_normalisation).
export function normalizeKey(key: string): string | null {
  switch (key) {
    case "Enter":
      return "enter";
    case "Backspace":
      return "backspace";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      break;
  }
  if (MODIFIER_KEYS.includes(key)) return null;
  // printable keys become one-character strings
  if (key.length === 1) return key;
  return null;
}

// A raw DOM event after view-space translation, or null when it
// produces no event (a modifier key, an unhandled type).
export function normalizeDOMEvent(raw: SimEvent, origin: Vec2): TamborEvent | null {
  switch (raw.type) {
    case "pointerdown":
    case "pointermove":
    case "pointerup": {
      const pos: Vec2 = [
        (raw.clientX ?? 0) - origin[0],
        (raw.clientY ?? 0) - origin[1],
      ];
      const type =
        raw.type === "pointerdown" ? "mouse-down" : raw.type === "pointerup" ? "mouse-up" : "mouse-move";
      return deepFreeze({ type, pos, button: 0, down: raw.type === "pointerdown" });
    }
    case "keydown": {
      const key = raw.key === undefined ? null : normalizeKey(raw.key);
      if (key === null) return null;
      return deepFreeze({ type: "key-press", key });
    }
    case "paste":
      return deepFreeze({ type: "clipboard", data: raw.text ?? "" });
    default:
      return null;
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
