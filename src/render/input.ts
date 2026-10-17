// Purpose: the input normalisation the backends share — keyboard key
//   normalisation and raw DOM event to TamborEvent conversion.
// Responsibilities: normalizeKey (printable keys become one-character
//   strings, Enter/Backspace/arrows become the named keys, modifiers
//   alone produce nothing) and normalizeDOMEvent (pointer events
//   become mouse events at the position minus the canvas origin with
//   the pressed modifiers and button-down state threaded on, key
//   events forward their normalised key with the mods — ctrl/cmd+c/x
//   become the clipboard copy/cut sentinels and multi-char IME keys
//   become paste-like clipboard insertions — paste becomes a clipboard
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

import type { Mods, TamborEvent } from "../events/event.ts";
import type { Vec2 } from "../views/model.ts";
import type { SimEvent } from "./domsim.ts";

// The modifier keys: pressed alone they produce nothing
// (key_normalisation). Exported so the SPA's key guard can exclude
// them from the multi-char text path too (tambor-hyw).
export const MODIFIER_KEYS: readonly string[] = ["Shift", "Control", "Alt", "Meta", "CapsLock"];

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

// The modifier names a raw event's pressed flags map onto (tambor-hyw):
// ctrl/cmd/shift/alt ride along on the corpus event's mods field, so
// Ctrl+C reaches components as a distinct event, not a plain c.
function modsOf(raw: SimEvent): Mods {
  const mods: string[] = [];
  if (raw.ctrlKey) mods.push("ctrl");
  if (raw.metaKey) mods.push("meta");
  if (raw.shiftKey) mods.push("shift");
  if (raw.altKey) mods.push("alt");
  return mods;
}

// Keys that report no usable key (Android/IME artifacts) — dropped,
// the committed text arrives via the composition path instead.
const DROP_KEYS: readonly string[] = ["Unidentified", "Process", "Dead"];

// A raw DOM event after view-space translation, or null when it
// produces no event (a modifier key, an unhandled type, a ctrl/cmd+v
// keydown — the native paste event follows it).
export function normalizeDOMEvent(raw: SimEvent, origin: Vec2): TamborEvent | null {
  switch (raw.type) {
    case "pointerdown":
    case "pointermove":
    case "pointerup":
      return normalizePointer(raw, origin);
    case "keydown":
      return normalizeKeydown(raw);
    case "paste":
      return deepFreeze({ type: "clipboard", data: raw.text ?? "", mods: modsOf(raw) });
    default:
      return null;
  }
}

// Pointer events become mouse events at the position minus the canvas
// origin (input_forwarded).
function normalizePointer(raw: SimEvent, origin: Vec2): TamborEvent {
  const pos: Vec2 = [
    (raw.clientX ?? 0) - origin[0],
    (raw.clientY ?? 0) - origin[1],
  ];
  const type =
    raw.type === "pointerdown" ? "mouse-down" : raw.type === "pointerup" ? "mouse-up" : "mouse-move";
  // the button-down state rides on pointermove too (tambor-hyw):
  // the router can distinguish a drag (buttons held) from a hover
  const down =
    raw.type === "pointerdown" ? true : raw.type === "pointerup" ? false : (raw.buttons ?? 0) > 0;
  return deepFreeze({ type, pos, button: 0, down, mods: modsOf(raw) });
}

// Keydown forwarding: clipboard shortcuts first (tambor-hyw), then the
// normalised key, then multi-char IME composition text.
function normalizeKeydown(raw: SimEvent): TamborEvent | null {
  const mods = modsOf(raw);
  const key = raw.key === undefined ? null : normalizeKey(raw.key);
  // ctrl/cmd+c/x are the clipboard ops in the corpus shape the
  // textarea's clipboard rules already speak (copy/cut sentinels):
  // the SPA surface translates them instead of typing c/x into
  // text. ctrl/cmd+v produces nothing here — the native paste
  // event carrying the clipboard data follows it.
  if (mods.includes("ctrl") || mods.includes("meta")) {
    const shortcut = clipboardShortcut(key, mods);
    if (shortcut !== undefined) return shortcut;
  }
  if (key !== null) return deepFreeze({ type: "key-press", key, mods });
  // Multi-char keys (IME composition output) are text, not key
  // names: they route as paste-like insertion (tambor-hyw).
  // Named control keys were already handled above; what is left
  // over at length > 1 is composed text or a dead-key artifact.
  return composedText(raw.key, mods);
}

// The clipboard event a ctrl/cmd-modified key forwards (copy/cut/v
// produce nothing), or undefined when the key is not a clipboard
// shortcut and forwarding continues down the normal path.
function clipboardShortcut(key: string | null, mods: Mods): TamborEvent | null | undefined {
  if (key === "c") return deepFreeze({ type: "clipboard", data: "copy", mods });
  if (key === "x") return deepFreeze({ type: "clipboard", data: "cut", mods });
  if (key === "v") return null;
  return undefined;
}

// A multi-char key becomes a paste-like clipboard insertion; a
// modifier or dropped key (Android/IME artifact) produces nothing.
function composedText(rawKey: unknown, mods: Mods): TamborEvent | null {
  if (
    typeof rawKey === "string" && rawKey.length > 1
    && !DROP_KEYS.includes(rawKey) && !MODIFIER_KEYS.includes(rawKey)
  ) {
    return deepFreeze({ type: "clipboard", data: rawKey, mods });
  }
  return null;
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
