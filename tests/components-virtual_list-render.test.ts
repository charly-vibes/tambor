// Purpose: executable contract tests for the components-virtual_list spec
//   — summary state and drawn-window parity (count_summary_state,
//   drawn_window_only).
// Responsibilities: encode each row's generator and predicate as a
//   vitest + fast-check property, one test per property.
// Rationale: openspec/specs/components-virtual_list/spec.md is the design
//   authority; each predicate here mirrors a Properties row (generator +
//   predicate text). The drawn-window check derives its expected index
//   set independently (an O(count) intersection test over every row),
//   so the drawn slice is checked against arithmetic it does not share.
//   Geometry rows live in components-virtual_list-geometry.test.ts.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  contentExtent,
  windowFor,
  windowSummary,
} from "../src/components/virtual_list/index.ts";
import type { Vec2 } from "../src/views/model.ts";
import {
  drawnRows,
  intervalWindow,
  vlCall,
  vlView,
} from "./helpers/virtual_list.ts";

// p_summary — derives_from: components.virtual_list.count_summary_state
// generator: random extents and offsets
// predicate: the window state carries only numeric summaries — count,
// step, extent, offset, window — with no item list
it("p_summary: random extents → the window state carries only numeric summaries — count, step, extent, offset, window — with no item list", () => {
  // the offset prop defaults to [0, 0]
  expect(vlCall({ count: 5, rowHeight: 16, viewport: [300, 300] }).props["offset"]).toEqual([0, 0]);
  fc.assert(
    fc.property(
      fc.nat(60),
      fc.nat(20),
      fc.nat(5),
      fc.integer({ min: 1, max: 200 }),
      fc.nat(5),
      fc.nat(2000),
      (count, rowHeight, gap, viewportH, overscan, rawOy) => {
        const s = windowSummary(count, rowHeight, gap, rawOy, viewportH, overscan);
        expect(Object.keys(s).sort()).toEqual([
          "count",
          "extent",
          "first",
          "last",
          "offset",
          "step",
        ]);
        for (const v of Object.values(s)) {
          expect(typeof v).toBe("number");
          expect(Number.isFinite(v as number)).toBe(true);
        }
        expect(s.count).toBe(count);
        expect(s.step).toBe(rowHeight + gap);
      },
    ),
  );
});

// p_drawn — derives_from: components.virtual_list.drawn_window_only
// generator: random offsets over random extents
// predicate: exactly the window's rows are drawn at their arithmetic
// offsets — a contiguous slice of the whole-list positions
it("p_drawn: random offsets → exactly the window's rows are drawn at their arithmetic offsets — a contiguous slice of the whole-list positions", () => {
  fc.assert(
    fc.property(
      fc.nat(60),
      fc.nat(20),
      fc.nat(5),
      fc.integer({ min: 1, max: 200 }),
      fc.nat(5),
      fc.integer({ min: 0, max: 4000 }),
      (count, rowHeight, gap, viewportH, overscan, rawOy) => {
        if (count === 0) {
          // an empty list draws nothing
          expect(
            drawnRows(vlView({ count, rowHeight: 16, gap, overscan, viewport: [300, viewportH] })),
          ).toEqual([]);
          return;
        }
        const step = rowHeight + gap;
        // the viewport top inside a row's span (or clamped just inside
        // the last one), so the expected window is the intersect set
        // padded by the overscan — rowHeight ≥ 1 keeps the span non-empty
        const height = Math.max(1, rowHeight);
        const extent = contentExtent(count, height, gap);
        const k = rawOy % count;
        const oy = Math.min(extent - 1, step * k + (rawOy % height));
        const offset: Vec2 = [0, oy];
        const rows = drawnRows(
          vlView({ count, rowHeight: height, gap, overscan, offset, viewport: [300, viewportH] }),
        );
        // the expected window: the independent interval scan (see the
        // helper — exact even when the intersection is empty, where an
        // intersect-then-pad derivation would NaN on the empty set)
        const want = intervalWindow(count, height, gap, oy, viewportH, overscan);
        // the drawn indices are exactly that clamped window, contiguous
        // — no row outside the window is drawn
        expect(rows.map(([i]) => i)).toEqual(want);
        // each drawn row sits at its arithmetic offset
        for (const [i, y] of rows) {
          expect(y).toBe(i * (height + gap));
        }
      },
    ),
  );
  // draw parity: the drawn (index, absolute y) pairs are a slice of the
  // whole-list stack's positions
  const w = windowFor(500, 100, 100, 16, 1);
  expect(w).toEqual({ first: 29, last: 36 });
});
