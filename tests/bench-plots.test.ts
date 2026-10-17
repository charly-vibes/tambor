// Purpose: contract tests for the interactive-plots bench app
//   (tambor-54j.14 BZ2) — the load, the naive pan/zoom ops and the
//   transform pan/zoom ops must be correct reads/edits of plain state
//   through the ordinary update-intent wire before the browser
//   scenario can be trusted to measure anything.
// Responsibilities: pin (a) makePoint's deterministic two-series rule
//   and makePoints' 100k length, (b) buildIndex's per-band min/max
//   against an independent recomputation, (c) the shape contract —
//   bandsFor over a grid-aligned window deep-equals sliceIndex over
//   the precomputed index band-for-band, so naive ≡ transform drawn
//   geometry, (d) the transform's data-by-reference property (the
//   drawn bands ARE index objects, the 100k points are never touched
//   and never copied), (e) the naive mode's window copy (the hazard it
//   represents), (f) the pan wrap + zoom floor arithmetic — warmup + 12
//   timed ops (13 clicks) land the scenarios' deterministic guard
//   windows (win 10000 for pan, w 10000 + win 0 for zoom),
//   (g) summaryLine's exact guard strings, (h) the drawn surface: the
//   loaded view draws ~1600 real path nodes (the decimation cost a
//   canvas layer would remove — checked, not eyeballed).
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op is a no-op produces overhead-only medians; each op's
//   product is checked against independent recomputation, and the
//   naive ≡ transform geometry contract is what makes the pan/zoom
//   scenario pair a measurement of work shape, not data divergence.

import { describe, it, expect } from "vitest";
import {
  BAND_COUNT,
  BAND_POINTS,
  PAN_STEP,
  PLOT_POINTS,
  WIN_W,
  ZOOM_MIN,
  bandsFor,
  buildIndex,
  loadOp,
  makePoint,
  makePoints,
  panNaiveOp,
  panStart,
  panTxOp,
  plotState,
  sliceIndex,
  summaryLine,
  zoomNaiveOp,
  zoomTxOp,
  zoomW,
  type Band,
  type PlotState,
} from "../src/examples/bench/plot-points.ts";
import { plotsView } from "../src/examples/bench/plots.ts";
import { scanOf } from "./helpers/scan.ts";

// Independent per-band min/max recomputation (not the app's helper).
function bandOfRange(
  points: ReturnType<typeof makePoints>,
  key: "a" | "b",
  start: number,
  end: number,
): readonly Band[] {
  const out: Band[] = [];
  for (let s = start; s < end; s += BAND_POINTS) {
    const slice = points.slice(s, s + BAND_POINTS);
    out.push({
      lo: Math.min(...slice.map((p) => p[key])),
      hi: Math.max(...slice.map((p) => p[key])),
    });
  }
  return out;
}

function bandsEqual(
  x: readonly Band[],
  y: readonly Band[],
): boolean {
  return (
    x.length === y.length &&
    x.every((b, i) => b.lo === y[i]!.lo && b.hi === y[i]!.hi)
  );
}

describe("plot points", () => {
  it("makePoint is deterministic: two-frequency sinusoids in ±1.3", () => {
    expect(makePoint(0)).toEqual({ x: 0, a: 0, b: 1 });
    const p = makePoint(1234);
    expect(p.x).toBe(1234);
    expect(p.a).toBe(Math.sin(1234 / 400) + 0.3 * Math.sin(1234 / 67));
    expect(p.b).toBe(Math.cos(1234 / 600) + 0.3 * Math.sin(1234 / 29));
    expect(Math.abs(p.a)).toBeLessThanOrEqual(1.3);
    expect(Math.abs(p.b)).toBeLessThanOrEqual(1.3);
  });

  it("makePoints builds exactly 100k shared-x points", () => {
    const points = makePoints();
    expect(points.length).toBe(PLOT_POINTS);
    expect(points[0]!.x).toBe(0);
    expect(points[PLOT_POINTS - 1]!.x).toBe(PLOT_POINTS - 1);
  });

  it("buildIndex matches an independent per-band min/max recomputation", () => {
    const points = makePoints().slice(0, 1000);
    const index = buildIndex(points, "a");
    expect(index.length).toBe(1000 / BAND_POINTS);
    expect(bandsEqual(index, bandOfRange(points, "a", 0, 1000))).toBe(true);
  });

  it("the index covers the full domain at BAND_POINTS granularity", () => {
    const points = makePoints();
    expect(buildIndex(points, "a").length).toBe(BAND_COUNT);
    expect(buildIndex(points, "b").length).toBe(BAND_COUNT);
  });
});

