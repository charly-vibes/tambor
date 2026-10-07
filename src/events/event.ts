// Purpose: tambor's event data model — the unified pointer shape, event
//   constructors, and tap classification.
// Responsibilities: the plain-data event record (TamborEvent), the
//   pointer normalizer that maps mouse, touch and pen input onto one
//   pointer shape, and the tap-vs-drag classifier with its synthetic
//   mouse-down/mouse-up emission.
// Rationale: specs/event-model.md is the design authority —
//   pointer_unified ("mouse, touch and pen input normalise to one
//   pointer shape with position, button, down flag, modifiers and
//   pointerType") and tap_vs_drag ("a pointer-up within 10 px and
//   300 ms of its pointer-down is a tap, which emits mouse-down then
//   mouse-up, and anything else is a drag"). Events are plain frozen
//   data (event_pure) and carry no behavior.

import type { Vec2 } from "../views/model.ts";

// The delivery-rule families of specs/event-model.md:
// - pointer kinds are first-match-wins (pointer_first_match)
// - concat kinds visit every child in order (key_concat)
// - mouse-move-global visits every descendant (global_move_all)
export type EventKind =
  | "mouse-down"
  | "mouse-up"
  | "mouse-move"
  | "mouse-move-global"
  | "mouse-enter-global"
  | "scroll"
  | "drop"
  | "key-press"
  | "key-event"
  | "clipboard";

export type Mods = readonly string[];
export type PointerType = "mouse" | "touch" | "pen";

// A plain-data input event. Only the fields relevant to its type are
// set; dispatch never mutates it (event_pure).
export interface TamborEvent {
  readonly type: EventKind;
  readonly pos?: Vec2;
  readonly button?: number;
  readonly down?: boolean;
  readonly mods?: Mods;
  readonly pointerType?: PointerType;
  readonly key?: string;
  readonly data?: string;
}

// The one pointer shape every device normalises onto
// (pointer_unified).
export interface Pointer {
  readonly pos: Vec2;
  readonly button: number;
  readonly down: boolean;
  readonly mods: Mods;
  readonly pointerType: PointerType;
}

// Raw device input before normalization: the device tag is the only
// field the three sources differ in.
export interface RawPointerInput {
  readonly source: PointerType;
  readonly pos: Vec2;
  readonly button: number;
  readonly down: boolean;
  readonly mods: Mods;
}

// Mouse, touch and pen input normalise to one pointer shape
// (pointer_unified). Membrane maps touch and pen onto the mouse
// protocol, so the canonical pointerType is "mouse" for every source.
export function normalizePointer(raw: RawPointerInput): Pointer {
  return deepFreeze({
    pos: raw.pos,
    button: raw.button,
    down: raw.down,
    mods: raw.mods,
    pointerType: "mouse" as const,
  });
}

// tap_vs_drag thresholds: a pointer-up within 10 px and 300 ms of its
// pointer-down is a tap.
export const TAP_SLOP_PX = 10;
export const TAP_TIMEOUT_MS = 300;

// One end of a pointer gesture: where it happened and when.
export interface PointerMoment {
  readonly pos: Vec2;
  readonly time: number;
}

// "A pointer-up within 10 px and 300 ms of its pointer-down is a tap
// ... and anything else is a drag" (tap_vs_drag).
export function classifyTap(down: PointerMoment, up: PointerMoment): "tap" | "drag" {
  const dx = up.pos[0] - down.pos[0];
  const dy = up.pos[1] - down.pos[1];
  const withinSlop = dx * dx + dy * dy <= TAP_SLOP_PX * TAP_SLOP_PX;
  return withinSlop && up.time - down.time <= TAP_TIMEOUT_MS ? "tap" : "drag";
}

// A tap emits mouse-down then mouse-up (tap_vs_drag); a drag emits no
// synthetic mouse events.
export function tapEvents(down: PointerMoment, up: PointerMoment): readonly TamborEvent[] {
  if (classifyTap(down, up) !== "tap") return [];
  return [pointerEvent("mouse-down", up.pos, true), pointerEvent("mouse-up", up.pos, false)];
}

// Event constructors — plain frozen data.

function pointerEvent(
  type: EventKind,
  pos: Vec2,
  down: boolean,
  extra: Partial<TamborEvent> = {},
): TamborEvent {
  return deepFreeze({
    type,
    pos,
    button: 0,
    down,
    mods: [] as Mods,
    pointerType: "mouse" as const,
    ...extra,
  });
}

export function mouseDown(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return pointerEvent("mouse-down", pos, true, extra);
}

export function mouseUp(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return pointerEvent("mouse-up", pos, false, extra);
}

export function mouseMove(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return pointerEvent("mouse-move", pos, false, extra);
}

export function mouseMoveGlobal(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return deepFreeze({ ...pointerEvent("mouse-move", pos, false, extra), type: "mouse-move-global" });
}

export function mouseEnterGlobal(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return deepFreeze({
    ...pointerEvent("mouse-move", pos, false, extra),
    type: "mouse-enter-global",
  });
}

export function scroll(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return pointerEvent("scroll", pos, false, extra);
}

export function drop(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return pointerEvent("drop", pos, false, extra);
}

export function keyPress(key: string, extra: Partial<TamborEvent> = {}): TamborEvent {
  return deepFreeze({ type: "key-press", key, ...extra });
}

export function keyEvent(key: string, extra: Partial<TamborEvent> = {}): TamborEvent {
  return deepFreeze({ type: "key-event", key, ...extra });
}

export function clipboard(data: string, extra: Partial<TamborEvent> = {}): TamborEvent {
  return deepFreeze({ type: "clipboard", data, ...extra });
}

// Recursively freeze a constructed event value (event_pure: dispatch
// never mutates events either).
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
