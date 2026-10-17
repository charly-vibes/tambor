// Purpose: the dashboard-derived benchmark app (tambor-28k B7) — a
//   dashboard of ~20 derived tiles over one shared plain-data series
//   (500 numbers), mounted as an ordinary gallery demo through the
//   same makeApp/SPA mount path as every other corpus app.
// Responsibilities: DashboardState (series + bumps), SERIES_PATH/
//   BUMPS_PATH and the collect-one bump paths, seedSeries (500 fresh
//   numbers), bumpOne/bumpHundred (one / 100 series edits), the derive
//   helpers — summarize (one pass), medianOf/topThird (one sort),
//   histogram (8 buckets), thresholdFlags, rollingMean, deltaOf —
//   deriveTiles (the 20 tile lines), dashboardView (control row +
//   tile grid), and createDashboardDerivedApp.
// Rationale: the point of the benchmark is the honest cost of "many
//   derived values" over plain data — there is no memo, no computed,
//   no lazy: every tile is re-derived from the same series on every
//   view call, so one bumped element re-derives all ~20 reads (the
//   same whole-view re-derive the form-200 bench names as the weak
//   spot). No benchmark-specific fast paths: every op is an ordinary
//   ["update", …] intent applied by the registry-aware dispatcher;
//   the bump paths collect the bumps counter ahead of the series'
//   old value (state.paths collect_one, the save-restore-5k shape) so
//   the op reads what it needs from the dispatcher, never a closure.
//   The demo starts empty so "Seed" is the untimed setup op (scenario
//   dashboard-build) and Bump / Bump 100 cycle as the timed ops
//   (scenario dashboard-bump).

import {
  button,
  label as labelNode,
  spacer,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// The shared series the every tile reads (500 plain numbers).
export const SERIES_SIZE = 500;

// Histogram geometry: 8 equal buckets over the value range 0..1000.
export const BUCKET_COUNT = 8;
export const BUCKET_SIZE = 1000 / BUCKET_COUNT;

// The threshold flags' cuts.
export const ABOVE_THRESHOLD = 900;
export const BELOW_THRESHOLD = 100;

// The app state: plain data — the series and a bump counter (the
// counter only varies which indices a bump touches; it is never drawn).
export interface DashboardState {
  readonly series: readonly number[];
  readonly bumps: number;
}

export const SERIES_PATH: Path = [["keypath", "series"]];
export const BUMPS_PATH: Path = [["keypath", "bumps"]];

// Bump paths: collect-one reads the bumps counter ahead of the path's
// own old value (the dispatcher hands both to the op — save-restore's
// collect-one shape), so a bump never closes over the view.
export const BUMP_PATH: Path = [["collect-one", BUMPS_PATH], ["keypath", "series"]];
export const BUMP100_PATH: Path = [["collect-one", BUMPS_PATH], ["keypath", "series"]];

// The demo's initial state: nothing seeded — seeding is the untimed
// setup op.
export function dashboardState(): DashboardState {
  return { series: [], bumps: 0 };
}

// 500 deterministic, varied numbers spanning the buckets: a sine spine
// plus a sawtooth wobble, so every tile has something to read.
export function seedSeries(): readonly number[] {
  return Array.from({ length: SERIES_SIZE }, (_, i) => {
    const spine = 500 + 400 * Math.sin(i / 24);
    const wobble = ((i * 13) % 97) - 48;
    return Math.round(spine + wobble);
  });
}

// Bump one element: index and next value are pure functions of the
// counter and the series — deterministic, so tests can recompute.
export function bumpOp(count: unknown, series: unknown): readonly number[] {
  const s = series as readonly number[];
  if (s.length === 0) return s;
  const idx = (count as number) % s.length;
  const next = s.slice();
  next[idx] = ((next[idx] ?? 0) + 37 + (count as number)) % 1000;
  return next;
}

// Bump 100 elements: 100 distinct indices (gcd(7, 500) = 1 keeps the
// stride collision-free), each nudged by a fixed 53.
export function bump100Op(count: unknown, series: unknown): readonly number[] {
  const s = series as readonly number[];
  if (s.length === 0) return s;
  const next = s.slice();
  for (let j = 0; j < 100; j++) {
    const idx = ((count as number) + j * 7) % next.length;
    next[idx] = ((next[idx] ?? 0) + 53) % 1000;
  }
  return next;
}

// The bumps counter's increment (the bump buttons' second intent).
export function bumpTick(count: number): number {
  return count + 1;
}

// The one-pass summary: count, min, max, mean, stddev.
export interface Summary {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly stddev: number;
}

export function summarize(series: readonly number[]): Summary {
  let min = Infinity;
  let max = -Infinity;
  let total = 0;
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
    total += v;
  }
  const mean = series.length === 0 ? 0 : total / series.length;
  let sq = 0;
  for (const v of series) sq += (v - mean) * (v - mean);
  const stddev = series.length === 0 ? 0 : Math.sqrt(sq / series.length);
  return { count: series.length, min, max, mean, stddev };
}

