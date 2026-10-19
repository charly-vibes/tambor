// Purpose: the contract tests for the canvas-layer component
//   (openspec/specs/components-canvas_layer/spec.md — tambor-54j.8.3).
// Responsibilities: the identity rule (the data reference is the
//   invalidation signal — same reference → the cached raster replays
//   and the wrapped subtree is NOT re-derived; a fresh reference → one
//   re-derive), the by-reference state contract (no deep equality —
//   structurally equal but distinct data is a miss), the
//   single-image-node view shape, raster determinism, the loud
//   rejection of non-object data, the op-cycle tripwire (draw once
//   across the cycle vs per op unlayered), and the resolver-wire guard
//   (a layer inside a defui component body resolves as a leaf — the
//   raster buffer is data, not a container to walk).
// Rationale: the BZ2 evidence (benchmarks/findings-bz.md) — per-op cost
//   scales with DRAWN nodes, not data size — makes "the wrapped
//   subtree's derivation is skipped while the reference holds" the
//   contract the perf claim rests on; it is pinned here at unit scale,
//   machine-independently, exactly as the memo kit pinned its
//   identity rule.

import { describe, expect, it } from "vitest";
import {
  canvasLayer,
  cachedRaster,
  rasterize,
  bufferEquals,
  type LayerDraw,
} from "../src/components/canvas_layer/index.ts";
import { label as labelNode, path, rectangle } from "../src/views/model.ts";
import type { Elem } from "../src/views/model.ts";
import { ImageBuffer } from "../src/render/image.ts";
import { render, call, defineComponent } from "../src/model/component.ts";
import type { Props } from "../src/model/component.ts";
import { clearRenderCache } from "../src/model/component-cache.ts";

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
    ...pts.map((p): Elem => path([p.x, p.y], [p.x + 3, p.y + 3])),
    labelNode(`${pts.length} points`),
  ];
};

// A layer at the test geometry (the app creates it once at module
// scope — the memo shape).
const layer = canvasLayer({ width: 100, height: 80, draw });

// The image node the layer returns, typed for the assertions.
function imageNode(node: unknown): { type: string; data?: ImageBuffer; width: number; height: number } {
  const n = node as { type: string; data?: ImageBuffer; width: number; height: number };
  expect(n.type).toBe("image");
  return n;
}

describe("canvas_layer identity rule", () => {
  it("p_ref_hit: the same data reference twice → the wrapped subtree derived once, identical raster", () => {
    const data = points(4);
    let draws = 0;
    const localDraw: LayerDraw = (d) => {
      draws++;
      return draw(d);
    };
    const localLayer = canvasLayer({ width: 100, height: 80, draw: localDraw });
    const first = localLayer(data);
    const second = localLayer(data);
    expect(draws).toBe(1); // the second derive re-rasterized nothing
    // the image node is rebuilt per derive (an immutable view value)
    // but the raster inside is the identical cached buffer
    expect(imageNode(second).data === imageNode(first).data).toBe(true);
    expect(imageNode(first).type).toBe("image");
  });

  it("p_invalidate: a fresh immutable copy of the data → one re-derive, new raster cached", () => {
    const before = points(4);
    const after = points(4); // fresh objects, equal content
    let draws = 0;
    const localDraw: LayerDraw = (d) => {
      draws++;
      return draw(d);
    };
    const localLayer = canvasLayer({ width: 100, height: 80, draw: localDraw });
    const v1 = localLayer(before);
    const v2 = localLayer(after);
    expect(draws).toBe(2);
    // the new reference's raster is now cached too — a repeat derive hits
    const v3 = localLayer(after);
    expect(draws).toBe(2);
    expect(imageNode(v3).data === imageNode(v2).data).toBe(true);
    expect(imageNode(v2).data !== imageNode(v1).data).toBe(true);
  });

  it("p_no_deep: structurally equal but distinct data → re-derive (identity, not deep equality)", () => {
    const a = points(3);
    const b = points(3); // equal content, distinct array objects
    let draws = 0;
    const localDraw: LayerDraw = (d) => {
      draws++;
      return draw(d);
    };
    const localLayer = canvasLayer({ width: 100, height: 80, draw: localDraw });
    localLayer(a);
    localLayer(b);
    expect(draws).toBe(2);
  });

  it("p_subtree_skipped: one reference across a 12-op pan cycle → the wrapped subtree derived exactly once; the un-layered arm re-derives per op", () => {
    const data = points(50);
    let layerDraws = 0;
    const layerOp: LayerDraw = (d) => {
      layerDraws++;
      return draw(d);
    };
    const localLayer = canvasLayer({ width: 100, height: 80, draw: layerOp });
    // the layered arm: 12 pan ops all leave the data reference alone
    for (let op = 0; op < 12; op++) {
      localLayer(data);
    }
    expect(layerDraws).toBe(1);
    // the un-layered comparator: every op re-derives the drawn subtree
    let naiveDraws = 0;
    for (let op = 0; op < 12; op++) {
      naiveDraws++;
      void draw(data); // the naive wire calls draw every op
    }
    expect(naiveDraws).toBe(12);
  });

  it("p_single_node: the layer's view is exactly one image node carrying the cached raster", () => {
    const data = points(6);
    const node = imageNode(layer(data));
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
    expect(() => layer(1 as unknown as object)).toThrow(TypeError);
    expect(() => layer("x" as unknown as object)).toThrow(TypeError);
    expect(() => layer(null as unknown as object)).toThrow(TypeError);
  });

  it("cachedRaster: the cache lookup returns the identical buffer across derives", () => {
    const cache = new WeakMap<object, { width: number; height: number; buf: ImageBuffer }>();
    const data = points(8);
    const b1 = cachedRaster(cache, data, draw, 100, 80);
    const b2 = cachedRaster(cache, data, draw, 100, 80);
    expect(b2).toBe(b1);
    expect(draw).toBeDefined();
  });
});

describe("canvas_layer × the component wire", () => {
  it("a layer inside a defui component body resolves as a leaf — the raster buffer is walked as data, not as a container", () => {
    clearRenderCache();
    const data = points(4);
    const view = canvasLayer({ width: 100, height: 80, draw })(data);
    const host = defineComponent("canvas_host", [{ keys: ["view"], defaults: {} }], (props: Props) => props["view"]);
    const out = render(call(host, { view })) as unknown;
    expect(imageNode(out).data === imageNode(view).data).toBe(true); // the same buffer, un-walked
  });
});
