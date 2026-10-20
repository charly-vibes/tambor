// Purpose: the pure view of the B9 reactive notebook demo (tambor-54j.9)
//   — a function of NotebookState (and the focus context) and nothing
//   else: the stats bar (ran/total · compute ms · mode), the control
//   rows (+cell, +200 chained, +200 fan-out, +100 heavy, Mode, Kill,
//   Reset), and one card per cell (defines/reads chips, the corpus
//   textarea bound to the cell's src path, and the output — slider when
//   the cell is a slider definition, error label, plot polyline, or the
//   formatted value).
// Responsibilities: notebookView + the card/plot/format helpers; the
//   intent-returning buttons (plain effect vectors — the keyed-table op
//   shape); the slider calls bound to sliderNumPath/sliderMdownPath;
//   the textarea calls bound to cellSrcPath/cellExtraPath with the
//   stored per-cell scratch (cursor state survives re-derivation — it
//   lives in ::extra, plain state).
// Rationale: the artifact's card layout ported to tambor's real view
//   vocabulary — label/button/textarea/slider/path instead of the
//   mini-port's DOM h() — with the same information density (chips,
//   per-cell errors, value formatting). Plots decimate to ≤300 points
//   and draw as one path node; values format scalars to 6 significant
//   digits and arrays to a 4-sample preview (the artifact's fmt).

import {
  button,
  label as labelNode,
  path as pathNode,
  spacer,
  type Elem,
  type Vec2,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import { textarea } from "../../components/textarea/textarea.ts";
import { initialTextareaExtra, type TextareaExtra } from "../../components/textarea/edit.ts";
import { slider } from "../../components/numeric/slider.ts";
import { call, render } from "../../model/component.ts";
import { currentLabelMeasure } from "../../views/nodes.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import type { Cell, OutEntry, Val } from "./notebook-core.ts";

// The drawn root's width (spa/mount.ts pins the surface to VIEWPORT[0] =
// 300): a label measured wider than the space left at its x origin
// overflows the root — the tambor-194 finding (the e2e guard at 380px
// caught scrollWidth 317 on chromium, 300 on the author's fonts). Every
// long-text label is clamped to its measured pixel budget with the SAME
// measure the layout math uses (currentLabelMeasure, tambor-0rp), so the
// bound holds whatever font renders it — truncating to a prefix + "…"
// when the string can't fit its column.
const COLUMN = VIEWPORT[0];

function clampText(text: string, budget: number): string {
  const measure = currentLabelMeasure();
  if ((measure(text)[0] ?? 0) <= budget) return text;
  let n = text.length;
  while (n > 0 && (measure(`${text.slice(0, n)}…`)[0] ?? 0) > budget) n -= 1;
  return `${text.slice(0, n)}…`;
}
import {
  cellExtraPath,
  cellSrcPath,
  sliderMdownPath,
  sliderNumPath,
  type NotebookState,
} from "./notebook-state.ts";

export const NOTEBOOK_TITLE = "notebook";

// One intent-returning button (an ordinary effect vector).
function fxButton(text: string, ...vector: readonly unknown[]): Elem {
  return button(text, () => [vector] as IntentList as unknown as IntentList[]);
}

// fmt: scalars to 6 significant digits; arrays to a 4-sample preview.
function fmt(v: Val): string {
  if (typeof v === "number") return String(+v.toPrecision(6));
  if (!(v instanceof Float64Array)) return "[plot]";
  const head = Array.from(v.subarray(0, 4), (x) => +x.toPrecision(4)).join(", ");
  return `[${head}${v.length > 4 ? ", …" : ""}] · n=${v.length}`;
}

// The plot polyline: decimate to ≤300 points, map onto a 300×80 box.
function plotPoints(x: Float64Array, y: Float64Array): readonly Vec2[] {
  const n = x.length;
  const step = Math.max(1, Math.ceil(n / 300));
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i += step) {
    x0 = Math.min(x0, x[i] as number);
    x1 = Math.max(x1, x[i] as number);
    y0 = Math.min(y0, y[i] as number);
    y1 = Math.max(y1, y[i] as number);
  }
  const sx = x1 - x0 || 1;
  const sy = y1 - y0 || 1;
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i += step) {
    pts.push([
      (((x[i] as number) - x0) / sx) * 296 + 2,
      78 - (((y[i] as number) - y0) / sy) * 76,
    ]);
  }
  return pts;
}

// A plot value draws as one polyline path node.
function plotView(v: Extract<Val, { plot: unknown }>): Elem {
  const [x, y] = v.plot;
  return pathNode(...plotPoints(x, y));
}

// The cell's chips: what it defines and what it reads.
function chips(c: Cell, inf: { readonly name: string | null; readonly reads: readonly string[] }): Elem {
  const defs = inf.name === null ? "output" : `defines ${inf.name}`;
  const row: Elem[] = [labelNode(defs)];
  if (inf.reads.length > 0) {
    // the reads label sits at offset width(defines) + 1 (hstack rule) —
    // clamp it to what remains of the column
    const defsWidth = currentLabelMeasure()(defs)[0] ?? 0;
    row.push(
      labelNode(
        clampText(`reads ${inf.reads.join(", ")}`, COLUMN - defsWidth - 1),
      ),
    );
  }
  void c;
  return horizontalLayout(row) as Elem;
}

