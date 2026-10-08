// Purpose: the touch-to-pointer mapping of the corpus — touchstart,
//   touchmove and touchend become mouse-down, mouse-move and mouse-up
//   at the touch point, so every existing handler works unchanged.
// Responsibilities: mapTouchDown/Move/Up construct the mapped events,
//   and touchTap classifies a touch down/up pair (tap_vs_drag) and
//   emits the mapped mouse pair for a tap.
// Rationale: specs/ui-mobile.md touch_maps_to_pointer is the design
//   authority: the mapping reuses the event model's mouse kinds
//   verbatim. The mapped events keep pointerType "touch": the slop
//   router (ui.mobile.hit_slop) and the hover layer
//   (ui.mobile.hover_off_on_touch) must still see that the input came
//   from a touch, while handlers receive a normal pointer event. Tap
//   classification is the event model's own (tap_vs_drag: 10 px,
//   300 ms) — no second classifier is invented here.

import {
  classifyTap,
  mouseDown,
  mouseMove,
  mouseUp,
  type PointerMoment,
  type TamborEvent,
} from "../events/event.ts";
import type { Vec2 } from "../views/model.ts";

// touchstart maps to mouse-down at the touch point.
export function mapTouchDown(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return mouseDown(pos, { pointerType: "touch", ...extra });
}

// touchmove maps to mouse-move at the touch point.
export function mapTouchMove(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return mouseMove(pos, { pointerType: "touch", ...extra });
}

// touchend maps to mouse-up at the touch point.
export function mapTouchUp(pos: Vec2, extra: Partial<TamborEvent> = {}): TamborEvent {
  return mouseUp(pos, { pointerType: "touch", ...extra });
}

// A tap emits the mapped mouse-down then mouse-up; a drag emits no
// synthetic mouse events (tap_vs_drag).
export function touchTap(down: PointerMoment, up: PointerMoment): readonly TamborEvent[] {
  if (classifyTap(down, up) !== "tap") return [];
  return [mapTouchDown(up.pos), mapTouchUp(up.pos)];
}
