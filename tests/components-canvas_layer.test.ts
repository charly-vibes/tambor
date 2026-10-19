// Purpose: the contract tests for the canvas-layer component
//   (openspec/specs/components-canvas_layer/spec.md — tambor-54j.8.3).
// Responsibilities: the identity rule (the data reference is the
//   invalidation signal — same reference → the cached raster replays
//   and draw is NOT re-invoked; a fresh reference → one re-derive), the
//   by-reference state contract (no deep equality — structurally equal
//   but distinct data is a miss), the single-image-node view shape,
//   raster determinism, the loud rejection of non-object data, and the
//   op-cycle tripwire: across a 12-op pan cycle over ONE data
//   reference, draw runs exactly once where the un-layered arm
//   re-derives per op.
// Rationale: the BZ2 evidence (benchmarks/findings-bz.md) — per-op cost
//   scales with DRAWN nodes, not data size — makes "the wrapped
//   subtree's derivation is skipped while the reference holds" the
//   contract the perf claim rests on; it is pinned here at unit scale,
//   machine-independently, exactly as the memo kit pinned its
//   identity rule.

import { describe, expect, it } from "vitest";
import {
  canvasLayer,
  canvasLayerView,
  rasterize,
  bufferEquals,
  type LayerDraw,
} from "../src/components/canvas_layer/index.ts";
import { label as labelNode, path, rectangle } from "../src/views/model.ts";
import type { Elem } from "../src/views/model.ts";
import { ImageBuffer } from "../src/render/image.ts";
import { render, call } from "../src/model/component.ts";
import type { Props } from "../src/model/component.ts";

// The data payload: an array of points, held by reference (the BZ2
// shape — the app's state slice the ops leave untouched while panning).
interface Pt {
  readonly x: number;
  readonly y: number;
}

function points(n: number, seed = 0): readonly Pt[] {
  return Array.from({ length: n }, (_, i) => ({
    x: (i * 7 + seed) % 100,
    y: (i * 13 + seed * 3) % 80,
  }));
}

// The wrapped subtree: one path + one rectangle + one label per point
// would be the naive per-op shape; for the contract tests a small tree
// suffices — the DRAW-COUNT assertions are what carry the contract.
const draw: LayerDraw = (data) => {
  const pts = data as readonly Pt[];
  return [
    rectangle(100, 80),
    ...pts.map((p): Elem => path([[p.x, p.y], [p.x + 3, p.y + 3]])),
    labelNode(`${pts.length} points`),
  ];
};

function layerProps(data: object): Props {
  return { data, width: 100, height: 80, draw };
}

// The image node of a derived layer view (the single node the layer
// returns), typed for the assertions.
function imageNode(view: readonly unknown[]): { type: string; data?: ImageBuffer; width: number; height: number } {
  expect(view.length).toBe(1);
  return view[0] as { type: string; data?: ImageBuffer; width: number; height: number };
}