// The stored scratch of a cell textarea (cursor/selection survive
// re-derivation because they live in ::extra — plain state).
function storedExtra(s: NotebookState, id: number): TextareaExtra {
  const stored = s["::extra"][`cell-${id}`];
  return (stored ?? initialTextareaExtra()) as TextareaExtra;
}

// A slider cell renders the corpus slider bound to its value path.
function sliderView(s: NotebookState, id: number): Elem {
  const inf = s.info[id];
  const input = inf?.input;
  if (input === null || input === undefined) return labelNode("");
  const num = s.sliders[id] ?? input[3];
  return render(
    call(slider, {
      num,
      min: input[0],
      max: input[1],
      "integer?": Number.isInteger(input[2]),
      "mdown?": s["::extra"][`mdown-${id}`] === true,
      "max-width": 100,
      $num: sliderNumPath(id),
      "$mdown?": sliderMdownPath(id),
    }),
  ) as Elem;
}

// The output area: slider, error, plot or formatted value.
function outputView(s: NotebookState, c: Cell, o: OutEntry): Elem {
  const inf = s.info[c.id];
  if (inf?.input !== null && inf?.input !== undefined && inf?.err === null) {
    return sliderView(s, c.id);
  }
  if (o.err !== undefined) return labelNode(clampText(o.err, COLUMN));
  const v = o.v;
  if (v !== undefined && typeof v === "object" && !Array.isArray(v) && "plot" in v) {
    return plotView(v as Extract<Val, { plot: unknown }>);
  }
  if (v !== undefined) return labelNode(clampText(fmt(v), COLUMN));
  return labelNode("");
}

// One card: chips, the src textarea, the output.
function card(s: NotebookState, c: Cell, idx: number, focus: unknown): Elem {
  const inf = s.info[c.id];
  const o = s.out[c.id] ?? {};
  const rows: Elem[] = [
    chips(c, inf ?? { name: null, reads: [] }),
    textarea({
      text: c.src,
      textPath: cellSrcPath(idx),
      extraPath: cellExtraPath(c.id),
      focus,
      state: storedExtra(s, c.id),
      font: null,
      indexForPosition: () => 0,
      now: 0,
    }),
    outputView(s, c, o),
    spacer(0, 8),
  ];
  return verticalLayout(rows) as Elem;
}

// The stats bar: ran/total, compute ms, the mode toggle (the button
// label stays short so the row fits the drawn root's 300px width).
function statsRow(s: NotebookState): Elem {
  const st = s.stats;
  const modeText = `Mode: ${s.mode === "full" ? "full" : "inc"}`;
  // the mode button's emitted box = label bounds + 12 (geometry.ts);
  // the label must fit the column minus the gap and the button's box
  const modeWidth = (currentLabelMeasure()(modeText)[0] ?? 0) + 12;
  return horizontalLayout([
    labelNode(
      clampText(
        `ran ${st.ran}/${st.total} cells · ${st.ms.toFixed(1)} ms`,
        COLUMN - modeWidth - 1,
      ),
    ),
    spacer(5, 0),
    fxButton(modeText, "mode"),
  ]) as Elem;
}

// The control rows: the structural ops, the chain bump, the heavy kill
// target, the kill switch and Reset — split across three short rows so
// every button stays inside the drawn root's 300px width (the mobile
// reach constraint the fixture's viewport pins).
function controlsRows(): Elem[] {
  return [
    horizontalLayout([
      fxButton("+ cell", "add"),
      spacer(5, 0),
      fxButton("+200 chained", "chain"),
      spacer(5, 0),
      fxButton("+1 chain", "chain-bump"),
    ]) as Elem,
    horizontalLayout([
      fxButton("+200 fan-out", "fan"),
      spacer(5, 0),
      fxButton("+200 heavy", "heavy"),
    ]) as Elem,
    horizontalLayout([
      fxButton("Kill", "kill"),
      spacer(5, 0),
      fxButton("Reset", "reset"),
    ]) as Elem,
  ];
}

// The notebook view: title, stats, controls, one card per cell, and the
// load-failure line when the boundary degraded.
export function notebookView(s: NotebookState, context: { focus?: unknown } = {}): Elem {
  const focus = context.focus ?? null;
  const cards = s.cells.map((c, idx) => card(s, c, idx, focus));
  const body: Elem[] = [
    labelNode(NOTEBOOK_TITLE),
    statsRow(s),
    ...controlsRows(),
    ...(s.err.length > 0 ? [labelNode(clampText(s.err, COLUMN))] : []),
    ...cards,
  ];
  return (verticalLayout(body) ?? labelNode(NOTEBOOK_TITLE)) as Elem;
}
