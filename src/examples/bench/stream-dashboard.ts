// Purpose: the streaming-dashboard bench app (tambor-54j.13) — BZ1 of
//   the bench business suite: 500 tickers over a simulated quote
//   stream, each row drawn with a sparkline, plus a top-of-book line,
//   mounted as an ordinary gallery demo through the same makeApp/SPA
//   mount path as every other corpus app.
// Responsibilities: buildTickers (the 500-ticker setup op),
//   streamDashboardView (control row + summary + book + ticker rows),
//   the two stream op shapes — the NAIVE pump (one dispatch per
//   message) and the FRAME op (a whole burst folded into one update
//   intent) — and createStreamDashboardApp.
// Rationale: BZ1's likely failure is "one dispatch + full re-derive
//   per message" at ≈5k msg/s. The two op buttons make that a
//   measurement instead of a claim: both deliver the SAME BURST
//   messages and leave the SAME state (applyBurst ≡ k × applyOneMsg,
//   pinned by tests), but the naive pump calls app.dispatch once per
//   message — every dispatch schedules its own repaint, so the view is
//   re-derived (and drawn, through the mount's dispatch wrapper) one
//   time per message — while the frame op is one ordinary update
//   intent the dispatcher applies once for one repaint. The pump
//   closes over the app instance the way the logo demo's hooks cell
//   does (src/examples/logo/logo.ts): the handler itself returns no
//   intents — the dispatches it performs ARE the op. No benchmark-
//   specific fast path in the view: sparklines, change %, the sorted
//   book and every row are recomputed from plain state on every view
//   call, so a per-message re-derive pays for all 500 rows each time.
//   Canvas sparklines and per-row memo are the programme's candidate
//   components (benchmarks-and-findings §4.8), deliberately not built
//   here: this lane measures the dispatch-shape pair only.

import {
  button,
  label as labelNode,
  spacer,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import { makeApp } from "../../effects/dispatch.ts";
import {
  BURST,
  STATE_PATH,
  TICKER_COUNT,
  bookTop,
  seedHistory,
  seedPrice,
  streamState,
  symOf,
  tickerLine,
  applyOneMsg,
  applyBurst,
  type StreamState,
  type Ticker,
} from "./stream-tickers.ts";

// The top-of-book row size (top 5 by |change|).
const BOOK_DEPTH = 5;

// 500 tickers with seeded prices and non-empty sparkline histories:
// the untimed setup op both stream scenarios run first.
export function buildTickers(_state: StreamState): StreamState {
  const tickers: Ticker[] = [];
  for (let id = 0; id < TICKER_COUNT; id++) {
    const open = seedPrice(id);
    tickers.push({
      id,
      sym: symOf(id),
      price: open,
      open,
      history: seedHistory(open),
    });
  }
  return { tickers, msgs: 0 };
}

// The NAIVE op: one dispatch PER message, the per-message-dispatch
// baseline. Each dispatch applies one quote (applyOneMsg) and the
// dispatcher schedules its own repaint for it — one full re-derive
// (and, through the mount's dispatch wrapper, one draw) per message.
// The handler returns no intents: the dispatches it performed are the
// op, the same outside-the-intent-list shape the logo demo's worker
// reply uses.
export function naivePump(app: App, k: number): void {
  for (let i = 0; i < k; i++) {
    app.dispatch(["update", STATE_PATH, applyOneMsg] as unknown as IntentList);
  }
}

// The FRAME op's update: a whole burst folded into one state update —
// one dispatch, one repaint, identical final state to the naive pump.
export function frameBurst(state: unknown): StreamState {
  return applyBurst(state as StreamState, BURST);
}

// One op button: an ordinary handler returning its plain-data update.
function opButton(text: string, op: (state: unknown) => unknown): Elem {
  return button(text, (): IntentList => [["update", STATE_PATH, op]]);
}

// The summary line: the counts the bench's expectedText guards read —
// "tickers 500 msgs <n>" — a dropped or duplicated message changes it.
function summaryLine(state: StreamState): Elem {
  return labelNode(
    `tickers ${state.tickers.length} msgs ${state.msgs}`,
  ) as Elem;
}

// The stream view: the control row, the summary, the top-of-book
// line, then the 500 ticker rows (one label each, sparkline inline).
// The naive button takes the app accessor because its op IS a run of
// dispatches; the other buttons are ordinary intent-list handlers.
export function streamDashboardView(
  state: StreamState,
  appOf: () => App,
): Elem {
  const controls = horizontalLayout([
    opButton("Build 500", (state: unknown) => buildTickers(state as StreamState)),
    spacer(5, 0),
    button("Stream naive", (): IntentList => {
      naivePump(appOf(), BURST);
      return [];
    }),
    spacer(5, 0),
    opButton("Stream frame", frameBurst),
  ]) as Elem;
  const rows = (verticalLayout(state.tickers.map((t) => labelNode(tickerLine(t)) as Elem)) ??
    []) as readonly Elem[];
  const body = [
    controls,
    spacer(0, 10),
    summaryLine(state),
    spacer(0, 2),
    labelNode(`book ${bookTop(state.tickers, BOOK_DEPTH)}`) as Elem,
    spacer(0, 10),
    ...rows,
  ] as readonly Elem[];
  return (verticalLayout(body) ?? controls) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use. The app instance is captured (the
// logo demo's hooks-cell shape) so the naive pump can dispatch
// per-message; the frame op needs no capture.
export function createStreamDashboardApp(): App {
  // eslint-disable-next-line prefer-const -- declared before the mount closure captures it; assigned exactly once at mount
  let app: App | undefined;
  const appOf = (): App => {
    if (app === undefined) throw new Error("stream dashboard not mounted");
    return app;
  };
  app = makeApp({
    view: (state) => streamDashboardView(state as StreamState, appOf),
    state: streamState(),
    backend: { containerSize: VIEWPORT },
  });
  return app;
}

