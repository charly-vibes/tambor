// Purpose: the bench-scale tripwire for the canvas-layer kit ticket
//   (tambor-54j.8.3) — over a 12-op pan cycle (>10k drawn path
//   primitives, one per point), the layered arm must carry exactly ONE
//   drawn image primitive while the naive arm carries >10k primitives
//   per op, the wrapped subtree must be derived exactly once while the
//   reference holds, the drawn output must be unchanged (the raster
//   equals a fresh rasterization of the same subtree), and the paired
//   op-cost meter (interleaved arms, fresh state per sample) is printed
//   for the record (unasserted).
// Responsibilities: the deterministic tripwires — (a) drawn-node budget:
//   the naive arm's per-op view carries >10k path primitives (the
//   fails-before evidence, the BZ2 scaling law) while the layer arm's
//   carries exactly one image node (the pass-after); (b) draw-once: the
//   image node's raster object is identical across the whole cycle (a
//   re-derive would produce a fresh buffer); (c) drawn-output parity:
//   the cached raster equals a fresh rasterization; (d) the load op (a
//   fresh reference) re-rasterizes exactly once; (e) the app drives the
//   pan op through the ordinary dispatcher wire. The interleaved meter
//   prints median per-op ms for both arms and their ratio.
// Rationale: BZ2's evidence (benchmarks/findings-bz.md) says the per-op
//   cost scales with drawn nodes, so the budget the "fails before"
//   encodes is DRAWN WORK per op (>10k primitive derives + paints per
//   op), machine-independent — the wall-clock ratio rides on machine
//   state, so it is recorded, not asserted (the memo-kit meter lesson,
//   benchmarks/findings-kit.md J8).

import { expect, test } from "vitest";
// @ts-expect-error node:perf_hooks has no type declarations here
import { performance } from "node:perf_hooks";
import {
  CHART_W,
  CHART_H,
  PAN_STEP,
  LAYER_POINTS,
  chartBody,
  layeredChartView,
  naiveChartView,
  loadOp,
  makePoints,
  panOp,
  layerState,
  type LayerState,
} from "../src/examples/bench/canvas-layer.ts";
import { rasterize, bufferEquals } from "../src/components/canvas_layer/index.ts";
import { CanvasBackend } from "../src/render/canvas.ts";
import type { ImageBuffer } from "../src/render/image.ts";
import { walk, type EventNode } from "./helpers/scrollview.ts";
import type { Elem, EventElem } from "../src/views/model.ts";
import type { Path } from "../src/effects/paths.ts";
import { makeApp, type App } from "../src/effects/dispatch.ts";

// Every drawn node of a view, depth-first, keyed by node type.
function countByType(view: Elem | EventElem): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of walk(view as EventElem) as readonly EventNode[]) {
    const t = (node as { type?: string }).type;
    if (typeof t === "string") counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

// The image buffer the layered arm's view carries (the single image
// node's data — the cached raster).
function imageBufOf(view: Elem): ImageBuffer | undefined {
  for (const node of walk(view as EventElem) as readonly EventNode[]) {
    const t = node as { type?: string; data?: ImageBuffer };
    if (t.type === "image") return t.data;
  }
  return undefined;
}

const OPS = 12;

test("the app drives the pan op through the ordinary dispatcher wire", () => {
  let app: App | undefined;
  app = makeApp({
    view: (state) => layeredChartView(state as LayerState),
    state: { points: makePoints(20), winStart: 0, pans: 0 },
    backend: { containerSize: [640, 480] },
  });
  const path: Path = [["keypath", "winStart"]];
  app.dispatch(["update", path, (old: unknown) => (old as number) + PAN_STEP]);
  const state = app.getState() as LayerState;
  expect(state.winStart).toBe(PAN_STEP);
  expect(state.points.length).toBe(20);
});

test("drawn-node budget: naive per-op >10k primitives (fails before), layer per-op one image node (passes after)", () => {
  const state = layerState();
  const naiveCounts = countByType(naiveChartView(state));
  const naivePaths = naiveCounts.get("path") ?? 0;
  expect(naivePaths).toBeGreaterThan(10_000); // the failing-before wire
  expect(naiveCounts.get("image")).toBeUndefined();

  const layerCounts = countByType(layeredChartView(state));
  expect(layerCounts.get("image")).toBe(1); // the pass-after wire
  expect(layerCounts.get("path")).toBeUndefined();
});

test("draw-once: the raster object is identical across the 12-op pan cycle — the wrapped subtree is derived exactly once", () => {
  let state = layerState();
  const first = imageBufOf(layeredChartView(state));
  expect(first).toBeDefined();
  for (let op = 0; op < OPS; op++) {
    state = panOp(state);
    // reference identity via a boolean — vitest's toBe machinery is
    // pathologically slow on the 11 MB buffer object itself
    expect(imageBufOf(layeredChartView(state)) === first).toBe(true);
  }
  // the naive arm for contrast: a fresh subtree per op (a fresh
  // rasterization each time is the cost it pays)
  const fresh1 = rasterize(chartBody(state.points), CHART_W, CHART_H);
  const fresh2 = rasterize(chartBody(state.points), CHART_W, CHART_H);
  expect(fresh1 !== fresh2).toBe(true);
  expect(bufferEquals(fresh1, fresh2)).toBe(true);
});

test("drawn-output parity: the cached raster equals a fresh rasterization of the same subtree", () => {
  const state = layerState();
  const cached = imageBufOf(layeredChartView(state))!;
  const fresh = rasterize(chartBody(state.points), CHART_W, CHART_H);
  expect(bufferEquals(cached, fresh)).toBe(true);
});

test("the load op (fresh data reference) re-rasterizes exactly once, then is cached", () => {
  let state = layerState();
  const before = imageBufOf(layeredChartView(state))!;
  state = loadOp(state, 1); // fresh reference — the invalidation
  const after = imageBufOf(layeredChartView(state))!;
  expect(after !== before).toBe(true); // re-rasterized
  expect(imageBufOf(layeredChartView(state)) === after).toBe(true); // now cached
});

test("paired meter: interleaved arms, fresh state per sample (recorded, unasserted)", () => {
  const backend = new CanvasBackend({ containerSize: [640, 480] });
  const SAMPLES = 3;
  const perArm: { layered: number[]; naive: number[] } = { layered: [], naive: [] };
  for (let s = 0; s < SAMPLES; s++) {
    const order = s % 2 === 0 ? (["layered", "naive"] as const) : (["naive", "layered"] as const);
    for (const arm of order) {
      let st: LayerState = layerState(s); // fresh seed per sample
      st = panOp(st); // warmup (untimed) — pays the one-time rasterize
      void layeredChartView(st);
      const times: number[] = [];
      for (let op = 0; op < OPS; op++) {
        st = panOp(st);
        const t0 = performance.now();
        const view = arm === "layered" ? layeredChartView(st) : naiveChartView(st);
        backend.draw(view as never);
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      perArm[arm].push(times[Math.floor(OPS / 2)]!);
    }
  }
  const median = (xs: readonly number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  const layered = median(perArm.layered);
  const naive = median(perArm.naive);
  // eslint-disable-next-line no-console
  console.log(
    `[canvas-layer meter] layered median ${layered.toFixed(3)} ms/op, ` +
      `naive median ${naive.toFixed(3)} ms/op, ratio ` +
      `${(layered / naive).toFixed(3)} (${LAYER_POINTS} drawn primitives, ` +
      `${OPS} pan ops, ${SAMPLES} interleaved samples)`,
  );
  expect(layered).toBeGreaterThan(0);
  expect(naive).toBeGreaterThan(0);
});
