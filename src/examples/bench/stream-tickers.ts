// Purpose: the pure data half of the streaming-dashboard bench app
//   (tambor-54j.13, BZ1 of the bench business suite): 500 tickers fed
//   by a simulated quote stream, with a per-ticker sparkline history
//   and a top-of-book read.
// Responsibilities: Ticker/StreamState (plain data), STATE_PATH (the
//   whole-state update path), streamState (empty), symOf/seedPrice/
//   seedHistory (deterministic seeding), tickPrice/pushHistory
//   (deterministic ticks), applyOneMsg (ONE quote applied), applyBurst
//   (a frame's quotes folded into one state update), sparkline (text
//   bars), changePct, tickerLine (the drawn row), bookTop (the top-5
//   |change| read), BURST (messages per simulated frame).
// Rationale: BZ1's likely failure is "one dispatch + full re-derive
//   per message" — so the state carries no derived cache and every
//   read (sparkline strings, change %, the sorted book) is recomputed
//   from plain data on every view call, exactly the cost the naive
//   mode multiplies. Everything is a pure function of plain state so
//   tests can pin the coalescing contract: applyBurst(s, k) equals k
//   sequential applyOneMsg applications — one dispatch per frame
//   delivers the identical state the per-message dispatches would.
//   Message indexing is msgs-driven and deterministic (TICK_STRIDE is
//   coprime with TICKER_COUNT), so any dropped or duplicated message
//   changes the drawn state the bench guards read.

import type { Path } from "../../effects/paths.ts";

// The dashboard's ticker count (BZ1's stated scale).
export const TICKER_COUNT = 500;

// Sparkline history length per ticker (a bounded ring, not unbounded
// growth — the BZ5 candidate, applied here from the start).
export const HISTORY_LEN = 24;

// Messages per simulated frame burst. 500 tickers × 10 updates/s is
// ≈5k msg/s ≈ 83 msg per 60 fps frame; 80 is that frame's worth
// rounded to a stride-friendly power of ten minus its last 3.
export const BURST = 80;

// Message → ticker stride, coprime with 500 so a msgs-driven walk
// visits every ticker once per 500 messages.
export const TICK_STRIDE = 137;

// The sparkline glyph ramp: 8 unicode block levels, low → high.
const SPARK_CHARS = "▁▂▃▄▅▆▇█";

// The letter pool for ticker symbols (24 letters → 24³ > 500 syms).
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWX";

// One ticker: stable id/sym, last price (cents), session open, and the
// bounded sparkline history (last HISTORY_LEN prices).
export interface Ticker {
  readonly id: number;
  readonly sym: string;
  readonly price: number;
  readonly open: number;
  readonly history: readonly number[];
}

// The app state: plain data — the tickers and the messages delivered.
export interface StreamState {
  readonly tickers: readonly Ticker[];
  readonly msgs: number;
}

// The path every update intent targets: the whole state (an empty path
// walks to the root leaf), because one quote moves a ticker AND the
// msgs counter together.
export const STATE_PATH: Path = [] as unknown as Path;

// The demo's initial state: no tickers — building them is the untimed
// setup op.
export function streamState(): StreamState {
  return { tickers: [], msgs: 0 };
}

// The deterministic symbol for a ticker id (three letters).
export function symOf(id: number): string {
  const l = (n: number): string => LETTERS[n % LETTERS.length] as string;
  return l(id) + l(Math.floor(id / LETTERS.length)) +
    l(Math.floor(id / (LETTERS.length * LETTERS.length)));
}

// The session-open price (cents): a sine spine plus a sawtooth wobble,
// so every ticker starts somewhere different.
export function seedPrice(id: number): number {
  return Math.round(5000 + 3000 * Math.sin(id / 17) + ((id * 97) % 800));
}

// One seeded history: the open price walked by the same tick rule
// applyOneMsg uses, so the sparkline is non-empty at build.
export function seedHistory(open: number): readonly number[] {
  const out: number[] = [];
  let price = open;
  for (let j = 0; j < HISTORY_LEN; j++) {
    out.push(price);
    price = tickPrice(price, j);
  }
  return out;
}

// The tick rule: message m moves a price by a deterministic step
// (bounded, so prices never leave the drawn range).
export function tickPrice(old: number, m: number): number {
  const step = ((m % 17) - 8) * 7;
  return Math.min(9900, Math.max(100, old + step));
}

// Append one price to a bounded history: last HISTORY_LEN points.
export function pushHistory(
  history: readonly number[],
  price: number,
): readonly number[] {
  const next = [...history, price];
  return next.length > HISTORY_LEN ? next.slice(next.length - HISTORY_LEN) : next;
}

// ONE quote applied: message index = msgs (deterministic), the ticker
// it lands on = (msgs × TICK_STRIDE) mod count, msgs advances by one.
export function applyOneMsg(state: StreamState): StreamState {
  if (state.tickers.length === 0) return state;
  const m = state.msgs;
  const idx = (m * TICK_STRIDE) % state.tickers.length;
  const old = state.tickers[idx] as Ticker;
  const price = tickPrice(old.price, m);
  const tickers = state.tickers.slice();
  tickers[idx] = { ...old, price, history: pushHistory(old.history, price) };
  return { tickers, msgs: m + 1 };
}

// A frame burst folded into ONE state update: k messages applied
// sequentially, one dispatch's worth of work. The coalescing contract
// (pinned by tests): this returns the identical state k separate
// applyOneMsg dispatches would leave.
export function applyBurst(state: StreamState, k: number): StreamState {
  let out = state;
  for (let i = 0; i < k; i++) out = applyOneMsg(out);
  return out;
}

// The sparkline text for a history: 8-level block glyphs scaled to the
// history's min..max span (a flat history pins to the floor glyph).
export function sparkline(history: readonly number[]): string {
  if (history.length === 0) return "";
  let min = Infinity;
  let max = -Infinity;
  for (const v of history) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  return history.map((v) => {
    const level = Math.floor(((v - min) / span) * SPARK_CHARS.length);
    return SPARK_CHARS[Math.min(SPARK_CHARS.length - 1, level)];
  }).join("");
}

// The change vs the session open, one decimal, signed.
export function changePct(ticker: Ticker): string {
  const pct = ((ticker.price - ticker.open) / ticker.open) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

// The drawn row: sym, price in units, change, sparkline — one label.
export function tickerLine(ticker: Ticker): string {
  return `${ticker.sym} ${(ticker.price / 100).toFixed(2)} ` +
    `${changePct(ticker)} ${sparkline(ticker.history)}`;
}

// The top-of-book read: the k tickers with the largest |change| vs
// open, sym + change each. A full sort per derivation — part of the
// honest whole-view cost the naive mode multiplies.
export function bookTop(
  tickers: readonly Ticker[],
  k: number,
): string {
  const rank = (t: Ticker): number => Math.abs(t.price - t.open);
  return [...tickers]
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, k)
    .map((t) => `${t.sym} ${changePct(t)}`)
    .join(" · ");
}
