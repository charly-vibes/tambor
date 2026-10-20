// Purpose: the log-stream benchmark app (tambor-54j.17) — BZ5 of the
//   bench business suite: a simulated log/metrics stream (batches of
//   lines at ~100k lines/min granularity), mounted as an ordinary
//   gallery demo through the same makeApp/SPA mount path as every
//   other corpus app.
// Responsibilities: LogLine/LogStreamState, LOG_STREAM_PATHS (LINES,
//   RING, RING_NEXT, TOTAL, RESULTS), makeLine/makeBatch (deterministic
//   lines: error every 10th id, warn every 5th), the naive ops —
//   appendNaiveOp (unbounded ingest), searchCorpus (main-thread
//   filter), resultsLabel — the candidate ops — ringAppendOp (bounded
//   ring buffer, oldest dropped) and the fixed-height drawn window —
//   levelCounts (the one-pass level histogram), summaryLines (the
//   drawn summary labels) and the collect-one search ops. The drawn
//   view and the makeApp mount live in log-stream-view.ts (the
//   pretender file budget: state/ops split from view).
// Rationale: the honest naive mode is what the BZ5 row predicts fails:
//   every append copies the whole ever-growing line array (H3) and the
//   drawn log is unbounded (memory growth), so the per-op cost climbs
//   with the corpus. The candidate mode answers with the §4.8
//   components: a bounded ring store (state holds a window, never the
//   raw stream) plus a fixed-height log view (only the newest
//   WINDOW_DRAWN lines drawn), so per-op cost stays flat. Both modes
//   run through the ordinary ["update", …] intent wire — the naive
//   append, the ring append (collect-one reads ringNext ahead of the
//   ring, the dashboard bump shape) and the searches (collect-one
//   reads the corpus ahead of results) — no benchmark-specific fast
//   path. The demo starts empty: appending is the measured op.

import type { Path } from "../../effects/paths.ts";
import {
  appendSeries,
  boundedSeries,
  foldSeries,
  type BoundedSeries,
} from "../../components/ring_buffer/ring_buffer.ts";

// Lines per simulated ingest batch (~0.15 s of a 100k lines/min stream).
export const BATCH = 250;

// The candidate's bounded window: the ring never holds more lines.
export const RING_CAPACITY = 2000;

// The search term: only error lines' text contains it, so the match
// count is independently recomputable from the ids.
export const SEARCH_QUERY = "error";

// Match labels drawn from a search (the full count stays in the label).
export const MATCH_SAMPLE = 5;

// The candidate's fixed-height log: only the newest lines drawn.
export const WINDOW_DRAWN = 50;

// The line levels; makeLine's rule is deterministic so tests recompute.
export type Level = "info" | "warn" | "error";

// One log line: an id, its level, and a text payload the search scans.
export interface LogLine {
  readonly id: number;
  readonly level: Level;
  readonly msg: string;
}

// The latest search's outcome (corpus names which store was scanned).
export interface SearchResults {
  readonly query: string;
  readonly corpus: "all" | "ring";
  readonly count: number;
  readonly sample: readonly LogLine[];
}

// The app state: plain data — the naive corpus, the bounded ring (the
// public bounded-series component, components.ring_buffer — its
// internal stacks are plain immutable data, a first-class state slice),
// the ring's next id, the total ingested, and the latest search.
export interface LogStreamState {
  readonly lines: readonly LogLine[];
  readonly ring: BoundedSeries<LogLine>;
  readonly ringNext: number;
  readonly total: number;
  readonly results: SearchResults;
}

// The paths the op buttons update. The ring append and the searches
// are collect-one paths (the dashboard bump shape): the op reads the
// id cursor / corpus ahead of the path's own old value, so no op
// closes over the view.
export const LINES_PATH: Path = [["keypath", "lines"]];
export const RING_PATH: Path = [["keypath", "ring"]];
export const RING_NEXT_PATH: Path = [["keypath", "ringNext"]];
export const TOTAL_PATH: Path = [["keypath", "total"]];
export const RESULTS_PATH: Path = [["keypath", "results"]];
export const RING_APPEND_PATH: Path = [["collect-one", RING_NEXT_PATH], ["keypath", "ring"]];
export const SEARCH_ALL_PATH: Path = [["collect-one", LINES_PATH], ["keypath", "results"]];
export const SEARCH_RING_PATH: Path = [["collect-one", RING_PATH], ["keypath", "results"]];

// The demo's initial state: nothing ingested, no search yet — the ring
// starts as the empty bounded series at RING_CAPACITY.
export function logStreamState(): LogStreamState {
  return {
    lines: [],
    ring: boundedSeries<LogLine>(RING_CAPACITY),
    ringNext: 0,
    total: 0,
    results: { query: "", corpus: "all", count: 0, sample: [] },
  };
}

// The empty results (the state's no-search-yet value).
export function noResults(): SearchResults {
  return { query: "", corpus: "all", count: 0, sample: [] };
}

