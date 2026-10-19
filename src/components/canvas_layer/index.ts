// Purpose: components.canvas_layer — the public barrel of the
//   canvas-layer component (tambor-54j.8.3).
// Responsibilities: re-export the component, its view, the identity-
//   keyed raster cache and the DOM-free raster seam under stable names.
// Rationale: openspec/specs/components-canvas_layer/spec.md is the
//   design authority; the raster seam stays importable separately so
//   app-local rasterization (bench meters, tests) uses the same
//   painters the component's cache runs.

export {
  canvasLayer,
  canvasLayerView,
  cachedRaster,
  type LayerDraw,
} from "./canvas_layer.ts";
export { rasterize, bufferEquals } from "./raster.ts";
