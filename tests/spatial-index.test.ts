// Purpose: contract tests for the spatial hit-test index component
//   (tambor-54j.10, I12 from the chat-repo cold read) — an internal
//   accelerator over rectangle scenes whose results must be
//   byte-identical to the linear reverse walk the dispatch semantics
//   encode.
// Responsibilities: (a) equivalence property — for random rect scenes
//   and query points, hitAt(buildHitIndex(...)) equals the linear
//   reverse-scan reference on EVERY point, including boundary points
//   (half-open edges: right/bottom exclusive, hit_half_open) and the
//   empty-scene / no-hit cases; (b) move-maintenance equivalence —
//   after re-registering moved shapes the index still agrees with a
//   fresh linear walk of the moved scene; (c) the named pointer-move
//   meter — median per-query latency on a 10k-shape scene asserted
//   under the recorded 2ms bound (tambor-54j.10 acceptance).
// Rationale: the index is an internal accelerator, not a semantic
//   change: the linear walk's rule (scan from the end, first containing
//   item wins — i.e. the containing item with the GREATEST original
//   position) is the spec the grid buckets must reproduce even though
//   cell membership scrambles array order. Rectangles only (the BZ3
//   profile's shapes); no generalization beyond that (anti-goal).

// @ts-expect-error node:perf_hooks has no type declarations here
import { performance } from "node:perf_hooks";
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildHitIndex,
  hitAt,
  hitLinearRef,
  hitIndexMove,
  type BBox,
} from "../src/model/spatial-index.ts";

interface Rect extends BBox {
  id: number;
}

function sceneRects(items: readonly Rect[]): readonly Rect[] {
  return items;
}

// deterministic 10k scene for the meter: a 100×100 grid of 10×10 rects
// with tiny overlaps (each rect shifted +3px right/down per row band)
function meterScene(n: number): Rect[] {
  const out: Rect[] = [];
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const cx = (i % side) * 12;
    const cy = Math.floor(i / side) * 12;
    out.push({ id: i, x: cx, y: cy, w: 14, h: 14 }); // +2 overlap per axis
  }
  return out;
}

describe("spatial hit-test index (tambor-54j.10)", () => {
  it("equivalence property: hitAt agrees with the linear reverse walk on every point", () => {
    const arbScene = fc.array(
      fc.record({
        id: fc.nat(1000),
        x: fc.integer({ min: -20, max: 220 }),
        y: fc.integer({ min: -20, max: 220 }),
        w: fc.integer({ min: 1, max: 40 }),
        h: fc.integer({ min: 1, max: 40 }),
      }),
      { maxLength: 60 },
    );
    const arbPoint = fc.record({
      x: fc.integer({ min: -30, max: 260 }),
      y: fc.integer({ min: -30, max: 260 }),
    });
    fc.assert(
      fc.property(
        arbScene,
        fc.array(arbPoint, { maxLength: 40 }),
        (items, points) => {
          const scene = sceneRects(items);
          const index = buildHitIndex(scene, 50);
          for (const p of points) {
            expect(hitAt(index, p.x, p.y)).toEqual(
              hitLinearRef(scene, p.x, p.y),
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("boundary semantics: half-open edges match the linear walk exactly", () => {
    const scene: Rect[] = [
      { id: 0, x: 0, y: 0, w: 10, h: 10 },
      { id: 1, x: 10, y: 0, w: 10, h: 10 },
      { id: 2, x: 0, y: 10, w: 10, h: 10 },
    ];
    const index = buildHitIndex(scene, 5);
    // right/bottom edges exclusive (hit_half_open): the corner (10,10)
    // hits NOTHING — rect 0 excludes it (edge), rects 1/2 exclude it too
    expect(hitAt(index, 10, 10)).toEqual(hitLinearRef(scene, 10, 10));
    expect(hitAt(index, 10, 10)).toBeUndefined();
    expect(hitAt(index, 9, 9)).toBe(scene[0]);
    expect(hitAt(index, 10, 9)).toBe(scene[1]);
    expect(hitAt(index, 9, 10)).toBe(scene[2]);
  });

  it("topmost rule: duplicate-stack points resolve to the greatest original position (reverse-scan-first)", () => {
    const scene: Rect[] = [
      { id: 0, x: 0, y: 0, w: 20, h: 20 },
      { id: 1, x: 5, y: 5, w: 20, h: 20 },
      { id: 2, x: 8, y: 8, w: 20, h: 20 },
    ];
    const index = buildHitIndex(scene, 50);
    expect(hitAt(index, 9, 9)).toBe(scene[2]); // last wins, like the walk
    expect(hitLinearRef(scene, 9, 9)).toBe(scene[2]);
  });

  it("move maintenance: re-registered moves keep index == fresh linear walk", () => {
    const arbScene = fc.array(
      fc.record({
        id: fc.nat(500),
        x: fc.integer({ min: 0, max: 180 }),
        y: fc.integer({ min: 0, max: 180 }),
        w: fc.integer({ min: 1, max: 30 }),
        h: fc.integer({ min: 1, max: 30 }),
      }),
      { minLength: 1, maxLength: 40 },
    );
    fc.assert(
      fc.property(arbScene, fc.nat(1000), (items, seed) => {
        const scene = sceneRects(items);
        let index = buildHitIndex(scene, 50);
        // move a deterministic subset (deterministic per seed); the
        // scene items are mutated in place — the index re-registers the
        // SAME object with the new geometry (the hitIndexMove contract:
        // item identity is preserved, geometry snapshot updated)
        const next: Rect[] = [...scene];
        for (let k = 0; k < Math.min(5, scene.length); k++) {
          const i = (seed * (k + 3)) % scene.length;
          const to: BBox = {
            x: ((seed + k) * 7) % 200,
            y: ((seed + k) * 11) % 200,
            w: scene[i]!.w,
            h: scene[i]!.h,
          };
          index = hitIndexMove(index, scene[i]!, to);
          Object.assign(next[i]!, to);
        }
        for (let x = -10; x < 220; x += 37) {
          for (let y = -10; y < 220; y += 41) {
            expect(hitAt(index, x, y)).toEqual(hitLinearRef(next, x, y));
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it("meter: pointer-move hit-testing on a 10k-shape scene stays under the 2ms bound", () => {
    const scene = meterScene(10_000);
    const index = buildHitIndex(scene, 50);
    // warm
    for (let i = 0; i < 500; i++) {
      hitAt(index, (i * 13) % 1300, (i * 7) % 1300);
    }
    const QUERIES = 2_000;
    const times: number[] = [];
    for (let i = 0; i < QUERIES; i++) {
      const x = (i * 13.37) % 1300;
      const y = (i * 7.77) % 1300;
      const t0 = performance.now();
      hitAt(index, x, y);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(QUERIES / 2)]!;
     
    console.log(
      `pointer-move meter: 10k shapes, median=${(median * 1000).toFixed(1)}us p90=${(times[Math.floor(QUERIES * 0.9)]! * 1000).toFixed(1)}us (bound 2ms)`,
    );
    expect(median).toBeLessThan(2);
  });
});