describe("the op-shape contract: naive ≡ transform drawn geometry", () => {
  it("bandsFor over a grid-aligned window equals sliceIndex band-for-band", () => {
    const points = makePoints();
    const indexA = buildIndex(points, "a");
    const indexB = buildIndex(points, "b");
    for (const start of [0, PAN_STEP, 2 * PAN_STEP, 5 * PAN_STEP]) {
      expect(
        bandsEqual(
          bandsFor(points, "a", start, start + WIN_W),
          sliceIndex(indexA, start, start + WIN_W),
        ),
      ).toBe(true);
      expect(
        bandsEqual(
          bandsFor(points, "b", start, start + WIN_W),
          sliceIndex(indexB, start, start + WIN_W),
        ),
      ).toBe(true);
    }
  });

  it("pan naive and pan tx leave identical drawn bands and view params", () => {
    let naive: PlotState = loadOp(plotState());
    let tx: PlotState = loadOp(plotState());
    for (let i = 0; i < 13; i++) {
      naive = panNaiveOp(naive);
      tx = panTxOp(tx);
      expect(bandsEqual(naive.drawA, tx.drawA)).toBe(true);
      expect(bandsEqual(naive.drawB, tx.drawB)).toBe(true);
      expect(tx.winStart).toBe(naive.winStart);
      expect(tx.winW).toBe(naive.winW);
      expect(tx.pans).toBe(naive.pans);
    }
  });

  it("zoom naive and zoom tx leave identical drawn bands and view params", () => {
    let naive: PlotState = loadOp(plotState());
    let tx: PlotState = loadOp(plotState());
    for (let i = 0; i < 13; i++) {
      naive = zoomNaiveOp(naive);
      tx = zoomTxOp(tx);
      expect(bandsEqual(naive.drawA, tx.drawA)).toBe(true);
      expect(bandsEqual(naive.drawB, tx.drawB)).toBe(true);
      expect(tx.winW).toBe(naive.winW);
    }
  });

  it("the transform mode takes data by reference (no point copies, index objects reused)", () => {
    const fresh = loadOp(plotState());
    const points = fresh.points;
    const tx = panTxOp(fresh);
    expect(tx.points).toBe(points); // shared reference, never copied
    expect(tx.window).toEqual([]); // no window copy in transform mode
    // The drawn bands ARE the index's band objects (slice, not clone).
    expect(tx.drawA[0]).toBe(fresh.indexA[tx.winStart / BAND_POINTS]);
  });

  it("the naive mode copies the window (the §4.3 copying hazard) and rebuilds bands", () => {
    const fresh = loadOp(plotState());
    const naive = panNaiveOp(fresh);
    expect(naive.window.length).toBe(fresh.winW); // 40k points copied
    expect(naive.window[0]!.x).toBe(naive.winStart);
    expect(naive.drawA.length).toBe(fresh.winW / BAND_POINTS);
    // Fresh band objects, not index references.
    expect(naive.drawA[0]).not.toBe(fresh.indexA[naive.winStart / BAND_POINTS]);
  });
});

describe("pan wrap + zoom floor (the scenarios' guard arithmetic)", () => {
  it("panStart wraps over the slideable range", () => {
    const s = plotState(); // winW = WIN_W → range 60000
    expect(panStart(s)).toBe(PAN_STEP);
    expect(panStart({ ...s, winStart: 5 * PAN_STEP })).toBe(0); // 60000 % 60000
  });

  it("zoomW halves and floors at ZOOM_MIN", () => {
    expect(zoomW(WIN_W)).toBe(WIN_W / 2);
    expect(zoomW(ZOOM_MIN)).toBe(ZOOM_MIN);
  });

  it("13 pan clicks (warmup + 12 ops) land the guarded window win 10000", () => {
    let s: PlotState = loadOp(plotState());
    for (let i = 0; i < 13; i++) s = panNaiveOp(s);
    expect(s.winStart).toBe(10_000);
    expect(s.winW).toBe(WIN_W);
    expect(s.pans).toBe(13);
    expect(summaryLine(s)).toBe("pts 100000 win 10000 w 40000 pans 13");
  });

  it("13 transform pan clicks land the same guarded window", () => {
    let s: PlotState = loadOp(plotState());
    for (let i = 0; i < 13; i++) s = panTxOp(s);
    expect(s.winStart).toBe(10_000);
    expect(summaryLine(s)).toBe("pts 100000 win 10000 w 40000 pans 13");
  });

  it("13 zoom clicks floor at w 10000 with win 0", () => {
    let s: PlotState = loadOp(plotState());
    for (let i = 0; i < 13; i++) s = zoomNaiveOp(s);
    expect(s.winW).toBe(ZOOM_MIN);
    expect(s.winStart).toBe(0);
    expect(summaryLine(s)).toBe("pts 100000 win 0 w 10000 pans 13");
  });

  it("13 transform zoom clicks land the same guarded window", () => {
    let s: PlotState = loadOp(plotState());
    for (let i = 0; i < 13; i++) s = zoomTxOp(s);
    expect(s.winW).toBe(ZOOM_MIN);
    expect(summaryLine(s)).toBe("pts 100000 win 0 w 10000 pans 13");
  });

  it("summaryLine reads 'no data' before the load", () => {
    expect(summaryLine(plotState())).toBe("no data");
  });
});

describe("the drawn surface", () => {
  it("the loaded view draws ~1600 real path nodes (both linked charts)", () => {
    const view = plotsView(loadOp(plotState()));
    const paths = scanOf(view).filter((f) => f.node.type === "path");
    expect(paths.length).toBe((WIN_W / BAND_POINTS) * 2);
  });

  it("an empty view draws no paths and reads no data", () => {
    const view = plotsView(plotState());
    expect(scanOf(view).filter((f) => f.node.type === "path").length).toBe(0);
    expect(scanOf(view).some((f) => f.node.type === "label" && f.node.text === "no data")).toBe(true);
  });

  it("the transform pan's view is over the sliced bands (same path count as naive)", () => {
    const naive = panNaiveOp(loadOp(plotState()));
    const tx = panTxOp(loadOp(plotState()));
    const count = (s: PlotState) =>
      scanOf(plotsView(s)).filter((f) => f.node.type === "path").length;
    expect(count(tx)).toBe(count(naive));
  });
});
