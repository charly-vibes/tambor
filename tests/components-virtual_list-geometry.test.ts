// Purpose: executable contract tests for the components-virtual_list spec
//   — window geometry and scroll range (offsets_arithmetic,
//   window_half_open, overscan_pads_window, range_formula,
//   wheel_updates_offset, empty_window_zero).
// Responsibilities: encode each row's generator and predicate as a
//   vitest + fast-check property, one test per property.
// Rationale: openspec/specs/components-virtual_list/spec.md is the design
//   authority; each predicate here mirrors a Properties row (generator +
//   predicate text). The window check derives its expected index set
//   independently (an O(count) intersection test over every row), so
//   the closed form is checked against arithmetic it does not share.
//   No vacuous predicates: the contrasting cases (at-range ends, empty
//   inputs) are asserted where the row implies them. Rendering-side
//   rows (count_summary_state, drawn_window_only) live in
//   components-virtual_list-render.test.ts.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  contentExtent,
  rowOffset,
  windowFor,
  windowSummary,
} from "../src/components/virtual_list/index.ts";
import { wheelIntents } from "../src/components/scrollview/scrollview.ts";
import { scrollMax } from "../src/components/scrollview/geometry.ts";
import type { Vec2 } from "../src/views/model.ts";
import {
  intersecting,
  intervalWindow,
  OFFSET_PATH,
} from "./helpers/virtual_list.ts";

// --- generators ---------------------------------------------------------

const countArb = fc.nat(60);
const rowHeightArb = fc.nat(20);
const gapArb = fc.nat(5);
const viewportHArb = fc.integer({ min: 1, max: 200 });
const overscanArb = fc.nat(5);

// p_offsets — derives_from: components.virtual_list.offsets_arithmetic
// generator: random index, row height and gap
// predicate: row i sits at i*(row-height+gap) and the extent is the closed form
it("p_offsets: random index, row height and gap → row i sits at i*(row-height+gap) and the extent is the closed form", () => {
  expect(rowOffset(7, 16, 1)).toBe(119);
  expect(contentExtent(10, 16, 1)).toBe(169);
  fc.assert(
    fc.property(
      countArb,
      rowHeightArb,
      gapArb,
      fc.nat(60),
      (count, rowHeight, gap, i) => {
        expect(rowOffset(i, rowHeight, gap)).toBe(i * (rowHeight + gap));
        expect(contentExtent(count, rowHeight, gap)).toBe(
          count === 0 ? 0 : count * rowHeight + (count - 1) * gap,
        );
      },
    ),
  );
});

// p_window — derives_from: components.virtual_list.window_half_open
// generator: mid-scroll offsets over random extents
// predicate: the window covers exactly the rows intersecting the viewport,
// including the gap-boundary edges
it("p_window: mid-scroll offsets → the window covers exactly the rows intersecting the viewport, including the gap-boundary edges", () => {
  // the half-open boundary edges pinned explicitly: a viewport sitting
  // in the gap between rows covers none; its start exactly on a row
  // covers that row
  expect(windowFor(5, 1, 10, 1, 5)).toEqual({ first: 0, last: 0 });
  expect(windowFor(6, 1, 10, 1, 5)).toEqual({ first: 1, last: 2 });
  fc.assert(
    fc.property(
      countArb,
      rowHeightArb,
      gapArb,
      viewportHArb,
      fc.nat(5),
      (count, rowHeight, gap, viewportH, jitter) => {
        const step = rowHeight + gap;
        const extent = contentExtent(count, rowHeight, gap);
        const oy = Math.max(0, Math.min(extent, step * jitter + 3));
        const w = windowFor(oy, viewportH, count, rowHeight, gap);
        const expected = intersecting(count, rowHeight, gap, oy, viewportH);
        const first = expected[0] ?? 0;
        const last = (expected[expected.length - 1] ?? -1) + 1;
        expect([w.first, w.last]).toEqual([first, last]);
      },
    ),
  );
});

// p_overscan — derives_from: components.virtual_list.overscan_pads_window
// generator: overscan 2 over in-span offsets
// predicate: the window extends by 2 rows each side, clamped, and reaches
// the tail past the end
it("p_overscan: overscan 2 over in-span offsets → the window extends by 2 rows each side, clamped, and reaches the tail past the end", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 60 }),
      // rowHeight ≥ 1: the row-span domain (a zero-height row spans
      // nothing — the empty_window_zero row covers that degenerate)
      fc.integer({ min: 1, max: 20 }),
      gapArb,
      viewportHArb,
      fc.integer({ min: 0, max: 400 }),
      (count, rowHeight, gap, viewportH, rawOy) => {
        // the viewport top inside a row's span (row start k + remainder
        // r < rowHeight) — the bare window is non-empty, so the pad is
        // exactly the intersect set ± 2
        const step = rowHeight + gap;
        const extent = contentExtent(count, rowHeight, gap);
        const oy = Math.max(
          0,
          Math.min(extent - 1, step * (rawOy % count) + (rawOy % rowHeight)),
        );
        const w = windowFor(oy, viewportH, count, rowHeight, gap, 2);
        const hits = intersecting(count, rowHeight, gap, oy, viewportH);
        expect(hits.length).toBeGreaterThan(0);
        expect(w.first).toBe(Math.max(0, (hits[0] as number) - 2));
        expect(w.last).toBe(Math.min(count, (hits[hits.length - 1] as number) + 1 + 2));
        // clamped at the list edges
        expect(w.first).toBeGreaterThanOrEqual(0);
        expect(w.last).toBeLessThanOrEqual(count);
      },
    ),
  );
  // at the very top: first stays 0 even though the pad asks for −2
  expect(windowFor(0, 100, 50, 16, 1, 2)).toEqual({ first: 0, last: 8 });
  // scrolled past the content end: the pad reaches back to the tail rows
  expect(windowFor(contentExtent(50, 16, 1), 100, 50, 16, 1, 2)).toEqual({
    first: 48,
    last: 50,
  });
});

