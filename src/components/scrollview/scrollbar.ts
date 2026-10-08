// Purpose: the vertical and horizontal scrollbars of the scrollview —
//   conditional placement, thumb geometry and the bar drag.
// Responsibilities: thumbRange(offset, viewport, total) — the thumb's
//   [start, end] fractions of the track; verticalScrollbar and
//   horizontalScrollbar — a track of thickness 7 with a rounded thumb,
//   present only when the content exceeds the viewport on that axis and
//   placed at x = width (respectively y = height); barScrollf — the
//   start-scroll drag function mapping the pointer delta to the set
//   offset effect offset = clamp(div0(position, viewport) * max offset).
// Rationale: specs/components-scrollview.md is the design authority —
//   bars_conditional, thumb_geometry, bar_drag and div0_safe. The track
//   length is the viewport, which makes bar_drag's
//   div0(position, viewport) * max mapping consistent: position at the
//   track bottom maps to the maximum offset. The thumb geometry is
//   drawn from the literal offset/total fractions, so a stale offset
//   (stale_offset_snaps) draws unclamped like the content does.

import {
  on,
  rectangle,
  roundedRectangle,
  translate,
  type Elem,
  type Vec2,
} from "../../views/model.ts";
import type { Path } from "../../effects/paths.ts";
import type { IntentList } from "../../events/bubble.ts";
import { clampScalar, div0, scrollMax } from "./geometry.ts";

// The track thickness shared by both bars (thumb_geometry).
export const TRACK_THICKNESS = 7;

export interface BarSpec {
  readonly offset: Vec2;
  readonly total: Vec2;
  readonly viewport: Vec2;
  readonly $offset: Path;
}

// A thumb starts at offset / total and ends at
// (offset + viewport) / total of the track (thumb_geometry). Only
// called for an existing bar, where total exceeds the viewport.
export function thumbRange(
  offset: number,
  viewport: number,
  total: number,
): readonly [number, number] {
  return [offset / total, (offset + viewport) / total];
}

interface ScrollfSpec {
  readonly axis: "x" | "y";
  /** the press position in bar-node-local (track) coordinates */
  readonly press: Vec2;
  readonly viewport: Vec2;
  readonly max: Vec2;
  /** the offset at press time; the untouched axis is preserved */
  readonly offset: Vec2;
  readonly $offset: Path;
}

// The bar drag function (bar_drag): the pointer position along the
// track is the press position plus the accumulated delta, and the
// offset becomes clamp(div0(position, viewport) * max offset)
// (div0_safe covers the zero viewport).
export function barScrollf(
  spec: ScrollfSpec,
): (delta: Vec2) => IntentList {
  const { axis, press, viewport, max, offset, $offset } = spec;
  return (delta) => {
    if (axis === "y") {
      const y = press[1] + delta[1];
      const ny = clampScalar(div0(y, viewport[1]) * max[1], max[1]);
      return [["set", $offset, [offset[0], ny]]];
    }
    const x = press[0] + delta[0];
    const nx = clampScalar(div0(x, viewport[0]) * max[0], max[0]);
    return [["set", $offset, [nx, offset[1]]]];
  };
}

// The vertical bar: placed at x = width when the content is taller than
// the viewport (bars_conditional), a track of thickness 7 spanning the
// viewport height with the rounded thumb at its offset fraction
// (thumb_geometry), and a mouse-down that returns the start-scroll drag
// function (bar_drag).
export function verticalScrollbar(spec: BarSpec): Elem {
  const max = scrollMax(spec.total, spec.viewport);
  const [start, end] = thumbRange(spec.offset[1], spec.viewport[1], spec.total[1]);
  const track = rectangle(TRACK_THICKNESS, spec.viewport[1]);
  const thumb = translate(
    0,
    start * spec.viewport[1],
    roundedRectangle(
      TRACK_THICKNESS,
      (end - start) * spec.viewport[1],
      TRACK_THICKNESS / 2,
    ),
  );
  return translate(
    spec.viewport[0],
    0,
    on(
      "mouse-down",
      (pos) => [
        [
          "start-scroll",
          barScrollf({
            axis: "y",
            press: pos as Vec2,
            viewport: spec.viewport,
            max,
            offset: spec.offset,
            $offset: spec.$offset,
          }),
        ],
      ],
      track,
      thumb,
    ),
  );
}

// The horizontal bar: placed at y = height when the content is wider
// than the viewport (bars_conditional), symmetric to the vertical bar.
export function horizontalScrollbar(spec: BarSpec): Elem {
  const max = scrollMax(spec.total, spec.viewport);
  const [start, end] = thumbRange(spec.offset[0], spec.viewport[0], spec.total[0]);
  const track = rectangle(spec.viewport[0], TRACK_THICKNESS);
  const thumb = translate(
    start * spec.viewport[0],
    0,
    roundedRectangle(
      (end - start) * spec.viewport[0],
      TRACK_THICKNESS,
      TRACK_THICKNESS / 2,
    ),
  );
  return translate(
    0,
    spec.viewport[1],
    on(
      "mouse-down",
      (pos) => [
        [
          "start-scroll",
          barScrollf({
            axis: "x",
            press: pos as Vec2,
            viewport: spec.viewport,
            max,
            offset: spec.offset,
            $offset: spec.$offset,
          }),
        ],
      ],
      track,
      thumb,
    ),
  );
}
