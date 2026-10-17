// Purpose: contract tests for the stream-dashboard bench app
//   (tambor-54j.13, BZ1) — the 500-ticker stream state, the per-ticker
//   sparkline rows and the coalescing contract must hold through the
//   ordinary update-intent wire before the browser scenarios can be
//   trusted to measure anything.
// Responsibilities: pin (a) buildTickers produces 500 tickers with
//   24-point histories and distinct symbols, (b) applyOneMsg updates
//   exactly one ticker (the deterministic stride walk), advances msgs
//   by one and caps the history ring, (c) THE COALESCING CONTRACT:
//   applyBurst(s, k) equals k sequential applyOneMsg applications —
//   one dispatch per frame leaves the identical state the
//   per-message dispatches would, (d) the naive pump through the app's
//   real dispatcher delivers BURST messages (one dispatch each) and
//   the frame op through the same dispatcher delivers BURST messages
//   in ONE intent — same final state either way, (e) the drawn view
//   emits 500 ticker rows with sparkline glyphs and the "msgs <n>"
//   summary line the bench guards read, plus the top-of-book line.
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op is a no-op produces overhead-only medians; here the
//   guards are stronger: the two measured modes must leave identical
//   state, so a measured naive-vs-frame delta is dispatch shape, not a
//   data divergence.

import { describe, it, expect } from "vitest";
import type { Elem } from "../src/views/model.ts";
import { scanOf } from "./helpers/scan.ts";
import {
  buildTickers,
  createStreamDashboardApp,
  frameBurst,
  naivePump,
} from "../src/examples/bench/stream-dashboard.ts";
import {
  BURST,
  HISTORY_LEN,
  STATE_PATH,
  TICKER_COUNT,
  applyBurst,
  applyOneMsg,
  bookTop,
  changePct,
  pushHistory,
  seedHistory,
  seedPrice,
  sparkline,
  streamState,
  symOf,
  tickPrice,
  tickerLine,
  type StreamState,
  type Ticker,
} from "../src/examples/bench/stream-tickers.ts";

// Built state through the pure op (what Build 500 applies).
function built(): StreamState {
  return buildTickers(streamState());
}

// The ticker labels of a view (rows starting with a ticker symbol).
function tickerLabels(view: Elem): readonly string[] {
  return scanOf(view).flatMap((f) =>
    f.node.type === "label" && /^([A-X]{3}) \d/.test(f.node.text)
      ? [f.node.text]
      : [],
  );
}

describe("stream-dashboard bench app (BZ1)", () => {
  it("builds 500 tickers with 24-point histories and distinct syms", () => {
    const s = built();
    expect(s.tickers.length).toBe(TICKER_COUNT);
    expect(s.msgs).toBe(0);
    expect(new Set(s.tickers.map((t) => t.sym)).size).toBe(TICKER_COUNT);
    expect(
      s.tickers.every(
        (t) =>
          t.history.length === HISTORY_LEN &&
          t.sym.length === 3 &&
          t.price === t.open,
      ),
    ).toBe(true);
  });

  it("seed helpers are deterministic and the history ring is bounded", () => {
    expect(seedPrice(7)).toBe(seedPrice(7));
    expect(symOf(7)).toBe(symOf(7));
    expect(pushHistory([1, 2, 3], 4)).toEqual([1, 2, 3, 4]);
    const ring = Array.from({ length: HISTORY_LEN }, (_, i) => i);
    expect(pushHistory(ring, 99)).toEqual([
      ...ring.slice(1),
      99,
    ]);
    expect(pushHistory(ring, 99).length).toBe(HISTORY_LEN);
  });

  it("applyOneMsg updates exactly one ticker and advances msgs by one", () => {
    const s = built();
    const next = applyOneMsg(s);
    expect(next.msgs).toBe(s.msgs + 1);
    const changed: number[] = [];
    s.tickers.forEach((t, i) => {
      if (next.tickers[i] !== t) changed.push(i);
    });
    expect(changed).toEqual([(0 * 137) % TICKER_COUNT]);
    const idx = changed[0] as number;
    const old = s.tickers[idx] as Ticker;
    const now = next.tickers[idx] as Ticker;
    expect(now.price).toBe(tickPrice(old.price, 0));
    expect(now.history).toEqual(pushHistory(old.history, now.price));
    // untouched tickers keep identity (immutable update, per-row cost)
    expect(next.tickers[(idx + 1) % TICKER_COUNT]).toBe(
      s.tickers[(idx + 1) % TICKER_COUNT],
    );
  });

  it("COALESCING: applyBurst(s, k) equals k sequential applyOneMsg apps", () => {
    const s = built();
    const coalesced = applyBurst(s, BURST);
    let sequential = s;
    for (let i = 0; i < BURST; i++) sequential = applyOneMsg(sequential);
    expect(coalesced.msgs).toBe(sequential.msgs);
    expect(coalesced.tickers.length).toBe(sequential.tickers.length);
    expect(JSON.stringify(coalesced.tickers)).toBe(
      JSON.stringify(sequential.tickers),
    );
  });

  it("the naive pump delivers one dispatch per message through the app", () => {
    const app = createStreamDashboardApp();
    app.dispatch(["update", STATE_PATH, buildTickers]);
    const before = app.getState() as StreamState;
    naivePump(app, BURST);
    const after = app.getState() as StreamState;
    expect(after.msgs).toBe(before.msgs + BURST);
    expect(JSON.stringify(after.tickers)).toBe(
      JSON.stringify(applyBurst(before, BURST).tickers),
    );
  });

  it("the frame op delivers the same burst in ONE update intent", () => {
    const app = createStreamDashboardApp();
    app.dispatch(["update", STATE_PATH, buildTickers]);
    const before = app.getState() as StreamState;
    app.dispatch(["update", STATE_PATH, frameBurst]);
    const after = app.getState() as StreamState;
    expect(after.msgs).toBe(before.msgs + BURST);
    expect(JSON.stringify(after.tickers)).toBe(
      JSON.stringify(applyBurst(before, BURST).tickers),
    );
  });

  it("the view draws 500 sparkline rows, the summary and the book", () => {
    const app = createStreamDashboardApp();
    app.dispatch(["update", STATE_PATH, buildTickers]);
    app.dispatch(["update", STATE_PATH, frameBurst]);
    const view = app.view();
    const labels = tickerLabels(view);
    expect(labels.length).toBe(TICKER_COUNT);
    // sparkline glyphs are drawn inline (BZ1's per-row read)
    expect(labels.every((t) => /▁|▂|▃|▄|▅|▆|▇|█/.test(t))).toBe(true);
    const texts = scanOf(view)
      .flatMap((f) => (f.node.type === "label" ? [f.node.text] : []));
    expect(texts).toContain(`tickers ${TICKER_COUNT} msgs ${BURST}`);
    const book = texts.find((t) => t.startsWith("book "));
    expect(book).toBeDefined();
    expect((book as string).split("·").length).toBe(5);
  });

  it("sparkline and change helpers are pure reads of one ticker", () => {
    const s = built();
    const t = s.tickers[3] as Ticker;
    expect(sparkline(t.history).length).toBe(HISTORY_LEN);
    expect(sparkline([5, 5, 5])).toBe("▁▁▁");
    expect(changePct(t)).toBe("+0.0%");
    expect(tickerLine(t).startsWith(`${t.sym} `)).toBe(true);
    // the book line: top-5 by |change| — at build all changes are 0,
    // so the read must still return 5 entries in stable order
    expect(bookTop(s.tickers, 5).split("·").length).toBe(5);
    expect(seedHistory(seedPrice(0)).length).toBe(HISTORY_LEN);
  });
});
