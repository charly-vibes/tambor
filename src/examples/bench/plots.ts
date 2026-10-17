// Purpose: the interactive-plots bench app (tambor-54j.14) — BZ2 of
//   the bench business suite: two linked charts (series A and B) over
//   one 100k-point shared x domain, mounted as an ordinary gallery
//   demo through the same makeApp/SPA mount path as every other
//   corpus app.
// Responsibilities: CHART_W/CHART_H + the chart geometry (band →
//   vertical min/max line, the standard decimated-line drawing),
//   plotsView (two control rows + summary line + the two linked
//   charts sharing the window), and createPlotsApp.
// Rationale: the op shapes live in plot-points.ts (naive re-derive +
//   copy vs transform slice over the precomputed index); this file is
//   only the view over plain state. The linked charts share the SAME
//   window: one pan/zoom op re-draws both from the same band slice —
//   the §4.3 "linked charts" row requirement. Every band is a real
//   drawn path node (the honest draw cost a canvas layer would remove
//   — that candidate is evaluated in benchmarks/findings-bz.md against
//   this app's numbers), so the drawn surface reflects the decimated
//   chart the ops re-derive or slice.

import {
  button,
  label as labelNode,
  path as pathNode,
  spacer,
  translate,
  withColor,
  type Color,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import {
  plotState,
  summaryLine,
  loadOp,
  panNaiveOp,
  panTxOp,
  zoomNaiveOp,
  zoomTxOp,
  type Band,
  type PlotState,
} from "./plot-points.ts";

// The whole-state path: one pan/zoom moves the window, the pans
// counter and BOTH charts together (the stream-dashboard shape).
export const STATE_PATH: Path = [] as unknown as Path;

// Chart geometry: 280×90 px each, drawn at x 10 inside the 300×300
// viewport (two charts + controls + summary fit the stage).
export const CHART_W = 280;
export const CHART_H = 90;

// The series colors (normalized RGB triples, the corpus Color shape).
export const COLOR_A: Color = [0.1, 0.3, 0.9];
export const COLOR_B: Color = [0.9, 0.3, 0.1];

// The value → pixel mapping: ±1.3 signals map to ±39 px around mid.
function yOf(v: number): number {
  return CHART_H / 2 - v * 30;
}

// One band drawn as the vertical min/max line at its window column —
// the decimated-line chart: 800 real path nodes per chart per frame.
function bandLine(band: Band, i: number, n: number, color: Color): Elem {
  const x = Math.round((i * CHART_W) / n);
  const line = pathNode([x, yOf(band.lo)], [x, yOf(band.hi)]);
  return withColor(color, line as Elem);
}

// One chart: the window's bands superimposed at the chart origin (the
// turtle-canvas shape — bare list inside one translate, layout would
// stack the columns, which is not the chart's geometry).
function chart(bands: readonly Band[], color: Color): Elem {
  const columns = bands.map((band, i) => bandLine(band, i, bands.length, color));
  return translate(10, 0, columns) as Elem;
}

// One op button: an ordinary handler returning its plain-data update.
function opButton(text: string, op: (state: PlotState) => PlotState): Elem {
  return button(text, (): IntentList => [["update", STATE_PATH, op]]);
}

// The control rows: Load (the setup/build op) + the four pan/zoom
// shapes. Two rows — five buttons overflow the 300px viewport's
// single row (the log-stream note).
function controlRows(): readonly Elem[] {
  const row1 = horizontalLayout([
    opButton("Load 100k", loadOp),
    spacer(5, 0),
    opButton("Pan naive", panNaiveOp),
    spacer(5, 0),
    opButton("Pan tx", panTxOp),
  ]) as Elem;
  const row2 = horizontalLayout([
    opButton("Zoom naive", zoomNaiveOp),
    spacer(5, 0),
    opButton("Zoom tx", zoomTxOp),
  ]) as Elem;
  return [row1, spacer(0, 4), row2] as readonly Elem[];
}

// The plots view: the control rows, the summary line, then the two
// linked charts over the same window (the naive mode's draw bands are
// fresh per-op arrays; the transform mode's are index slices — the
// view cannot tell the difference, that is the point).
export function plotsView(state: PlotState): Elem {
  const summary = labelNode(summaryLine(state)) as Elem;
  const titleA = labelNode(
    state.points.length === 0 ? "A no data" : `A ${state.drawA.length} bands`,
  ) as Elem;
  const titleB = labelNode(
    state.points.length === 0 ? "B no data" : `B ${state.drawB.length} bands`,
  ) as Elem;
  const body = [
    ...controlRows(),
    spacer(0, 4),
    summary,
    spacer(0, 4),
    titleA,
    chart(state.drawA, COLOR_A),
    titleB,
    chart(state.drawB, COLOR_B),
  ] as readonly Elem[];
  return (verticalLayout(body) ?? summary) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createPlotsApp(): App {
  return makeApp({
    view: (state) => plotsView(state as PlotState),
    state: plotState(),
    backend: { containerSize: VIEWPORT },
  });
}
