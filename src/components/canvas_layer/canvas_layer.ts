// Purpose: the canvas-layer component (components.canvas_layer) — the
//   opt-in public seam where a subtree's big data is held BY REFERENCE
//   and drawn through a raster/cache path instead of the per-op drawn
//   tree (tambor-54j.8.3).
// Responsibilities: canvasLayer({ width, height, draw }) — the memo
//   shape (components.memo): an app creates the layer ONCE (module
//   scope) and calls it per derive with the data object; the identity-
//   keyed raster cache (one WeakMap on the data reference) and the
//   returned view — a single image node replaying the cached raster.
//   cachedRaster exposes the cache lookup itself (meters, tests).
// Rationale: openspec/specs/components-canvas_layer/spec.md is the
//   design authority. The BZ2 evidence (benchmarks/findings-bz.md): the
//   per-op cost scales with DRAWN nodes (1600 path nodes → 606 ms,
//   400 → 183 ms), not with data size — every op re-derives and
//   re-rasterizes the whole drawn subtree regardless of whether the
//   data changed. The layer mirrors the memo identity rule exactly:
//   state changes only through dispatch, so a data reference is a
//   sound invalidation signal — a dispatch that changes the data
//   produces a fresh object (a miss → one re-derive + re-rasterize),
//   and every op that leaves the data reference alone (pan, zoom, a
//   control flip) is a hit that skips the drawn-tree derivation of the
//   wrapped subtree entirely: one image node instead of the subtree's
//   nodes. The wrapper's state holds the data by reference — the
//   payload is never copied and never deep-compared; a WeakMap lets
//   data that leaves app state be collected. The layer is a function,
//   not a defui component call, for the same reason memo is: a defui
//   call would pay the render cache's serialization key over the whole
//   props map — the ~5 µs finding (findings-kit.md, tambor-54j.11)
//   scaled to the payload — per op; the WeakMap hit is one lookup. The
//   raster seam (raster.ts) is DOM-free and reuses the backend's
//   painters, so the cached pixels are exactly the pixels the wrapped
//   subtree paints.

import type { ImageNode } from "../../render/primitives.ts";
import type { ImageBuffer } from "../../render/image.ts";
import type { Elem } from "../../views/model.ts";
import { image } from "../../render/primitives.ts";
import { rasterize } from "./raster.ts";

// The draw function: the wrapped subtree, derived from the data.
export type LayerDraw = (data: object) => Elem;

// One layer's options: the pixel size and the subtree it draws.
export interface CanvasLayerOpts {
  readonly width: number;
  readonly height: number;
  readonly draw: LayerDraw;
}

// The per-data raster cache of ONE layer: one WeakMap keyed on the
// data object's identity — the memo identity rule — carrying the size
// it was rasterized at (a resized layer is a new layer). WeakMap so
// data that leaves app state (a load op replacing the points) lets its
// raster be collected.
interface Entry {
  readonly width: number;
  readonly height: number;
  readonly buf: ImageBuffer;
}

// The layer's type: called per derive with the data BY REFERENCE. The
// node is a render primitive (ImageNode — the draw traversal's
// vocabulary, AnyDraw), not a view-model Node: apps embed it in their
// view the way any image primitive rides the draw tree.
export type CanvasLayerFn = (data: object) => ImageNode;

// The canvas-layer component: created once per call site, called per
// derive. A hit (same data reference, same layer) replays the cached
// raster without touching the wrapped subtree; a miss derives the
// subtree once and rasterizes it. The view is the single image node.
export function canvasLayer(opts: CanvasLayerOpts): CanvasLayerFn {
  const cache = new WeakMap<object, Entry>();
  return (data: object): ImageNode => {
    if (typeof data !== "object" || data === null) {
      throw new TypeError(
        "canvas_layer: data must be an object — the reference is the invalidation signal",
      );
    }
    const buf = cachedRaster(cache, data, opts.draw, opts.width, opts.height);
    return image(opts.width, opts.height, buf);
  };
}

// The raster cache lookup behind a layer: a hit returns the cached
// buffer (the wrapped subtree is NEVER re-derived); a miss derives the
// subtree once and rasterizes it. Exposed for meters and tests that
// want the buffer, not the view node.
export function cachedRaster(
  cache: WeakMap<object, Entry>,
  data: object,
  draw: LayerDraw,
  width: number,
  height: number,
): ImageBuffer {
  const cached = cache.get(data);
  if (cached !== undefined && cached.width === width && cached.height === height) {
    return cached.buf;
  }
  const fresh = rasterize(draw(data), width, height);
  cache.set(data, { width, height, buf: fresh });
  return fresh;
}
