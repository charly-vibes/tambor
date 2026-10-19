// Purpose: contract tests for the log-stream bench app (tambor-54j.17
//   BZ5) — the naive ingest, the bounded-ring candidate and the
//   main-thread searches must be correct reads/edits of plain state
//   through the ordinary update-intent wire before the browser
//   scenario can be trusted to measure anything.
// Responsibilities: pin (a) makeLine's deterministic level rule and
//   makeBatch's sequential ids, (b) appendNaiveOp grows unbounded
//   (naive mode: every batch copies the whole corpus), (c)
//   ringAppendOp keeps only the newest RING_CAPACITY lines (oldest
//   dropped, ids monotone via ringNext), (d) searchCorpus counts
//   matches and caps the drawn sample, (e) the collect-one search ops
//   rewrite the results through the dispatcher, (f) summaryLines emits
//   exactly the labels the browser scenarios guard ("all 3250", "kept
//   2000", "matches 150 of error (ring)") — the scenario guards are
//   contract bindings, checked here in-process.
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op is a no-op produces overhead-only medians; each op's
//   product is checked against independent recomputation, and the
//   ring's drop-oldest invariant is what makes the bounded candidate
//   actually bounded.

import { describe, it, expect } from "vitest";
import {
  BATCH,
  MATCH_SAMPLE,
  RING_CAPACITY,
  RING_NEXT_PATH,
  SEARCH_ALL_PATH,
  SEARCH_QUERY,
  SEARCH_RING_PATH,
  TOTAL_PATH,
  LINES_PATH,
  appendNaiveOp,
  levelCounts,
  logStreamState,
  makeBatch,
  makeLine,
  noResults,
  resultsLabel,
  ringAppendOp,
  searchAllOp,
  searchCorpus,
  searchRingOp,
  summaryLines,
  totalTick,
  type LogLine,
  type LogStreamState,
} from "../src/examples/bench/log-stream.ts";
import { createLogStreamApp } from "../src/examples/bench/log-stream-view.ts";
import { newestSeries } from "../src/components/ring_buffer/ring_buffer.ts";

// Independent recomputation of a corpus's match count (not the app's
// helper): error ids are exactly the multiples of 10.
function expectedMatches(corpus: readonly LogLine[]): number {
  return corpus.filter((l) => l.msg.includes(SEARCH_QUERY)).length;
}

