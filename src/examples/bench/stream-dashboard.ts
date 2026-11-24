// Purpose: the streaming-dashboard bench app (tambor-54j.13) — BZ1 of
//   the bench business suite: 500 tickers over a simulated quote
//   stream, each row drawn with a sparkline, plus a top-of-book line,
//   mounted as an ordinary gallery demo through the same makeApp/SPA
//   mount path as every other corpus app.
// Responsibilities: buildTickers (the 500-ticker setup op),
//   build1000History (the RINV setup op — the same seeded tickers
//   folded with 1,000 deterministic messages), streamDashboardView
//   (control rows + summary + the top-of-book line and every ticker
//   row line fitted through fittedLabels), the two stream op shapes —
//   the NAIVE pump (one dispatch per message) and the FRAME op (a
//   whole burst folded into one update intent) — the RINV tail pair
//   ("Build 1000 history" + "Stream 1", exactly ONE quote per click)
//   and createStreamDashboardApp.
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
//   Canvas sparklines remain a programme candidate (benchmarks-and-
//   findings §4.8), deliberately not built here. As of tambor-1cr
//   §4.2 the rows carry a per-app memo that owns the COMPOSED
//   translate wrapper per ticker, so unchanged tickers splice whole
//   under per-child identity reuse and the RINV streamed tail mutates
//   only the changed row plus the summary and book line — the memo
//   and the wrapper composition live in stream-dashboard-rinv.ts
//   (tickerRows), which owns that rationale. The body order supports
//   the memo: the ticker rows sit DIRECTLY above the variable-height
//   summary and book lines, so every composed wrapper's offset
//   depends only on the fixed-height control rows. BZ1's recorded
//   baselines pre-date the memo and keep their commit-pinned
//   provenance. The RINV pair (tambor-1cr) extends the same
//   honest-cost lane: "Build 1000 history" folds 1,000 deterministic
//   messages into the bounded sparkline rings (applyOneMsg ×
//   RINV_HISTORY_MSGS), and "Stream 1" delivers exactly ONE quote
//   through the naive pump — the bench's DOM-mutation count then has
//   a floor to fall to once unchanged rows splice whole.
//   The drawn text lines are themselves state-derived — the top-of-book
//   read, and each row's sym, price, change and sparkline all move under
//   the stream — so a line that fit the 300 px drawn root at build can
//   outgrow it after a burst. Both run through fittedLabels (the same
//   pure-realm wrap the summary uses), so the drawn width is bounded in
//   ANY state, not just the initial one; row order, row count and the
//   exact words stay put, a long line just occupies several stacked
//   lines.

import {
  button,
  height,
  label as labelNode,
  origin,
  spacer,
  translate,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import { fittedLabels } from "../../views/fit.ts";
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
  applyOneMsg,
  applyBurst,
  type StreamState,
  type Ticker,
} from "./stream-tickers.ts";
import { tickerRows } from "./stream-dashboard-rinv.ts";

// The top-of-book row size (top 5 by |change|).
const BOOK_DEPTH = 5;

// verticalLayout's default stack gap (vstack_offsets): the replicated
// row accumulation below must add the same constant the layout module
// does per preceding row.
const STACK_GAP = 1;

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

// The tail-history depth: the 1,000 delivered messages "Build 1000
// history" folds into the state before "Stream 1" measures a single
// tail mutation against it.
export const RINV_HISTORY_MSGS = 1000;