// The median: one sorted copy (also serves the top-k read).
export function medianOf(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid] as number
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

// Top-k read: the 3rd-largest value (k = 3, the dashboard's "top-3rd").
export function topThird(sorted: readonly number[]): number {
  return sorted.length < 3 ? 0 : (sorted[sorted.length - 3] as number);
}

// The 8 histogram cells: counts per equal bucket over 0..1000.
export function histogram(series: readonly number[]): readonly number[] {
  const cells = Array.from({ length: BUCKET_COUNT }, () => 0);
  for (const v of series) {
    const cell = Math.min(BUCKET_COUNT - 1, Math.max(0, Math.floor(v / BUCKET_SIZE)));
    cells[cell] = (cells[cell] as number) + 1;
  }
  return cells;
}

// The threshold flags: how many read above 900 / below 100.
export function thresholdFlags(series: readonly number[]): readonly [number, number] {
  let above = 0;
  let below = 0;
  for (const v of series) {
    if (v > ABOVE_THRESHOLD) above++;
    if (v < BELOW_THRESHOLD) below++;
  }
  return [above, below];
}

// A rolling-window mean: the last w values (or the whole series).
export function rollingMean(series: readonly number[], w: number): number {
  if (series.length === 0) return 0;
  const start = Math.max(0, series.length - w);
  let total = 0;
  for (let i = start; i < series.length; i++) total += series[i] as number;
  return total / (series.length - start);
}

// The drift read: last minus first.
export function deltaOf(series: readonly number[]): number {
  return series.length < 2 ? 0 : (series[series.length - 1] as number) - (series[0] as number);
}

// One drawn tile line: name + one-decimal value.
function tile(name: string, value: number): string {
  return `${name} ${value.toFixed(1)}`;
}

// The ~20 derived tiles — every read the dashboard draws, recomputed
// from the same series on every call. Order is the draw order.
export function deriveTiles(series: readonly number[]): readonly string[] {
  const s = summarize(series);
  const sorted = [...series].sort((a, b) => a - b);
  const cells = histogram(series);
  const [above, below] = thresholdFlags(series);
  return [
    tile("count", s.count),
    tile("min", s.min),
    tile("max", s.max),
    tile("mean", s.mean),
    tile("stddev", s.stddev),
    tile("median", medianOf(sorted)),
    tile("top-3rd", topThird(sorted)),
    ...cells.map((c, i) => tile(`bucket${i}`, c)),
    tile("above900", above),
    tile("below100", below),
    tile("roll10", rollingMean(series, 10)),
    tile("roll50", rollingMean(series, 50)),
    tile("delta", deltaOf(series)),
  ];
}

// The tile grid: the 20 lines chunked into rows of five labels.
function tileGrid(tiles: readonly string[], fallback: Elem): Elem {
  const rows: Elem[] = [];
  for (let i = 0; i < tiles.length; i += 5) {
    rows.push(
      horizontalLayout(tiles.slice(i, i + 5).map((t) => labelNode(t))) as Elem,
    );
  }
  return (verticalLayout(rows) ?? fallback) as Elem;
}

// The dashboard view: the control row, a spacer, then the tile grid.
// The buttons' update intents route through the app's dispatcher; the
// tiles are pure view — all ~20 reads re-derive on every view call.
export function dashboardView(state: DashboardState): Elem {
  const controls = horizontalLayout([
    button("Seed", (): IntentList => [
      ["update", SERIES_PATH, () => seedSeries()],
      ["update", BUMPS_PATH, () => 0],
    ] as IntentList),
    spacer(5, 0),
    opButton("Bump", BUMP_PATH, bumpOp),
    spacer(5, 0),
    opButton("Bump 100", BUMP100_PATH, bump100Op),
  ]) as Elem;
  return tileGrid(deriveTiles(state.series), controls);
}

// One op button: an ordinary handler returning its plain-data update.
function opButton(
  text: string,
  path: Path,
  op: (...args: readonly unknown[]) => unknown,
): Elem {
  return button(text, (): IntentList => [["update", path, op]]);
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createDashboardDerivedApp(): App {
  return makeApp({
    view: (state) => dashboardView(state as DashboardState),
    state: dashboardState(),
    backend: { containerSize: VIEWPORT },
  });
}
