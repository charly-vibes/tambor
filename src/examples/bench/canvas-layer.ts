// Purpose: the canvas-layer bench app (tambor-54j.8.3) — the §4.8
//   canvas-seam candidate pointed at by the BZ2 data, proven at unit
//   scale: 12k drawn path primitives (one per point, the BZ2 band-chart
//   shape) where the ops pan over ONE data reference.
// Responsibilities: ChartPoint/makePoints (a deterministic two-series
//   signal), LayerState — the points held BY REFERENCE plus the pan
//   offset — the pan/load ops, chartBody (the wrapped subtree the layer
//   draws: one path per point, >10k drawn primitives), and the two view
//   halves the paired meter interleaves: naiveChartView (the whole
//   subtree re-derived and re-painted per op — the honest failing-before
//   arm) and layeredChartView (the components.canvas_layer component:
//   one image node replaying the cached raster, translated by the pan —
//   the after arm).
// Rationale: the BZ2 finding (benchmarks/findings-bz.md): per-op cost
//   scales with DRAWN nodes (1600 → 606 ms, 400 → 183 ms), not with
//   data size — every op re-derives and re-paints the whole drawn
//   subtree even though the pan leaves the data untouched. The layer is
//   the public seam an app adopts: its state holds the data by
//   reference, the ops change only the pan offset, and the identity
//   rule (the reference is the invalidation signal — the memo rule)
//   skips the drawn-tree derivation of the wrapped subtree while the
//   reference holds. The pan translate sits OUTSIDE the layer, so a pan
//   still moves the drawn pixels while the raster is replayed — no
//   benchmark rigging, the op is a real state transition both arms
//   make visible. The load op replaces the points (a fresh reference —
//   the dispatch-shaped immutable update) and pays exactly one
//   re-derive + re-rasterize.

import { label as labelNode, path, translate, type Elem, type Vec2 } from "../../views/model.ts";
import { canvasLayer } from "../../components/canvas_layer/index.ts";

// The point count: >10k drawn primitives (one path node per point —
// the acceptance floor, at BZ2's band-chart shape).
export const LAYER_POINTS = 12_000;

// The chart's pixel geometry: one pixel per point horizontally.
export const CHART_H = 240;
export const CHART_W = LAYER_POINTS;

// One pan op slides the window 800 points.
export const PAN_STEP = 800;

// One point: the shared x (the index) and the two series' values.
export interface ChartPoint {
  readonly x: number;
  readonly a: number;
  readonly b: number;
}

// The deterministic signal: a two-frequency sinusoid per series.
export function makePoint(id: number): ChartPoint {
  const a = Math.sin(id / 400) + 0.3 * Math.sin(id / 67);
  const b = Math.cos(id / 600) + 0.3 * Math.sin(id / 29);
  return { x: id, a, b };
}

export function makePoints(n = LAYER_POINTS, seed = 0): readonly ChartPoint[] {
  return Array.from({ length: n }, (_, i) => makePoint(i + seed * 7919));
}

// The app state: plain data — the points BY REFERENCE (the slice the
// ops leave untouched) and the pan offset.
export interface LayerState {
  readonly points: readonly ChartPoint[];
  readonly winStart: number;
  readonly pans: number;
}

export function layerState(seed = 0): LayerState {
  return { points: makePoints(LAYER_POINTS, seed), winStart: 0, pans: 0 };
}

// The series' y in the 0..CHART_H pixel box (±1.3 mapped, no clamping).
function yOf(v: number): number {
  return Math.round((v + 1.3) / 2.6 * (CHART_H - 1));
}

// The wrapped subtree: one path per point (the min/max vertical shape
// the BZ2 band chart draws, undecimated) — >10k drawn primitives.
export function chartBody(data: object): Elem {
  const points = data as readonly ChartPoint[];
  const nodes: Elem[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const a: Vec2 = [i, yOf(p.a)];
    const b: Vec2 = [i, yOf(p.b)];
    nodes.push(path(a, b));
  }
  return nodes;
}

// Pan slides PAN_STEP right, wrapping over the slideable range so the
// translate stays inside the drawn extent (0..2·PAN_STEP); warmup + 12
// timed ops land deterministically (the pans field pins the count).
export function panStart(state: LayerState): number {
  return (state.winStart + PAN_STEP) % (2 * PAN_STEP);
}

// The measured pan op: the offset changes, the points reference does
// NOT — the dispatch-shaped immutable update leaves the untouched
// slice identity-preserved (state-paths structural sharing).
export function panOp(state: LayerState): LayerState {
  return { ...state, winStart: panStart(state), pans: state.pans + 1 };
}

// The load op: the points are REPLACED (a fresh reference — the
// invalidation the layer pays one re-derive + re-rasterize for).
export function loadOp(state: LayerState, seed = 1): LayerState {
  return { ...state, points: makePoints(LAYER_POINTS, seed), winStart: 0, pans: state.pans + 1 };
}

// The readout: the pans field the tripwires read.
export function summaryLine(state: LayerState): string {
  return `pts ${state.points.length} win ${state.winStart} pans ${state.pans}`;
}

// The naive arm: the whole subtree re-derived per op and painted whole
// — the honest failing-before arm (the BZ2 wire: the op cost is the
// drawn tree).
export function naiveChartView(state: LayerState): Elem {
  return [
    labelNode(summaryLine(state)),
    translate(-state.winStart, 0, chartBody(state.points)) as Elem,
  ] as Elem;
}

// The layered arm's layer: created ONCE at module scope (the memo
// shape) and called per derive with the state's points BY REFERENCE.
const chartLayer = canvasLayer({
  width: CHART_W,
  height: CHART_H,
  draw: chartBody,
});

// The layered arm: the components.canvas_layer component — its state
// holds the data by reference; a pan is a cache hit replaying the
// raster (one image node) under the same pan translate.
export function layeredChartView(state: LayerState): Elem {
  return [
    labelNode(summaryLine(state)),
    // the image primitive rides the draw traversal (AnyDraw) — the
    // view-model Elem union does not carry render primitives
    translate(-state.winStart, 0, chartLayer(state.points) as unknown as Elem) as Elem,
  ] as Elem;
}