// The RINV setup op: Build 500's seeded state folded with 1,000
// deterministic messages (applyOneMsg's msgs-driven stride walk), so
// the "1 streaming message in a 1,000-message history" scenario starts
// from a 1,000-message history in the bounded sparkline rings. Like
// Build 500 it resets — the incoming state is ignored and the result
// is a pure function of the seeded state, identical across runs.
export function build1000History(_state: StreamState): StreamState {
  let state = buildTickers(_state);
  for (let m = 0; m < RINV_HISTORY_MSGS; m++) state = applyOneMsg(state);
  return state;
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

// The four control rows: the ops do not fit one 300 px stage (the
// log-stream note), so the build/naive pair, the frame op and the
// RINV pair (tambor-1cr: the 1,000-message history build and the
// one-message tail op) each stack on their own row, with the
// RINV rows single-button (the frameRow shape) so neither replay nor
// real text metrics can push a neighbour's drawn box over another
// button's click point. Returns the FIXED-height head array the view
// lays out with verticalLayout; head[0] (the ops row) is the view's
// unreachable-empty fallback.
function controlHead(appOf: () => App): readonly Elem[] {
  const opsRow = horizontalLayout([
    opButton("Build 500", (state: unknown) => buildTickers(state as StreamState)),
    spacer(5, 0),
    button("Stream naive", (): IntentList => {
      naivePump(appOf(), BURST);
      return [];
    }),
  ]) as Elem;
  const frameRow = horizontalLayout([
    opButton("Stream frame", frameBurst),
  ]) as Elem;
  const rinvBuildRow = horizontalLayout([
    opButton(
      "Build 1000 history",
      (state: unknown) => build1000History(state as StreamState),
    ),
  ]) as Elem;
  const rinvStreamRow = horizontalLayout([
    button("Stream 1", (): IntentList => {
      naivePump(appOf(), 1);
      return [];
    }),
  ]) as Elem;
  return [
    opsRow,
    spacer(0, 4),
    frameRow,
    spacer(0, 4),
    rinvBuildRow,
    spacer(0, 4),
    rinvStreamRow,
    spacer(0, 10),
  ] as readonly Elem[];
}

// The stream view: the control rows, the summary, the top-of-book
// line (fitted like the rows). The 500 ticker rows come DIRECTLY
// after the fixed-height control rows: every ticker wrapper's y then
// depends only on fixed-height content, so the composed per-ticker
// memo hits on every unchanged ticker (add-runtime-invalidation §4.2
// measurement stability; the BZ1 expectedText guards read text, not
// layout order). The summary line and the top-of-book line sit BELOW
// the rows: both are fresh per derive (the msgs count and the book
// re-rank), so their refits shift nothing above them. The naive
// button takes the app accessor because its op IS a run of dispatches;
// the other buttons are ordinary intent-list handlers.
export function streamDashboardView(
  state: StreamState,
  appOf: () => App,
): Elem {
  // The four control rows, the head laid out by verticalLayout (its
  // output IS the prefix of the returned root, so the control
  // translate wrappers stay identical to the flat path) and the
  // running offset after the head (the same height + origin y + gap
  // accumulation verticalLayout performs) — where the flat layout
  // would put the first ticker label, the first wrapper's y. Because
  // the head holds only fixed-height rows, every ticker's y is stable
  // across derives and the composed memo hits on every unchanged
  // ticker; the summary and book lines live BELOW the rows.
  const head = controlHead(appOf);
  const headRows = verticalLayout(head);
  if (headRows === null) return head[0] as Elem; // unreachable: head is never empty
  // The running offset after the head (the same height + origin y +
  // gap accumulation verticalLayout performs) is where the flat layout
  // would put the first ticker label — the first wrapper's y. Because
  // the head holds only fixed-height rows, every ticker's y is stable
  // across derives and the composed memo hits on every unchanged
  // ticker; the summary and book lines live BELOW the rows. The rows
  // themselves come from the extracted RINV module
  // (stream-dashboard-rinv.ts): tickerRows composes each row once in
  // translate(0, y, stack), the per-app row memo owns the wrapper, so
  // an unchanged ticker returns the previous frame's translate node
  // and the landed per-child identity reuse splices the whole subtree.
  let y = 0;
  for (const elem of head) y += height(elem) + origin(elem)[1] + STACK_GAP;
  const { wrappers, y: rowsY } = tickerRows(state, appOf(), y);
  // The tail: the fresh-per-derive lines sit BELOW the rows (their
  // label-count flips shift nothing above them). The top-of-book line
  // is state-derived on the same terms: five ranked entries joined by
  // " · " measure ~500 px at this stage (the widest drawn line in the
  // app), so it wraps through fittedLabels like the rows instead of
  // anchoring an over-wide label. The stack is appended as ONE
  // translate(0, tailY, tailRows): verticalLayout leaves its FIRST
  // element unwrapped and translates only the rest, so spreading
  // tailRows into the root would land the tail origin-relative (the
  // summary at y≈11, superimposed on the controls) instead of below
  // the rows. The wrapper preserves the stack's internal offsets and
  // shifts them to the running offset the flat layout would have
  // given the tail's first row. Drawn content and geometry are
  // identical to the flat path — only the vertical composition moved.
  const tailRows = verticalLayout([
    spacer(0, 10),
    summaryLine(state),
    spacer(0, 2),
    ...fittedLabels(`book ${bookTop(state.tickers, BOOK_DEPTH)}`),
  ]);
  if (tailRows === null) return head[0] as Elem; // unreachable: tail is never empty
  const tailY = rowsY;
  return [...headRows, ...wrappers, translate(0, tailY, tailRows)] as readonly Elem[];
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

