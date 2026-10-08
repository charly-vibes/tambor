// Purpose: the scrollview component — a clipped, scrollable content
//   container scrolled by wheel, touch drag and scrollbar drags
//   (components.scrollview).
// Responsibilities: the scrollview component with props offset
//   (default [0, 0]), scroll-bounds ([w, h]) and body; the view
//   assembly — the body drawn translated by [-ox, -oy] with the clip
//   gating pointer events to the viewport region, and the conditional
//   scrollbars; the wheel update logic, the touch drag scroll function
//   and the momentum frames as pure functions of their inputs.
// Rationale: specs/components-scrollview.md is the design authority.
//   The stored offset is never clamped at render — a stale offset after
//   a resize renders as-is and snaps back at the next scroll update
//   (stale_offset_snaps) — and the wheel update reads the stored offset
//   through the update effect, so the snap is a clamp against the
//   stored value (wheel_updates_offset, range_formula).
//
//   Corpus gap, reported to the orchestrator rather than improvised:
//   the landed event model's scroll event carries a position but no
//   wheel delta and no pointer type (specs/event-model.md defines no
//   delta field, and handlers receive only the position), so nothing in
//   the corpus says how a wheel delta or a one-finger gesture reaches
//   the scrollview through dispatch. wheelIntents, dragScrollf and
//   momentumFrames therefore take their inputs as plain data — exactly
//   the spec rows' generators — and the event-side plumbing (delta and
//   pointerType transport) is the backend-render / app-toplevel
//   integration's to define. The scrollbar drags are wired through the
//   start-scroll intent that app.toplevel handles.

import {
  bounds,
  translate,
  type Elem,
  type Vec2,
} from "../../views/model.ts";
import {
  wrapOn,
  type EventElem,
  type IntentList,
  type WrapHandler,
} from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import {
  defineComponent,
  type Component,
  type Props,
} from "../../model/component.ts";
import { clampScalar, scrollMax } from "./geometry.ts";
import { horizontalScrollbar, verticalScrollbar } from "./scrollbar.ts";

// The update both the wheel and the drag share: it reads the stored
// offset and adds the delta within the range, so a stale stored value
// snaps back (stale_offset_snaps).
function clampedStep(
  max: Vec2,
  delta: Vec2,
): (old: unknown) => Vec2 {
  return (old) => {
    const o = old as Vec2;
    return [
      clampScalar(o[0] + delta[0], max[0]),
      clampScalar(o[1] + delta[1], max[1]),
    ];
  };
}

// Wheel scrolling: when the clamped new offset differs from the current
// one on either axis, an update is returned setting both axes to
// clamp(old + delta); when both are unchanged, nothing is returned
// (wheel_updates_offset).
export function wheelIntents(
  offset: Vec2,
  delta: Vec2,
  total: Vec2,
  viewport: Vec2,
  $offset: Path,
): IntentList {
  const max = scrollMax(total, viewport);
  const changed =
    clampScalar(offset[0] + delta[0], max[0]) !== offset[0] ||
    clampScalar(offset[1] + delta[1], max[1]) !== offset[1];
  if (!changed) return [];
  return [["update", $offset, clampedStep(max, delta)]];
}

// Touch dragging: a one-finger drag over content that has no handler
// for the gesture scrolls by the drag delta, clamped to the range
// (touch_drag_scrolls). Like the wheel update, the update reads the
// stored offset so a stale value snaps back.
export function dragScrollf(
  offset: Vec2,
  total: Vec2,
  viewport: Vec2,
  $offset: Path,
): (delta: Vec2) => IntentList {
  const max = scrollMax(total, viewport);
  return (delta) => [["update", $offset, clampedStep(max, delta)]];
}

// Momentum: a flick continues with decaying velocity and stops at the
// range ends; disabled under reduced motion (momentum, advisory). The
// frames are the offsets of successive animation ticks; the velocity
// decays geometrically and an axis stops when its velocity dies out or
// its offset is pinned at a range end by the clamped step.
export const MOMENTUM_DECAY = 0.95;
const MOMENTUM_EPSILON = 0.1;
const MOMENTUM_MAX_FRAMES = 600;

export function momentumFrames(
  start: Vec2,
  velocity: Vec2,
  total: Vec2,
  viewport: Vec2,
  reducedMotion: boolean,
): readonly Vec2[] {
  if (reducedMotion) return [];
  const max = scrollMax(total, viewport);
  let o = start;
  let v = velocity;
  const frames: Vec2[] = [];
  for (let i = 0; i < MOMENTUM_MAX_FRAMES; i++) {
    if (!axisMoving(o, v, max, 0) && !axisMoving(o, v, max, 1)) break;
    o = [
      clampScalar(o[0] + v[0], max[0]),
      clampScalar(o[1] + v[1], max[1]),
    ];
    frames.push(o);
    v = [v[0] * MOMENTUM_DECAY, v[1] * MOMENTUM_DECAY];
  }
  return frames;
}

// An axis is still moving while its velocity lives and its clamped step
// would actually move the offset; a velocity pushing outward from a
// range end is already stopped there ("stops at the range ends").
function axisMoving(o: Vec2, v: Vec2, max: Vec2, axis: 0 | 1): boolean {
  const vel = v[axis];
  if (Math.abs(vel) < MOMENTUM_EPSILON) return false;
  return clampScalar(o[axis] + vel, max[axis]) !== o[axis];
}

// The pointer kinds the clip gates: content outside the viewport
// receives no pointer events (clip_events), hit-tested half-open like
// the event model (hit_half_open).
const CLIP_KINDS: readonly string[] = [
  "mouse-down",
  "mouse-up",
  "mouse-move",
  "scroll",
  "drop",
];

function clipGate(viewport: Vec2): WrapHandler {
  return (defaultHandler, pos) => {
    const p = (pos ?? [0, 0]) as Vec2;
    if (p[0] < 0 || p[0] >= viewport[0] || p[1] < 0 || p[1] >= viewport[1]) {
      return [];
    }
    return defaultHandler();
  };
}

// The scrollview's view: the body translated by the negated offset
// under the clip gates, plus the conditional scrollbars. The stored
// offset is used as-is (stale_offset_snaps: no clamp at render).
export function scrollviewView(props: Props): readonly EventElem[] {
  const offset = (props["offset"] as Vec2 | undefined) ?? [0, 0];
  const viewport = props["scroll-bounds"] as Vec2;
  const body = props["body"] as Elem;
  const $offset = props["$offset"] as Path;
  const total = bounds(body);

  const gated = wrapOn(
    CLIP_KINDS.map(
      (kind) => [kind, clipGate(viewport)] as const,
    ),
    translate(-offset[0], -offset[1], body),
  );
  const bars: EventElem[] = [];
  if (total[1] > viewport[1]) {
    bars.push(verticalScrollbar({ offset, total, viewport, $offset }));
  }
  if (total[0] > viewport[0]) {
    bars.push(horizontalScrollbar({ offset, total, viewport, $offset }));
  }
  return [gated, ...bars];
}

// The scrollview component: offset defaults to [0, 0] (default_offset).
export const scrollview: Component = defineComponent(
  "scrollview",
  [{ keys: ["offset", "scroll-bounds", "body"], defaults: { offset: [0, 0] } }],
  (props) => scrollviewView(props),
);
