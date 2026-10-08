// Purpose: executable contract tests for the components-scrollview spec —
//   pointer clipping and touch scrolling (clip_events,
//   touch_drag_scrolls, momentum).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-scrollview.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text).
//   No vacuous predicates: every check encodes its row's stated behavior,
//   with the contrasting in-range case asserted where the row implies it.
//   Shared harness helpers live in tests/helpers/scrollview.ts
//   (tambor-272 redistributed the former monolithic
//   tests/components-scrollview.test.ts into topic files).

import { expect, it } from "vitest";
import fc from "fast-check";

import { dragScrollf, momentumFrames } from "../src/components/scrollview/scrollview.ts";
import { clampScalar } from "../src/components/scrollview/geometry.ts";
import { on, rectangle, translate, type Elem, type Vec2 } from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import { OFFSET_PATH, applyUpdate, svView } from "./helpers/scrollview.ts";

// p_clip — derives_from: components.scrollview.clip_events
// generator: pointer outside the viewport over clipped content
// predicate: no intents
it("p_clip: pointer outside the viewport over clipped content → no intents", () => {
  const body: Elem = [
    on("mouse-down", () => [["near"]], rectangle(150, 150)),
    translate(0, 300, on("mouse-down", () => [["far"]], rectangle(150, 150))),
  ];
  const view = svView({ viewport: [200, 200], body });
  // inside the viewport the content is routed normally
  expect(dispatch(view, mouseDown([10, 10]))).toEqual([["near"]]);
  // outside the viewport the clipped content receives nothing
  expect(dispatch(view, mouseDown([10, 350]))).toEqual([]);
  fc.assert(
    fc.property(
      fc
        .tuple(fc.integer({ min: -100, max: 400 }), fc.integer({ min: -100, max: 400 }))
        // the vertical bar sits outside the viewport too; the row is
        // about clipped *content*, so the bar region is excluded
        .filter(
          ([x, y]) =>
            (x < 0 || x >= 200 || y < 0 || y >= 200) &&
            !(x >= 200 && x < 207 && y >= 0 && y < 200),
        ),
      (pos) => {
        expect(dispatch(view, mouseDown(pos))).toEqual([]);
      },
    ),
  );
});

// p_touch_scroll — derives_from: components.scrollview.touch_drag_scrolls
// generator: touch drag of 30 px
// predicate: offset changes by 30 within range
it("p_touch_scroll: touch drag of 30 px → offset changes by 30 within range", () => {
  const f = dragScrollf([50, 50], [500, 500], [200, 200], OFFSET_PATH);
  const intents = f([0, 30]);
  expect(intents.length).toBe(1);
  expect(applyUpdate(intents, { offset: [50, 50] })).toEqual({ offset: [50, 80] });
  // generalized: the drag delta is applied within the range
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 300 })),
      fc.tuple(fc.integer({ min: -60, max: 60 }), fc.integer({ min: -60, max: 60 })),
      (offset, delta) => {
        const g = dragScrollf(offset, [500, 500], [200, 200], OFFSET_PATH);
        const applied = applyUpdate(g(delta), { offset });
        expect(applied).toEqual({
          offset: [
            clampScalar(offset[0] + delta[0], 300),
            clampScalar(offset[1] + delta[1], 300),
          ],
        });
      },
    ),
  );
});

// p_momentum — derives_from: components.scrollview.momentum
// generator: flick then rest
// predicate: offset keeps changing then settles, and is static under reduced motion
it("p_momentum: flick then rest → offset keeps changing then settles, static under reduced motion", () => {
  const frames = momentumFrames([0, 0], [0, 40], [500, 500], [200, 200], false);
  // keeps changing
  expect(frames.length).toBeGreaterThanOrEqual(2);
  let prev: Vec2 = [0, 0];
  for (const f of frames) {
    expect(f[0]).toBeGreaterThanOrEqual(0);
    expect(f[0]).toBeLessThanOrEqual(300);
    expect(f[1]).toBeGreaterThanOrEqual(0);
    expect(f[1]).toBeLessThanOrEqual(300);
    expect(f).not.toEqual(prev);
    prev = f;
  }
  // settles at the range end
  expect(frames[frames.length - 1]).toEqual([0, 300]);
  // static under reduced motion
  expect(momentumFrames([0, 0], [0, 40], [500, 500], [200, 200], true)).toEqual([]);
  // a gentle flick settles by decay, not by hitting the end
  const decayed = momentumFrames([0, 0], [0, 0.5], [100000, 100000], [200, 200], false);
  expect(decayed.length).toBeGreaterThanOrEqual(2);
  expect(decayed.length).toBeLessThan(600);
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 300 })),
      fc.tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 })),
      (start, velocity) => {
        const fs = momentumFrames(start, velocity, [500, 500], [200, 200], false);
        let p: Vec2 = start;
        for (const f of fs) {
          expect(f[0]).toBeGreaterThanOrEqual(0);
          expect(f[0]).toBeLessThanOrEqual(300);
          expect(f[1]).toBeGreaterThanOrEqual(0);
          expect(f[1]).toBeLessThanOrEqual(300);
          expect(f).not.toEqual(p);
          p = f;
        }
      },
    ),
  );
});
