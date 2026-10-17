// Purpose: the plot-data half of the interactive-plots bench app
//   (tambor-54j.14) — BZ2 of the bench business suite: 100k points
//   shared BY REFERENCE by two linked charts, a precomputed band index
//   (the spatial-index candidate) and the two pan/zoom op shapes — the
//   NAIVE mode (re-derive the window decimation from raw points and
//   copy the window per op: the §4.3 BZ2 hazards "re-deriving while
//   panning; copying point data") and the TRANSFORM mode (pan/zoom as
//   a slice + translate of the precomputed bands, no pass over the
//   100k points at all).
// Responsibilities: Point/Band/PlotState (plain data), PLOT_POINTS/
//   BAND_POINTS/WIN_W/PAN_STEP/ZOOM_MIN, makePoint/makePoints
//   (deterministic two-series signal over a shared x axis), buildIndex
//   (one pass over the full domain — the index the Load op pays for
//   once), bandsFor (the naive per-window decimation), sliceIndex (the
//   transform's band slice), panStart/zoomW (the pan wrap + zoom half
//   rules), loadOp and the four op shapes (pan naive/tx, zoom naive/
//   tx), summaryLine.
// Rationale: the naive and transform ops are pinned to leave the SAME
//   drawn geometry — the window is always aligned to the fixed
//   BAND_POINTS grid (PAN_STEP and every WIN_W are grid multiples), so
//   bandsFor over the window's raw points equals sliceIndex over the
//   precomputed index band-for-band (tests/bench-plots.test.ts, the
//   same "same final state, different shape" contract the BZ1 lane
//   pinned for its dispatch-shape pair). The difference between the
//   two op shapes is therefore pure work shape: a full pass + copy of
//   the window's 40k points vs a slice of 800 small band objects that
//   stay BY REFERENCE. Pan wraps over the slideable range
//   (PLOT_POINTS − WIN_W) with PAN_STEP steps, so warmup + 12 timed
//   ops land at a deterministic window (the expectedText guard).

// The shared x domain: 100k points, both charts read the same array.
export const PLOT_POINTS = 100_000;

// The decimation grid: bands of 50 points over the full domain — the
// spatial index granularity (2000 bands; a 40k window slices 800).
export const BAND_POINTS = 50;
export const BAND_COUNT = PLOT_POINTS / BAND_POINTS;

// The initial window width (40k of the 100k points on screen).
export const WIN_W = 40_000;

// One pan op slides the window 10k (10% of the domain).
export const PAN_STEP = 10_000;

// Zoom floors at 10k (200 bands) — past that the drawn density stops
// growing, so the scenario's zoom cycle saturates deterministically.
export const ZOOM_MIN = 10_000;

// The two linked series: both charts share one x axis and one window.
export type SeriesKey = "a" | "b";

// One point: the shared x (the index) and the two series' values.
export interface Point {
  readonly x: number;
  readonly a: number;
  readonly b: number;
}

// One decimation band: the series' min/max over BAND_POINTS points.
export interface Band {
  readonly lo: number;
  readonly hi: number;
}

// The app state: plain data — the shared points (by reference), the
// two full-domain indexes, the drawn window bands (what the charts
// actually draw), the naive mode's copied window, and the view params.
export interface PlotState {
  readonly points: readonly Point[];
  readonly indexA: readonly Band[];
  readonly indexB: readonly Band[];
  readonly drawA: readonly Band[];
  readonly drawB: readonly Band[];
  /** the naive mode's per-op window copy (empty in transform mode) */
  readonly window: readonly Point[];
  readonly winStart: number;
  readonly winW: number;
  readonly pans: number;
}

// The demo's initial state: no data — the Load op builds everything
// the scenarios then pan/zoom over.
export function plotState(): PlotState {
  return {
    points: [],
    indexA: [],
    indexB: [],
    drawA: [],
    drawB: [],
    window: [],
    winStart: 0,
    winW: WIN_W,
    pans: 0,
  };
}

// The deterministic signal: a two-frequency sinusoid per series (fast
// ripple + slow drift), range within ±1.3 so the chart maps stay
// inside their pixel box without clamping.
export function makePoint(id: number): Point {
  const a = Math.sin(id / 400) + 0.3 * Math.sin(id / 67);
  const b = Math.cos(id / 600) + 0.3 * Math.sin(id / 29);
  return { x: id, a, b };
}

// The 100k shared points.
export function makePoints(): readonly Point[] {
  return Array.from({ length: PLOT_POINTS }, (_, i) => makePoint(i));
}

// The band index of point i over the fixed full-domain grid.
function bandOf(i: number): number {
  return Math.floor(i / BAND_POINTS);
}

// One pass over a series: per-band min/max (the spatial index the
// Load op builds once — the naive mode rebuilds its window's version
// of this on every pan instead).
export function buildIndex(
  points: readonly Point[],
  key: SeriesKey,
): readonly Band[] {
  const bands: Band[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const v = points[i]![key];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (bandOf(i) !== bandOf(i + 1)) {
      bands.push({ lo, hi });
      lo = Infinity;
      hi = -Infinity;
    }
  }
  return bands;
}

