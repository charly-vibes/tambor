// Purpose: the RINV section of the streaming-dashboard bench app
//   (tambor-1cr §4.2) — the per-app row memo and the composed
//   per-ticker wrapper loop, extracted from stream-dashboard.ts as a
//   mechanical split (zero behavior change).
// Responsibilities: rowMemoPerApp (the per-app memo of drawn line,
//   fittedLabels Elems, composed wrapper, y and span per ticker id)
//   and tickerRows (the loop that returns one wrapper per ticker and
//   advances the running offset the caller passes in and reads back).
// Rationale: the memo owns the COMPOSED translate wrapper per ticker
//   — translate(0, y, verticalLayout(labels)) with y the stack offset
//   the flat verticalLayout accumulation gives the ticker's first
//   label — so a ticker whose drawn line and stack offset are
//   unchanged returns the previous frame's wrapper node and the
//   landed per-child identity reuse (src/render/dom-painters.ts)
//   splices the whole subtree: the fresh per-label wrappers (the
//   counted mutations) are gone, and the RINV streamed tail mutates
//   only the changed row's elements plus the summary and book line —
//   the measured target of the rinv-tail-1msg scenario. The caller
//   keeps the body order: the ticker rows sit DIRECTLY above the
//   variable-height summary and book lines, so every composed
//   wrapper's offset depends only on the fixed-height control rows —
//   a summary/book refit (both change every message) shifts nothing
//   above them and no memo entry misses on y. A refit that changes a
//   ticker's label count shifts every later row's y and recomposes
//   the affected suffix for that frame (rare; sparkline width is
//   fixed).

import {
  height,
  origin,
  translate,
  type Elem,
} from "../../views/model.ts";
import { verticalLayout } from "../../views/layout.ts";
import { fittedLabels } from "../../views/fit.ts";
import type { App } from "../../effects/dispatch.ts";
import { tickerLine, type StreamState } from "./stream-tickers.ts";

// verticalLayout's default stack gap (vstack_offsets): the replicated
// row accumulation below must add the same constant the layout module
// does per preceding row.
const STACK_GAP = 1;

// The per-app row memo (tambor-1cr §4.2, wrapper-stable): per ticker
// id, the drawn line string the last derive fitted, the fittedLabels
// Elems it produced, and the COMPOSED translate wrapper —
// translate(0, y, verticalLayout(labels)) with y the stack offset the
// flat body's verticalLayout would give the ticker's first label. The
// wrapper is the element the DOM build counts: verticalLayout wraps
// every non-first row in a FRESH translate per derive, so reusing the
// label Elems alone still rebuilt ~2000 wrappers per streamed message.
// A ticker whose line AND y are unchanged returns the previous
// frame's wrapper node, so per-child identity reuse
// (src/render/dom-painters.ts buildChildWithReuse) splices the whole
// subtree — the stream-tail mutation count falls to the changed row's
// scale. y moves only when a preceding row's measured span moves
// (fittedLabels is deterministic in the line, so a same-line ticker
// keeps its span); a refit that changes a label count shifts every
// later row's y, fails their memo checks and recomposes the affected
// suffix for that frame — the conservative full-relayout path, rare
// because the sparkline width is fixed. This is app-level
// memoization of the demo's own rows keyed by drawn content; the
// renderer never content-matches, and the book line and summary
// (which change every message) stay fresh per derive. Keyed per
// ticker (not per line string) so a changed line evicts its own
// stale entry and the memo stays bounded at one entry per ticker.
const rowMemoPerApp = new WeakMap<
  App,
  Map<number, {
    line: string;
    elems: readonly Elem[];
    wrapper: Elem;
    y: number;
    span: number;
  }>
>();

// The ticker rows, composed per TICKER (tambor-1cr §4.2): each row
// STRING is state-derived (sym, price, change, sparkline all move
// with the stream), so it wraps through fittedLabels — one
// single-line label per line, stacked through verticalLayout's own
// rule and wrapped ONCE in translate(0, y, stack). The composition
// replicates the flat body's verticalLayout math exactly (height +
// origin y + the default gap of 1 per preceding row — STACK_GAP):
// `y` is the offset the flat layout gives the ticker's first label
// (the running offset after the fixed-height head) and each wrapper
// advances the returned offset by its labels' span, so the drawn rows
// land at the same positions as before, with one wrapper per ticker
// instead of one per label. Row order, the drawn rows and the exact
// words are unchanged; a long row simply takes several lines inside
// its ticker's wrapper instead of crossing the 300 px stage. The memo
// owns the wrapper (rowMemoPerApp, above): a ticker whose line is
// unchanged and whose y is unchanged returns the previous frame's
// translate node, so the landed per-child identity reuse splices the
// whole subtree — the wrapper WAS the counted mutation. A refit that
// changes a label count shifts every later row's y, fails their memo
// checks and recomposes the affected suffix for that frame (rare: the
// sparkline width is fixed, so refits are measure-stable in
// practice). Returns the wrappers (in ticker order) and the running
// offset after the last row.
export function tickerRows(
  state: StreamState,
  app: App,
  y: number,
): { wrappers: readonly Elem[]; y: number } {
  let rowMemo = rowMemoPerApp.get(app);
  if (rowMemo === undefined) {
    rowMemo = new Map();
    rowMemoPerApp.set(app, rowMemo);
  }
  const wrappers: Elem[] = [];
  for (const t of state.tickers) {
    const line = tickerLine(t);
    const memoed = rowMemo.get(t.id);
    if (memoed !== undefined && memoed.line === line && memoed.y === y) {
      wrappers.push(memoed.wrapper);
      y += memoed.span;
      continue;
    }
    const labels = fittedLabels(line);
    const stack = verticalLayout(labels);
    if (stack === null) throw new Error("fittedLabels yielded no labels");
    let span = 0;
    for (const l of labels) span += height(l) + origin(l)[1] + STACK_GAP;
    const wrapper = translate(0, y, stack) as Elem;
    rowMemo.set(t.id, { line, elems: labels, wrapper, y, span });
    wrappers.push(wrapper);
    y += span;
  }
  return { wrappers, y };
}