// p_gap_pad — derives_from: components.virtual_list.overscan_pads_empty
// generator: viewports that fit inside a row gap (no row intersects —
//   gap-boundary-aligned ends included) over overscan 0..3
// predicate: the pad hangs off the viewport edges — the adjacent rows
//   within one pitch per pad row, clamped; overscan 0 yields the empty
//   window. Never derived off an empty intersect set.
it("p_gap_pad: gap-interior offsets → the pad hangs off the viewport edges, never off an empty set", () => {
  // pinned explicitly: a viewport entirely inside the gap between rows
  // 1 and 2 ([6, 9) between spans [5, 6) and [10, 11)) with overscan 1
  // draws the rows adjacent on each side — rows 1 and 2
  expect(windowFor(6, 3, 10, 1, 4, 1)).toEqual({ first: 1, last: 3 });
  // a viewport exactly filling the gap ([6, 10), its end aligned on
  // row 2's start): no row intersects and overscan 0 yields the empty
  // window — the degenerate clamp, not a NaN hole
  expect(windowFor(6, 4, 10, 1, 4, 0)).toEqual({ first: 0, last: 0 });
  fc.assert(
    fc.property(
      fc.integer({ min: 3, max: 60 }),
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 60 }),
      fc.integer({ min: 0, max: 3 }),
      fc.nat(4000),
      (count, rowHeight, viewportH, overscan, raw) => {
        const gap = viewportH + 1 + (raw % 20); // gap > viewport height
        const pitch = rowHeight + gap;
        const i = raw % (count - 1); // the gap after row i
        // the offset inside that gap — boundary-aligned ends included
        const r = Math.floor(raw / 7) % (gap - viewportH + 1);
        const extent = contentExtent(count, rowHeight, gap);
        const oy = Math.min(extent - 1, i * pitch + rowHeight + r);
        const w = windowFor(oy, viewportH, count, rowHeight, gap, overscan);
        // the independent interval scan (shared with the render oracle)
        const want = intervalWindow(count, rowHeight, gap, oy, viewportH, overscan);
        expect([w.first, w.last]).toEqual(
          want.length === 0 ? [0, 0] : [want[0], (want[want.length - 1] as number) + 1],
        );
        // overscan ≥ 1 never leaves a blank viewport: the adjacent rows
        // are drawn on each side (the pad never hangs off an empty set)
        if (overscan >= 1) expect(want.length).toBeGreaterThan(0);
      },
    ),
  );
});

// p_range — derives_from: components.virtual_list.range_formula
// generator: extents 5000 over viewports 300 and 600
// predicate: max offset is 4700 and 4400
it("p_range: extents 5000 over viewports 300 and 600 → max offset is 4700 and 4400", () => {
  expect(scrollMax([300, 5000], [300, 300])[1]).toBe(4700);
  expect(scrollMax([300, 5000], [300, 600])[1]).toBe(4400);
  // the range law holds for every summary extent
  fc.assert(
    fc.property(fc.nat(60000), viewportHArb, (extent, viewportH) => {
      expect(scrollMax([300, extent], [300, viewportH])[1]).toBe(
        Math.max(0, extent - viewportH),
      );
    }),
  );
});

// p_wheel — derives_from: components.virtual_list.wheel_updates_offset
// generator: offset 0 and delta 50, offset at max and delta 50
// predicate: first updates to 50, second returns nothing
it("p_wheel: offset 0 and delta 50, offset at max and delta 50 → first updates to 50, second returns nothing", () => {
  const total: Vec2 = [300, 5000];
  const viewport: Vec2 = [300, 300];
  const atMax: Vec2 = [0, 4700];
  const down = wheelIntents([0, 0], [0, 50], total, viewport, OFFSET_PATH);
  expect(down.length).toBe(1);
  const moved = (down[0] as readonly unknown[])[2] as (old: unknown) => Vec2;
  expect(moved([0, 0])).toEqual([0, 50]);
  expect(wheelIntents(atMax, [0, 50], total, viewport, OFFSET_PATH)).toEqual([]);
});

// p_empty — derives_from: components.virtual_list.empty_window_zero
// generator: count 0, viewport 0 and step 0
// predicate: the window is empty, extent 0, finite, nothing drawn
it("p_empty: count 0, viewport 0 and step 0 → the window is empty, extent 0, finite, nothing drawn", () => {
  for (const w of [
    windowFor(0, 300, 0, 16, 1),
    windowFor(0, 0, 10, 16, 1),
    windowFor(0, 300, 10, 0, 0),
  ]) {
    expect(w).toEqual({ first: 0, last: 0 });
  }
  const s = windowSummary(0, 16, 1, 0, 300, 2);
  expect(s.extent).toBe(0);
});
