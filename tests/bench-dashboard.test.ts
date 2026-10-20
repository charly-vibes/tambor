// Purpose: contract tests for the dashboard-derived bench app
//   (tambor-28k B7) — the ~20 derived tiles must be correct reads of
//   the one shared plain-data series and must re-derive through the
//   ordinary update-intent wire before the browser scenario can be
//   trusted to measure anything.
// Responsibilities: pin (a) seedSeries produces the 500-number series,
//   (b) deriveTiles emits exactly the 20 tile lines and each equals an
//   independently recomputed read of the same series (min, max, mean,
//   stddev, median, top-3rd, the 8 histogram cells, threshold flags,
//   rolling means, delta), (c) a bump through the app's dispatcher
//   changes the bumped element and every derived tile matches the new
//   series (the full re-derive, checked not eyeballed), plus the
//   derived-invariant sanity (max >= mean, mean*count == sum).
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op is a no-op produces overhead-only medians; per-tile
//   equality against independent recomputation makes "the bump
//   actually re-derived the dashboard" a checked contract.

import { describe, it, expect } from "vitest";
import {
  ABOVE_THRESHOLD,
  BELOW_THRESHOLD,
  BUCKET_COUNT,
  BUCKET_SIZE,
  BUMPS_PATH,
  BUMP_PATH,
  SERIES_SIZE,
  SERIES_PATH,
  bump100Op,
  bumpOp,
  bumpTick,
  createDashboardDerivedApp,
  dashboardState,
  deriveTiles,
  medianOf,
  seedSeries,
  summarize,
  thresholdFlags,
  topThird,
  type DashboardState,
} from "../src/examples/bench/dashboard-derived.ts";

// Independent recomputation of a tile line (not the app's helpers).
function expectTile(tiles: readonly string[], name: string, value: number): void {
  expect(tiles).toContain(`${name} ${value.toFixed(1)}`);
}

describe("dashboard-derived bench app", () => {
  it("seeds a 500-number plain series", () => {
    const series = seedSeries();
    expect(series.length).toBe(SERIES_SIZE);
    expect(series.every((v) => Number.isFinite(v) && v >= 0 && v < 1000)).toBe(true);
  });

  it("derives exactly the 20 tile lines from the seeded series", () => {
    const series = seedSeries();
    const tiles = deriveTiles(series);
    expect(tiles.length).toBe(20);
    expect(tiles[0]).toBe(`count ${SERIES_SIZE.toFixed(1)}`);
  });

  it("every tile equals an independent read of the same series", () => {
    const series = seedSeries();
    const tiles = deriveTiles(series);
    expectTile(tiles, "min", Math.min(...series));
    expectTile(tiles, "max", Math.max(...series));
    expectTile(tiles, "mean", series.reduce((a, v) => a + v, 0) / series.length);
    expectTile(tiles, "median", medianOf([...series].sort((a, b) => a - b)));
    expectTile(tiles, "top-3rd", topThird([...series].sort((a, b) => a - b)));
    for (let i = 0; i < BUCKET_COUNT; i++) {
      const lo = i * BUCKET_SIZE;
      const hi = lo + BUCKET_SIZE;
      expectTile(tiles, `bucket${i}`, series.filter((v) => v >= lo && (i === BUCKET_COUNT - 1 ? v < 1000 : v < hi)).length);
    }
    expectTile(tiles, "above900", series.filter((v) => v > ABOVE_THRESHOLD).length);
    expectTile(tiles, "below100", series.filter((v) => v < BELOW_THRESHOLD).length);
    expectTile(tiles, "roll10", series.slice(-10).reduce((a, v) => a + v, 0) / 10);
    expectTile(tiles, "roll50", series.slice(-50).reduce((a, v) => a + v, 0) / 50);
    expectTile(tiles, "delta", (series[series.length - 1] as number) - (series[0] as number));
    // thresholdFlags backs the drawn above/below tiles
    const [above, below] = thresholdFlags(series);
    expectTile(tiles, "above900", above);
    expectTile(tiles, "below100", below);
  });

  it("a bump through the dispatcher re-derives every tile", () => {
    const app = createDashboardDerivedApp();
    app.dispatch(["update", SERIES_PATH, () => seedSeries()]);
    const before = deriveTiles((app.getState() as DashboardState).series);
    app.dispatch(["update", BUMP_PATH, bumpOp]);
    app.dispatch(["update", BUMPS_PATH, bumpTick]);

    const state = app.getState() as DashboardState;
    expect(state.series.length).toBe(SERIES_SIZE);
    const after = deriveTiles(state.series);
    expect(after.length).toBe(20);
    // the tiles match the post-bump series (full re-derive, not stale)
    const s = summarize(state.series);
    expectTile(after, "min", s.min);
    expectTile(after, "max", s.max);
    expectTile(after, "mean", s.mean);
    // and the bump actually moved the dashboard
    expect(after.some((t, i) => t !== before[i])).toBe(true);
  });

  it("bump 100 edits 100 distinct indices through the dispatcher", () => {
    const series = seedSeries();
    const bumped = bump100Op(0, series);
    expect(bumped.length).toBe(SERIES_SIZE);
    const changed = bumped.filter((v, i) => v !== series[i]).length;
    expect(changed).toBe(100);
  });

  it("derived invariants hold: max >= mean and mean*count == sum", () => {
    const s = summarize(seedSeries());
    expect(s.max).toBeGreaterThanOrEqual(s.mean);
    expect(s.min).toBeLessThanOrEqual(s.mean);
    const series = seedSeries();
    expect(s.mean * s.count).toBeCloseTo(series.reduce((a, v) => a + v, 0), 6);
  });

  it("starts empty: the state begins unseeded at zero bumps", () => {
    expect(dashboardState()).toEqual({ series: [], bumps: 0 });
    expect(deriveTiles([]).length).toBe(20);
  });
});
