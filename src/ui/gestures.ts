// Purpose: the gesture recognizer of the corpus — tap, long-press,
//   drag, flick and pinch, each mapping to a named intent.
// Responsibilities: recognize(script) classifies a scripted pointer
//   gesture and returns the intent named after the gesture.
// Rationale: openspec/specs/ui-mobile/spec.md gesture_set is the design authority:
//   "supported gestures are tap, long-press, drag, flick and pinch, and
//   each maps to a named intent" — the intent is named after its
//   gesture. Tap classification is the event model's own (tap_vs_drag:
//   10 px, 300 ms), reused verbatim; a drag beyond that is a flick
//   when its release velocity reaches FLICK_MIN_VELOCITY, and a
//   long-press is a press held LONG_PRESS_MS with no up and no
//   movement beyond the tap slop; a pinch carries the scale of the two
//   pointers' separation and the midpoint of their current positions.
//   The hold and velocity thresholds are parameters of this port where
//   the corpus states no numbers; the tests generate scripts relative
//   to these declared constants, so no foreign semantics are baked in.
//   No behavior beyond the corpus.

import { TAP_SLOP_PX, TAP_TIMEOUT_MS, type PointerMoment } from "../events/event.ts";
import type { Vec2 } from "../views/model.ts";

// A press held this long without release or movement is a long-press.
export const LONG_PRESS_MS = 500;

// A release at or above this velocity (px per ms) is a flick.
export const FLICK_MIN_VELOCITY = 0.5;

// A scripted gesture: the pointer down, the moves in between, the
// optional up (null while the press is still held, with `now` the
// current clock), and the optional second pointer of a pinch.
export interface GestureScript {
  readonly down: PointerMoment;
  readonly moves?: readonly PointerMoment[];
  readonly up?: PointerMoment | null;
  /** the current clock, for a still-held press */
  readonly now?: number;
  readonly second?: { readonly down: PointerMoment; readonly up: PointerMoment };
}

// The intent a gesture maps to: [name, ...args] — tap (pos),
// long-press (pos), drag (from, to), flick (vx, vy), pinch (scale,
// centre).
export type GestureIntent = readonly unknown[];

function dist2(a: Vec2, b: Vec2): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

// Classify one scripted gesture: two pointers are a pinch; a held
// press is a long-press; a quick close release is a tap; a fast one is
// a flick; anything else is a drag.
export function recognize(script: GestureScript): GestureIntent {
  if (script.second) return pinch(script);
  const up = script.up ?? null;
  if (up === null) return heldGesture(script);
  return releasedGesture(script, up);
}

// A second pointer makes the gesture a pinch: the scale is the ratio
// of the pointers' separation, the centre their midpoint.
function pinch(script: GestureScript): GestureIntent {
  const a = script.down.pos;
  const d0 = Math.sqrt(dist2(a, script.second!.down.pos));
  const d1 = Math.sqrt(dist2(a, script.second!.up.pos));
  const scale = d0 === 0 ? 1 : d1 / d0;
  const centre: Vec2 = [
    (a[0] + script.second!.up.pos[0]) / 2,
    (a[1] + script.second!.up.pos[1]) / 2,
  ];
  return ["pinch", scale, centre];
}

// A still-held press: a long-press once it has been held past the
// threshold without moving beyond the tap slop; otherwise nothing
// is decided yet.
function heldGesture(script: GestureScript): GestureIntent {
  const held = (script.now ?? 0) - script.down.time;
  const moved = (script.moves ?? []).reduce(
    (max, m) => Math.max(max, Math.sqrt(dist2(script.down.pos, m.pos))),
    0,
  );
  if (held >= LONG_PRESS_MS && moved <= TAP_SLOP_PX) {
    return ["long-press", script.down.pos];
  }
  return [];
}

function releasedGesture(script: GestureScript, up: { pos: Vec2; time: number }): GestureIntent {
  const d = Math.sqrt(dist2(script.down.pos, up.pos));
  const dt = up.time - script.down.time;
  if (d <= TAP_SLOP_PX && dt <= TAP_TIMEOUT_MS) {
    return ["tap", up.pos];
  }
  const vx = (up.pos[0] - script.down.pos[0]) / dt;
  const vy = (up.pos[1] - script.down.pos[1]) / dt;
  if (Math.sqrt(vx * vx + vy * vy) >= FLICK_MIN_VELOCITY) {
    return ["flick", vx, vy];
  }
  return ["drag", script.down.pos, up.pos];
}