// Deterministic line: error every 10th id, warn every 5th, else info.
export function makeLine(id: number): LogLine {
  const level: Level =
    id % 10 === 0 ? "error" : id % 5 === 0 ? "warn" : "info";
  return { id, level, msg: `line ${id} ${level} — event ${id}` };
}

// One ingest batch: BATCH lines with sequential ids from start.
export function makeBatch(start: number, count = BATCH): readonly LogLine[] {
  return Array.from({ length: count }, (_, i) => makeLine(start + i));
}

// --- the naive mode (what the BZ5 row predicts fails) -------------------

// Unbounded ingest: the whole ever-growing array is copied per batch.
export function appendNaiveOp(
  lines: unknown,
): readonly LogLine[] {
  return [...(lines as readonly LogLine[]), ...makeBatch((lines as readonly LogLine[]).length)];
}

// Main-thread search over a corpus: the full scan + the drawn sample.
export function searchCorpus(
  corpus: readonly LogLine[],
  corpusName: "all" | "ring",
  query: string,
): SearchResults {
  const sample: LogLine[] = [];
  let count = 0;
  for (const line of corpus) {
    if (!line.msg.includes(query)) continue;
    count++;
    if (sample.length < MATCH_SAMPLE) sample.push(line);
  }
  return { query, corpus: corpusName, count, sample };
}

// --- the candidate mode (bounded ring + fixed-height window) ------------

// Bounded ingest: the ring keeps only the newest RING_CAPACITY lines
// (oldest dropped) — state holds a window, never the raw stream. The
// bounded store is the public bounded-series component
// (components.ring_buffer): the append is O(1) amortized per line
// (each line consed at most twice over the stream) with no copy of the
// retained window — the promotion of the slice-copy this op was before
// the component existed (the inline pattern's [...ring, ...batch].slice
// was allocation-bounded but O(capacity) per append).
export function ringAppendOp(
  ringNext: unknown,
  ring: unknown,
): BoundedSeries<LogLine> {
  return appendSeries(
    ring as BoundedSeries<LogLine>,
    makeBatch(ringNext as number),
  );
}

// The id cursors / total tick (the dashboard bumpTick shape).
export function ringNextTick(n: number): number {
  return n + BATCH;
}
export function totalTick(n: number): number {
  return n + BATCH;
}

// --- the derived reads (recomputed per view call, both modes) -----------

// The one-pass level histogram over a corpus.
export interface LevelCounts {
  readonly info: number;
  readonly warn: number;
  readonly error: number;
}

export function levelCounts(corpus: readonly LogLine[]): LevelCounts {
  const counts = { info: 0, warn: 0, error: 0 };
  for (const line of corpus) counts[line.level]++;
  return counts;
}

// The one-pass level histogram over the bounded ring — the window fold
// the component exposes (foldSeries walks the retained window
// oldest→newest once).
export function levelCountsRing(ring: BoundedSeries<LogLine>): LevelCounts {
  const counts = { info: 0, warn: 0, error: 0 };
  return foldSeries(
    ring,
    (acc: { info: number; warn: number; error: number }, line: LogLine) => {
      acc[line.level]++;
      return acc;
    },
    counts,
  );
}

// The drawn summary labels — the per-corpus counts, the total and the
// latest search's outcome line.
export function summaryLines(state: LogStreamState): readonly string[] {
  const all = levelCounts(state.lines);
  const kept = levelCountsRing(state.ring);
  return [
    `total ${state.total}`,
    `all ${state.lines.length}`,
    `all err ${all.error}`,
    `kept ${state.ring.size}`,
    `kept err ${kept.error}`,
    resultsLabel(state.results),
  ];
}

// The search outcome line (the scenarios' expectedText guard).
export function resultsLabel(results: SearchResults): string {
  return results.query === ""
    ? "no search yet"
    : `matches ${results.count} of ${results.query} (${results.corpus})`;
}

// --- the collect-one search ops ------------------------------------------

// The collect-one search ops: the collected corpus is scanned, the
// old results are replaced (the search always rewrites the outcome).
export function searchAllOp(all: unknown): SearchResults {
  return searchCorpus(all as readonly LogLine[], "all", SEARCH_QUERY);
}
// The ring search: the collected ring is the bounded series, scanned
// by the window fold (a full pass over plain data — the same one-pass
// scan searchCorpus does over the naive corpus, without materializing
// the window into an array first).
export function searchRingOp(ring: unknown): SearchResults {
  const series = ring as BoundedSeries<LogLine>;
  const sample: LogLine[] = [];
  const count = foldSeries(
    series,
    (matches: number, line: LogLine) => {
      if (!line.msg.includes(SEARCH_QUERY)) return matches;
      if (sample.length < MATCH_SAMPLE) sample.push(line);
      return matches + 1;
    },
    0,
  );
  return { query: SEARCH_QUERY, corpus: "ring", count, sample };
}