describe("log-stream bench app", () => {
  it("makeLine's level rule is deterministic: error every 10th, warn every 5th", () => {
    expect(makeLine(0).level).toBe("error");
    expect(makeLine(5).level).toBe("warn");
    expect(makeLine(7).level).toBe("info");
    expect(makeLine(10).level).toBe("error");
    expect(makeLine(0).msg).toContain("error");
  });

  it("makeBatch emits BATCH sequential ids", () => {
    const batch = makeBatch(500);
    expect(batch.length).toBe(BATCH);
    expect(batch[0]?.id).toBe(500);
    expect(batch[BATCH - 1]?.id).toBe(500 + BATCH - 1);
  });

  it("naive append grows unbounded: 13 batches copies 3250 lines", () => {
    let lines: readonly LogLine[] = [];
    for (let i = 0; i < 13; i++) lines = appendNaiveOp(lines);
    expect(lines.length).toBe(13 * BATCH);
    // ids are the sequential 0..3249 the scenario guard pins
    expect(lines[0]?.id).toBe(0);
    expect(lines[lines.length - 1]?.id).toBe(13 * BATCH - 1);
  });

  it("ring append keeps only the newest RING_CAPACITY lines", () => {
    let ring = logStreamState().ring;
    let ringNext = 0;
    for (let i = 0; i < 13; i++) {
      ring = ringAppendOp(ringNext, ring);
      ringNext += BATCH;
    }
    expect(ring.size).toBe(RING_CAPACITY);
    // the oldest 1250 lines were dropped; ids stay monotone
    const kept = newestSeries(ring, RING_CAPACITY);
    expect(kept[0]?.id).toBe(13 * BATCH - RING_CAPACITY);
    expect(kept[RING_CAPACITY - 1]?.id).toBe(13 * BATCH - 1);
  });

  it("searchCorpus counts every match and caps the drawn sample", () => {
    const corpus = makeBatch(0, BATCH);
    const results = searchCorpus(corpus, "all", SEARCH_QUERY);
    expect(results.count).toBe(expectedMatches(corpus));
    expect(results.sample.length).toBe(Math.min(MATCH_SAMPLE, results.count));
    expect(results.query).toBe(SEARCH_QUERY);
    // a term that matches nothing counts zero with an empty sample
    const none = searchCorpus(corpus, "ring", "no-such-term");
    expect(none.count).toBe(0);
    expect(none.sample).toEqual([]);
  });

  it("starts empty: nothing ingested, no search yet", () => {
    const state = logStreamState();
    expect(state.lines).toEqual([]);
    expect(state.ring.size).toBe(0);
    expect(state.ringNext).toBe(0);
    expect(state.total).toBe(0);
    expect(state.results).toEqual(noResults());
    expect(resultsLabel(state.results)).toBe("no search yet");
  });

  it("the naive append button grows the corpus through the dispatcher", () => {
    const app = createLogStreamApp();
    for (let i = 0; i < 3; i++) {
      app.dispatch([
        ["update", LINES_PATH, appendNaiveOp],
        ["update", TOTAL_PATH, totalTick],
      ]);
    }
    const state = app.getState() as LogStreamState;
    expect(state.lines.length).toBe(3 * BATCH);
    expect(state.total).toBe(3 * BATCH);
  });

  it("the ring append button stays bounded through the dispatcher", () => {
    const app = createLogStreamApp();
    for (let i = 0; i < 9; i++) {
      app.dispatch([
        ["update", [["collect-one", RING_NEXT_PATH], ["keypath", "ring"]], ringAppendOp],
        ["update", RING_NEXT_PATH, (n: number) => n + BATCH],
        ["update", TOTAL_PATH, totalTick],
      ]);
    }
    const state = app.getState() as LogStreamState;
    expect(state.ring.size).toBe(RING_CAPACITY);
    expect(state.total).toBe(9 * BATCH);
  });

  it("the search buttons rewrite the results through the dispatcher", () => {
    const app = createLogStreamApp();
    app.dispatch([
      ["update", LINES_PATH, appendNaiveOp],
      ["update", TOTAL_PATH, totalTick],
      ["update", SEARCH_ALL_PATH, searchAllOp],
    ]);
    let state = app.getState() as LogStreamState;
    expect(state.results.corpus).toBe("all");
    expect(state.results.count).toBe(expectedMatches(state.lines));
    app.dispatch([
      ["update", [["collect-one", RING_NEXT_PATH], ["keypath", "ring"]], ringAppendOp],
      ["update", RING_NEXT_PATH, (n: number) => n + BATCH],
      ["update", SEARCH_RING_PATH, searchRingOp],
    ]);
    state = app.getState() as LogStreamState;
    expect(state.results.corpus).toBe("ring");
    expect(state.results.count).toBe(
      expectedMatches(newestSeries(state.ring, RING_CAPACITY)),
    );
  });

  it("levelCounts is the one-pass histogram", () => {
    const corpus = makeBatch(0, BATCH);
    const counts = levelCounts(corpus);
    expect(counts.error).toBe(corpus.filter((l) => l.level === "error").length);
    expect(counts.warn).toBe(corpus.filter((l) => l.level === "warn").length);
    expect(counts.info).toBe(corpus.filter((l) => l.level === "info").length);
    expect(counts.info + counts.warn + counts.error).toBe(corpus.length);
  });

  it("the scenario guards are contract bindings of summaryLines", () => {
    // log-stream-naive-append: warmup + 12 naive appends → "all 3250"
    let state = logStreamState();
    for (let i = 0; i < 13; i++) state = { ...state, lines: appendNaiveOp(state.lines), total: state.total + BATCH };
    expect(summaryLines(state)).toContain("all 3250");

    // log-stream-ring-append: warmup + 12 ring appends → "kept 2000"
    state = logStreamState();
    for (let i = 0; i < 13; i++) {
      state = { ...state, ring: ringAppendOp(state.ringNext, state.ring), ringNext: state.ringNext + BATCH, total: state.total + BATCH };
    }
    expect(summaryLines(state)).toContain("kept 2000");

    // log-stream-search: warmup Search all + 12 alternating ops — the
    // last op is Search ring over 6 × 250 ring lines → "matches 150 of
    // error (ring)"
    state = logStreamState();
    for (let i = 0; i < 13; i++) {
      // i=0 is the warmup (points[0] = Search all); the timed ops
      // alternate from points[0], so odd i is Search all, even i ≥ 2 is
      // Search ring — the last op (i = 12) is Search ring
      if (i === 0 || i % 2 === 1) {
        const grown = appendNaiveOp(state.lines);
        state = {
          ...state,
          lines: grown,
          total: state.total + BATCH,
          results: searchCorpus(grown, "all", SEARCH_QUERY),
        };
      } else {
        const grown = ringAppendOp(state.ringNext, state.ring);
        state = {
          ...state,
          ring: grown,
          ringNext: state.ringNext + BATCH,
          total: state.total + BATCH,
          results: searchRingOp(grown),
        };
      }
    }
    expect(state.lines.length).toBe(7 * BATCH);
    expect(state.ring.size).toBe(6 * BATCH);
    expect(summaryLines(state)).toContain("matches 150 of error (ring)");
  });
});
