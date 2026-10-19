// Purpose: the canvas layer's raster seam (components.canvas_layer) —
//   the small backend capability the layer needs: rasterizing a drawn
//   subtree into an ImageBuffer, DOM-free.
// Responsibilities: rasterize(view, width, height) — one pass over the
//   drawn subtree through the backend's PAINTERS dispatch into a fresh
//   ImageBuffer; and bufferEquals (the pixel equality the determinism
//   contract reads).
// Rationale: openspec/specs/components-canvas_layer/spec.md is the
//   design authority. The seam reuses the backend's per-type painters
//   (src/render/canvas-painters.ts) and the headless Painter
//   (src/render/painter.ts) — the same rasterization the canvas backend's
//   draw traversal performs — so a cached layer's pixels are exactly the
//   pixels the wrapped subtree would have painted. It is the membrane
//   precedent's opt-in backend image wrapper (skia.clj:1584-1635,
//   insights/membrane.md): the rasterization target is the module's own
//   ImageBuffer — headless_render is the canvas backend's native mode,
//   so no window, no DOM, no lib.dom is involved.

import type { AnyDraw } from "../../render/primitives.ts";
import type { CanvasNode } from "../../render/canvas-painters.ts";
import { PAINTERS } from "../../render/canvas-painters.ts";
import { ImageBuffer, Painter } from "../../render/image.ts";

// One drawn subtree rasterized into a fresh width×height buffer: the
// same primitive_set traversal the canvas backend's paintTree performs
// (arrays walked depth-first, per-type painters behind the dispatch
// table, unknown node types falling back to their children).
export function rasterize(
  view: AnyDraw,
  width: number,
  height: number,
): ImageBuffer {
  const buf = new ImageBuffer(width, height);
  const painter = new Painter(buf);
  const paint = (v: AnyDraw): void => {
    if (v == null) return;
    if (Array.isArray(v)) {
      for (const child of v as readonly AnyDraw[]) paint(child);
      return;
    }
    const node = v as CanvasNode;
    const fn = PAINTERS[node.type];
    if (fn === undefined) {
      // unknown node types fall back to drawing their children
      // (primitive_set — the backend's own rule)
      for (const child of node.drawables ?? []) paint(child);
      return;
    }
    fn(paint, painter, node);
  };
  paint(view);
  return buf;
}

// Pixel equality of two buffers: the determinism contract reads it
// (same inputs → same pixels).
export function bufferEquals(a: ImageBuffer, b: ImageBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  return a.data.every((v, i) => v === b.data[i]);
}