// The NAIVE decimation: a fresh pass over the window's raw points,
// binned by the SAME fixed grid (so the drawn geometry is identical
// to the index slice — the pinned contract). Requires start/end grid
// aligned (PAN_STEP, WIN_W and ZOOM_MIN all are).
export function bandsFor(
  points: readonly Point[],
  key: SeriesKey,
  start: number,
  end: number,
): readonly Band[] {
  const count = (end - start) / BAND_POINTS;
  const los = new Array<number>(count).fill(Infinity);
  const his = new Array<number>(count).fill(-Infinity);
  for (let i = start; i < end; i++) {
    const j = bandOf(i) - start / BAND_POINTS;
    const v = points[i]![key];
    if (v < los[j]!) los[j] = v;
    if (v > his[j]!) his[j] = v;
  }
  return los.map((lo, j) => ({ lo, hi: his[j]! }));
}

// The TRANSFORM's slice: the window's bands come out of the
// precomputed index by reference — the 100k points are never touched.
export function sliceIndex(
  index: readonly Band[],
  start: number,
  end: number,
): readonly Band[] {
  return index.slice(start / BAND_POINTS, end / BAND_POINTS);
}

// Pan slides PAN_STEP right, wrapping over the slideable range so the
// window always covers valid points (warmup + 12 timed ops of the
// scenarios = 13 steps → a deterministic final window).
export function panStart(state: PlotState): number {
  const range = PLOT_POINTS - state.winW;
  return (state.winStart + PAN_STEP) % range;
}

// Zoom halves the window width, floored at ZOOM_MIN (anchored at the
// window's left edge: winStart never moves in a zoom).
export function zoomW(winW: number): number {
  return Math.max(ZOOM_MIN, winW / 2);
}

// --- the ops (one Load + the 2×2 naive/transform pan/zoom shapes) -----

// The Load op: 100k points BY REFERENCE (both charts read the same
// array — no per-chart copy), the two full-domain indexes built once,
// and the initial window drawn from the fresh index.
export function loadOp(state: PlotState): PlotState {
  const points = makePoints();
  const indexA = buildIndex(points, "a");
  const indexB = buildIndex(points, "b");
  return {
    ...state,
    points,
    indexA,
    indexB,
    drawA: sliceIndex(indexA, 0, WIN_W),
    drawB: sliceIndex(indexB, 0, WIN_W),
    window: [],
    winStart: 0,
    winW: WIN_W,
    pans: 0,
  };
}

// The NAIVE pan: slide the window, copy it (the "copying point data"
// hazard) and re-derive the decimation from the raw points (the
// "re-deriving while panning" hazard) — for both linked charts.
export function panNaiveOp(state: PlotState): PlotState {
  const winStart = panStart(state);
  const end = winStart + state.winW;
  return {
    ...state,
    winStart,
    pans: state.pans + 1,
    window: state.points.slice(winStart, end),
    drawA: bandsFor(state.points, "a", winStart, end),
    drawB: bandsFor(state.points, "b", winStart, end),
  };
}

// The TRANSFORM pan: the same new window, but the drawn bands are a
// slice of the precomputed index — no pass over the points, no copy.
export function panTxOp(state: PlotState): PlotState {
  const winStart = panStart(state);
  const end = winStart + state.winW;
  return {
    ...state,
    winStart,
    pans: state.pans + 1,
    window: [],
    drawA: sliceIndex(state.indexA, winStart, end),
    drawB: sliceIndex(state.indexB, winStart, end),
  };
}

// The NAIVE zoom: halve the window, copy it, re-derive its bands.
export function zoomNaiveOp(state: PlotState): PlotState {
  const winW = zoomW(state.winW);
  const end = state.winStart + winW;
  return {
    ...state,
    winW,
    pans: state.pans + 1,
    window: state.points.slice(state.winStart, end),
    drawA: bandsFor(state.points, "a", state.winStart, end),
    drawB: bandsFor(state.points, "b", state.winStart, end),
  };
}

// The TRANSFORM zoom: the same new window, sliced from the index.
export function zoomTxOp(state: PlotState): PlotState {
  const winW = zoomW(state.winW);
  const end = state.winStart + winW;
  return {
    ...state,
    winW,
    pans: state.pans + 1,
    window: [],
    drawA: sliceIndex(state.indexA, state.winStart, end),
    drawB: sliceIndex(state.indexB, state.winStart, end),
  };
}

// The summary line — the scenarios' expectedText guards read the
// window/w pans fields ("pts 100000 win 10000 w 40000 pans 13").
export function summaryLine(state: PlotState): string {
  if (state.points.length === 0) return "no data";
  return `pts ${state.points.length} win ${state.winStart} w ${state.winW} pans ${state.pans}`;
}
