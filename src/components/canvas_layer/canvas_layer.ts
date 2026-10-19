// Purpose: the canvas-layer component (components.canvas_layer) — the
//   opt-in public seam where a subtree's big data is held BY REFERENCE
//   and drawn through a raster/cache path instead of the per-op drawn
//   tree (tambor-54j.8.3).
// Responsibilities: canvasLayer — a component whose props carry the
//   data object, the layer's pixel size and the draw function; the
//   identity-keyed raster cache (one WeakMap on the data reference) and
//   the view — a single image node replaying the cached raster.
// Rationale: openspec/specs/components-canvas_layer/spec.md is the
//   design authority. The BZ2 evidence (benchmarks/findings-bz.md): the
//   per-op cost scales with DRAWN nodes (1600 path nodes → 606 ms,
//   400 → 183 ms), not with data size — every op re-derives and
//   re-rasterizes the whole drawn subtree regardless of whether the
//   data changed. The layer mirrors the memo identity rule
//   (components.memo): state changes only through dispatch, so a data
//   reference is a sound invalidation signal — a dispatch that changes
//   the data produces a fresh object (a miss → re-derive + re-rasterize
//   once), and every op that leaves the data reference alone (pan,
//   zoom, a control flip) is a hit that skips the drawn-tree derivation
//   of the wrapped subtree entirely: one image node instead of the
//   subtree's nodes. The wrapper's state holds the data by reference —
//   the payload is never copied and never deep-compared; a WeakMap
//   lets data that leaves app state be collected. The raster seam
//   (raster.ts) is DOM-free and reuses the backend's painters, so the
//   cached pixels are exactly the pixels the wrapped subtree paints.

import type { Elem } from "../../views/model.ts";
import type { EventElem } from "../../events/bubble.ts";
import type { ImageBuffer } from "../../render/image.ts";
import { image } from "../../render/primitives.ts";
import {
  defineComponent,
  type Component,
  type Props,
} from "../../model/component.ts";
import { rasterize } from "./raster.ts";

// The draw function: the wrapped subtree, derived from the data.
export type LayerDraw = (data: object) => Elem;

// The per-data raster cache: one WeakMap keyed on the data object's
// identity — the memo identity rule — carrying the draw function that
// produced the raster, so two call sites drawing the same data through
// different draw functions each keep their own raster. WeakMap so data
// that leaves app state (a load op replacing the points) lets its
// raster be collected.
interface Entry {
  readonly draw: LayerDraw;
  readonly width: number;
  readonly height: number;
  readonly buf: ImageBuffer;
}
const cache = new WeakMap<object, Entry>();

// The layer's cached raster for a data reference: a hit (same data
// reference, same draw and size) returns the cached buffer — the
// wrapped subtree is NEVER re-derived; a miss derives the subtree once
// and rasterizes it.
export function cachedRaster(
  data: object,
  draw: LayerDraw,
  width: number,
  height: number,
): ImageBuffer {
  const cached = cache.get(data);
  if (
    cached !== undefined &&
    cached.draw === draw &&
    cached.width === width &&
    cached.height === height
  ) {
    return cached.buf;
  }
  const fresh = rasterize(draw(data), width, height);
  cache.set(data, { draw, width, height, buf: fresh });
  return fresh;
}

// The layer's view: one image node whose data is the cached raster —
// the drawn-tree derivation of the wrapped subtree skipped on a hit,
// the raster replayed by the backend's drawImage.
export function canvasLayerView(props: Props): readonly EventElem[] {
  const data = props["data"];
  if (typeof data !== "object" || data === null) {
    throw new TypeError(
      "canvas_layer: data must be an object — the reference is the invalidation signal",
    );
  }
  const width = props["width"] as number;
  const height = props["height"] as number;
  const draw = props["draw"] as LayerDraw;
  const buf = cachedRaster(data, draw, width, height);
  return [image(width, height, buf)] as unknown as readonly EventElem[];
}

// The canvas-layer component: data (by reference), width, height and
// draw are all declared props — the function prop keeps the component
// render cache out of the way, so the identity rule is this module's
// WeakMap, not the serialization-keyed render cache.
export const canvasLayer: Component = defineComponent(
  "canvas_layer",
  [
    {
      keys: ["data", "width", "height", "draw"],
      defaults: {},
    },
  ],
  (props) => canvasLayerView(props),
);
