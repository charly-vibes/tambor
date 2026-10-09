// Purpose: the number-slider component of components.numeric — the
//   draggable track that maps the x position onto [min, max].
// Responsibilities: the slider declares num, min, max, integer?, mdown?
//   and max-width (defaulting to 100, slider_max_width_default); the
//   value is min + (x / maxWidth) * (max - min), truncated toward zero
//   when integer? is true, then clamped to [min, max]
//   (slider_mapping); the track is the full max-width and the filled
//   width is maxWidth * (num - min) / (max - min) (slider_fill); the
//   label shows num itself when integer? and num with two decimals
//   otherwise (slider_label); pointer down sets mdown? true and
//   updates, pointer move updates only while mdown? is true, and
//   pointer up sets mdown? false and updates (slider_gesture); on
//   touch the slider keeps receiving moves after the finger leaves its
//   bounds until release (slider_pointer_capture).
// Rationale: openspec/specs/components-numeric/spec.md is the design authority —
//   never improvise semantics beyond its constraint rows. The move
//   handler listens on mouse-move-global and is rendered only while
//   mdown? is true: the render-time read of the gesture state gates
//   the moves (slider_gesture, with the repaint loop re-arming it once
//   the down effect lands), and the global kind is delivered regardless
//   of bounds, which is exactly the touch capture the advisory row
//   names (slider_pointer_capture). The corpus does not name a track
//   height; the constant here is presentation-only and no contract
//   reads it.

import type { IntentList } from "../../events/bubble.ts";
import { onPairs } from "../../events/bubble.ts";
import { defineComponent, type Props } from "../../model/component.ts";
import type { Path } from "../../effects/paths.ts";
import { verticalLayout } from "../../views/layout.ts";
import {
  label as labelNode,
  rectangle,
  type Elem,
  type Handler,
  type Vec2,
} from "../../views/model.ts";

// The default mapping width (slider_max_width_default).
export const DEFAULT_MAX_WIDTH = 100;

// Track height — presentation-only, the corpus does not name it.
export const TRACK_HEIGHT = 10;

// The mapping (slider_mapping): min + (x / maxWidth) * (max - min),
// truncated toward zero when integer? is true, then clamped to
// [min, max].
export function mapValue(
  x: number,
  min: number,
  max: number,
  maxWidth: number = DEFAULT_MAX_WIDTH,
  integer = false,
): number {
  const raw = min + (x / maxWidth) * (max - min);
  const truncated = integer ? Math.trunc(raw) : raw;
  return Math.min(max, Math.max(min, truncated));
}

// The label (slider_label): num itself when integer?, num with two
// decimals otherwise.
export function sliderLabel(num: number, integer: boolean): string {
  return integer ? String(num) : num.toFixed(2);
}

// The filled width (slider_fill): maxWidth * (num - min) / (max - min).
export function fillWidth(
  num: number,
  min: number,
  max: number,
  maxWidth: number = DEFAULT_MAX_WIDTH,
): number {
  return (maxWidth * (num - min)) / (max - min);
}

// The number-slider: a track with its fill and the value's label; the
// gesture handlers update num and track mdown? in the call-site
// scratch (slider_gesture).
export const slider = defineComponent(
  "number-slider",
  [
    {
      keys: ["num", "min", "max", "integer?", "mdown?", "max-width"],
      defaults: { "max-width": DEFAULT_MAX_WIDTH },
    },
  ],
  (props: Props) => {
    const num = props["num"] as number;
    const min = props["min"] as number;
    const max = props["max"] as number;
    const integer = props["integer?"] === true;
    const mdown = props["mdown?"] === true;
    const maxWidth = props["max-width"] as number;
    const $num = props["$num"] as Path;
    const $mdown = props["$mdown?"] as Path;

    const mapX = (pos: Vec2): number => mapValue(pos[0], min, max, maxWidth, integer);

    // pointer handlers receive the node-local position
    const posOf = (...args: readonly unknown[]): Vec2 => args[0] as Vec2;

    // pointer down sets mdown? true and updates (slider_gesture)
    const onDown: Handler = (...args: readonly unknown[]): IntentList => {
      const pos = posOf(...args);
      return [
        ["update", $num, () => mapX(pos)],
        ["set", $mdown, true],
      ];
    };
    // pointer move updates only while mdown? is true (slider_gesture):
    // the handler exists only in the pressed render, and being global
    // it keeps arriving after the finger leaves the bounds until
    // release (slider_pointer_capture)
    const onMove: Handler = (...args: readonly unknown[]): IntentList => [
      ["update", $num, () => mapX(posOf(...args))],
    ];
    // pointer up sets mdown? false and updates (slider_gesture)
    const onUp: Handler = (...args: readonly unknown[]): IntentList => {
      const pos = posOf(...args);
      return [
        ["update", $num, () => mapX(pos)],
        ["set", $mdown, false],
      ];
    };

    const pairs: readonly (readonly [string, Handler])[] = mdown
      ? [["mouse-down", onDown], ["mouse-move-global", onMove], ["mouse-up", onUp]]
      : [["mouse-down", onDown], ["mouse-up", onUp]];

    // the track is the full max-width; the fill is the filled width
    // (slider_fill) drawn over it
    const track = rectangle(maxWidth, TRACK_HEIGHT);
    const fill = rectangle(fillWidth(num, min, max, maxWidth), TRACK_HEIGHT);

    // onPairs over plain view nodes yields a handler node, an Elem
    return verticalLayout([
      onPairs(pairs, [track, fill]) as Elem,
      labelNode(sliderLabel(num, integer)),
    ]);
  },
);