describe("canvas_layer identity rule", () => {
  it("p_ref_hit: the same data reference twice → draw called once, identical image node", () => {
    const data = points(4);
    let draws = 0;
    const localDraw: LayerDraw = (d) => {
      draws++;
      return draw(d);
    };
    const first = canvasLayerView({ data, width: 100, height: 80, draw: localDraw });
    const second = canvasLayerView({ data, width: 100, height: 80, draw: localDraw });
    const n1 = imageNode(first);
    const n2 = imageNode(second);
    expect(draws).toBe(1); // the second derive re-rasterized nothing
    // the image node is rebuilt per derive (an immutable view value)
    // but the raster inside is the identical cached buffer
    expect(n2.data).toBe(n1.data);
    expect(n1.type).toBe("image");
  });

  it("p_invalidate: a fresh immutable copy of the data → one re-derive, new raster cached", () => {
    const before = points(4);
    const after = points(4).map((p) => ({ ...p, y: p.y })); // fresh objects, equal content
    let draws = 0;
    const localDraw: LayerDraw = (d) => {
      draws++;
      return draw(d);
    };
    const v1 = canvasLayerView({ data: before, width: 100, height: 80, draw: localDraw });
    const v2 = canvasLayerView({ data: after, width: 100, height: 80, draw: localDraw });
    expect(draws).toBe(2);
    // the new reference's raster is now cached too — a repeat derive hits
    const v3 = canvasLayerView({ data: after, width: 100, height: 80, draw: localDraw });
    expect(draws).toBe(2);
    expect(imageNode(v3).data).toBe(imageNode(v2).data);
    expect(imageNode(v2).data).not.toBe(imageNode(v1).data);
  });

  it("p_no_deep: structurally equal but distinct data → re-derive (identity, not deep equality)", () => {
    const a = points(3);
    const b = points(3); // equal content, distinct array objects
    let draws = 0;
    const localDraw: LayerDraw = (d) => {
      draws++;
      return draw(d);
    };
    canvasLayerView({ data: a, width: 100, height: 80, draw: localDraw });
    canvasLayerView({ data: b, width: 100, height: 80, draw: localDraw });
    expect(draws).toBe(2);
  });

  it("p_subtree_skipped: one reference across a 12-op pan cycle → draw exactly once; the un-layered arm re-derives per op", () => {
    const data = points(50);
    let layerDraws = 0;
    const layerOp: LayerDraw = (d) => {
      layerDraws++;
      return draw(d);
    };
    // the layered arm: 12 pan ops all leave the data reference alone
    for (let op = 0; op < 12; op++) {
      canvasLayerView({ data, width: 100, height: 80, draw: layerOp });
    }
    expect(layerDraws).toBe(1);
    // the un-layered comparator: every op re-derives the drawn subtree
    let naiveDraws = 0;
    const naiveOp: LayerDraw = (d) => {
      naiveDraws++;
      return draw(d);
    };
    for (let op = 0; op < 12; op++) {
      naiveOp(data); // the naive wire calls draw every op
    }
    expect(naiveDraws).toBe(12);
  });

  it("p_single_node: the layer's view is exactly one image node carrying the cached raster", () => {
    const data = points(6);
    const view = canvasLayerView(layerProps(data));
    const node = imageNode(view);
    expect(node.type).toBe("image");
    expect(node.width).toBe(100);
    expect(node.height).toBe(80);
    expect(node.data).toBeInstanceOf(ImageBuffer);
  });

  it("p_raster_deterministic: the same subtree rasterized twice yields equal pixels", () => {
    const tree = draw(points(5));
    const a = rasterize(tree, 100, 80);
    const b = rasterize(tree, 100, 80);
    expect(bufferEquals(a, b)).toBe(true);
  });

  it("p_reject: non-object data is rejected loudly with a TypeError", () => {
    expect(() => canvasLayerView({ data: 1, width: 10, height: 10, draw })).toThrow(TypeError);
    expect(() => canvasLayerView({ data: "x", width: 10, height: 10, draw })).toThrow(TypeError);
    expect(() => canvasLayerView({ data: null, width: 10, height: 10, draw })).toThrow(TypeError);
  });

  it("the component wire: render(call(canvasLayer, …)) skips the draw on a hit (the props carry a function, so the render cache is bypassed and the WeakMap owns the rule)", () => {
    const data = points(8);
    let draws = 0;
    const localDraw: LayerDraw = (d) => {
      draws++;
      return draw(d);
    };
    const derive = (): Elem =>
      render(call(canvasLayer, { data, width: 100, height: 80, draw: localDraw })) as Elem;
    const v1 = derive();
    const v2 = derive();
    const v3 = derive();
    expect(draws).toBe(1);
    // the derived nodes are structurally rebuilt per derive (render
    // re-runs the body) but the raster inside is the identical buffer
    expect(imageNode(v1 as readonly unknown[])).not.toBe(imageNode(v2 as readonly unknown[]));
    expect(imageNode(v1 as readonly unknown[]).data).toBe(
      imageNode(v2 as readonly unknown[]).data,
    );
    expect(imageNode(v3 as readonly unknown[]).data).toBe(
      imageNode(v1 as readonly unknown[]).data,
    );
  });
});
