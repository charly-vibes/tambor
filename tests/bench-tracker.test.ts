// Purpose: contract tests for the BZ4 tracker bench app (tambor-54j.16)
//   — the 5 000-issue board's seeds, memoised derived indexes and the
//   §4.3 op strategies must be correct before the browser scenarios
//   can be trusted to measure anything: the virtual-window move must
//   leave the SAME abstract board as the every-row move after the same
//   move cycle, the memo filter must read the SAME filtered lists the
//   naive rescan produces, and the optimistic edit must settle the
//   acked revision.
// Responsibilities: pin (a) the seeded board's shape (5 000 issues,
//   1 000 per column, 2 500 open, ascending id indexes), (b) the memo
//   indexes' incremental maintenance (a move touches only the two
//   boundary entries; every other column's array is reference-untouched),
//   (c) naive-vs-window move equality after a 13-move cycle (abstract
//   state deep-equal; naive's full draw sliced == the window's draw),
//   (d) filter naive-vs-memo equality INCLUDING the draw (the toggle's
//   only legal difference is the recompute work), (e) the optimistic
//   edit's clean-ack settle + revision-checksum movement, (f) the
//   drawn status guards (moves 13 / edits 13 / filter open …) and (g)
//   the ordinary dispatcher wire drives the ops (no benchmark-specific
//   path).
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op misroutes, no-ops or diverges produces meaningless
//   medians; equality against the naive strategy and the pinned guard
//   lines make "the candidate board is correct" a checked contract.

import { describe, it, expect } from "vitest";
import {
  COLUMN_COUNT,
  COLUMN_KEYS,
  EDIT_STRIDE,
  ISSUE_COUNT,
  VIS_ROWS,
  editOptimistic,
  editedId,
  filterMemo,
  filterNaive,
  moveNaive,
  moveWindow,
  movedId,
  revisionOf,
  seedTracker,
  statusLine,
  trackerState,
  windowBoard,
  windowSlice,
  type TrackerState,
} from "../src/examples/bench/tracker-board.ts";
import { children } from "../src/views/model.ts";
import {
  TRACKER_PATH,
  createTrackerApp,
  trackerDemoState,
  trackerView,
} from "../src/examples/bench/tracker.ts";

// A cycle of k timed ops through one strategy, from a fresh seed.
function cycle(k: number, op: (s: TrackerState) => TrackerState): TrackerState {
  let state = seedTracker();
  for (let i = 0; i < k; i++) state = op(state);
  return state;
}

// The abstract board state (everything but the op-chosen draw).
function abstractOf(state: TrackerState): Omit<TrackerState, "drawIds"> {
  const { drawIds: _drop, ...rest } = state;
  return rest;
}

describe("tracker bench app — seeded shape", () => {
  const state = seedTracker();

  it("seeds 5000 issues, 1000 per column, 2500 open", () => {
    expect(state.issues.length).toBe(ISSUE_COUNT);
    expect(ISSUE_COUNT).toBe(5000);
    expect(COLUMN_COUNT).toBe(COLUMN_KEYS.length);
    for (const ids of state.columns) expect(ids.length).toBe(1000);
    expect(
      state.openCols.reduce((n, ids) => n + ids.length, 0),
    ).toBe(2500);
  });

  it("indexes every issue id exactly once per index, ascending", () => {
    for (const ids of [...state.columns, ...state.openCols]) {
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i - 1]).toBeLessThan(ids[i] as number);
      }
    }
    const all = state.columns.flat();
    expect(all.length).toBe(ISSUE_COUNT);
    expect(new Set(all).size).toBe(ISSUE_COUNT);
  });

  it("seeds column membership i % 5 and open i % 2 === 0", () => {
    expect(state.issues[0]).toMatchObject({ col: 0, open: true });
    expect(state.issues[1]).toMatchObject({ col: 1, open: false });
    expect(state.issues[4999]).toMatchObject({ col: 4, open: false });
  });

  it("starts empty and seeds only through seedTracker", () => {
    const empty = trackerDemoState();
    expect(empty.issues.length).toBe(0);
    expect(empty.drawIds.length).toBe(0);
    expect(empty).toEqual(trackerState());
  });
});

describe("tracker bench app — memoised derived paths", () => {
  it("maintains the indexes incrementally: a move rewrites only the two boundary entries", () => {
    const before = seedTracker();
    const after = moveWindow(before);
    expect(after.moves).toBe(1);
    expect(movedId(0)).toBe(0);
    // untouched columns keep their array identity (no rescan, no copy)
    for (let c = 2; c < COLUMN_COUNT; c++) {
      expect(after.columns[c]).toBe(before.columns[c]);
      expect(after.openCols[c]).toBe(before.openCols[c]);
    }
    // the moved issue left column 0 and entered column 1
    expect(after.columns[0]).not.toContain(0);
    expect(after.columns[1]?.[0]).toBe(0);
    expect(after.issues[0]?.col).toBe(1);
  });

  it("matches a full-rescan recompute after each of 13 moves", () => {
    let incremental = seedTracker();
    for (let k = 0; k < 13; k++) {
      incremental = moveWindow(incremental);
      const rescanned = cycle(k + 1, moveNaive);
      expect(abstractOf(incremental)).toEqual(abstractOf(rescanned));
    }
  });
});

describe("tracker bench app — naive vs window move", () => {
  const naive = cycle(13, moveNaive);
  const window = cycle(13, moveWindow);

  it("leaves the SAME abstract state after the 13-move cycle", () => {
    expect(abstractOf(naive)).toEqual(abstractOf(window));
  });

  it("draws every row naively and only the window virtually", () => {
    expect(naive.drawIds.flat().length).toBe(ISSUE_COUNT);
    expect(window.drawIds.flat().length).toBe(VIS_ROWS * COLUMN_COUNT);
    expect(VIS_ROWS).toBe(8);
  });

  it("the naive full draw, window-sliced, IS the candidate's draw", () => {
    const sliced = naive.drawIds.map(windowSlice);
    expect(sliced).toEqual(window.drawIds);
  });

  it("moves are counter-cycled: ids 0..12 over 13 ops", () => {
    const seen: number[] = [];
    for (let k = 0; k < 13; k++) seen.push(movedId(k));
    expect(new Set(seen).size).toBe(13);
    expect(seen[12]).toBe(12);
  });

  it("leaves the pinned status guard: moves 13 and shifted column counts", () => {
    expect(statusLine(naive)).toBe(statusLine(window));
    expect(statusLine(naive)).toBe(
      "tracker 5000 cols 999 1000 1000 1001 1000 open 2500" +
        " moves 13 edits 0 filter all rev 10095527",
    );
  });
});

describe("tracker bench app — naive vs memo filter", () => {
  const naive = cycle(13, filterNaive);
  const memo = cycle(13, filterMemo);

  it("leaves the SAME state INCLUDING the draw after 13 toggles", () => {
    expect(naive).toEqual(memo);
  });

  it("ends filter-open after an odd toggle count", () => {
    expect(naive.filterOpen).toBe(true);
    expect(naive.drawIds.flat().length).toBe(8 * 5);
  });

  it("the memo toggle recomputes nothing (same index references)", () => {
    const before = seedTracker();
    const after = filterMemo(before);
    expect(after.columns).toBe(before.columns);
    expect(after.openCols).toBe(before.openCols);
  });

  it("the naive rescan reproduces the memoised open lists", () => {
    const seeded = seedTracker();
    const rescanned = filterNaive({ ...seeded, filterOpen: false });
    expect(rescanned.drawIds).toEqual(windowBoard(seeded.openCols));
  });

  it("leaves the pinned status guard: filter open, counters untouched", () => {
    expect(statusLine(naive)).toBe(statusLine(memo));
    expect(statusLine(memo)).toBe(
      "tracker 5000 cols 1000 1000 1000 1000 1000 open 2500" +
        " moves 0 edits 0 filter open rev 10092500",
    );
  });
});

describe("tracker bench app — optimistic edit", () => {
  it("edits are stride-cycled over distinct ids", () => {
    const seen: number[] = [];
    for (let k = 0; k < 13; k++) seen.push(editedId(k));
    expect(new Set(seen).size).toBe(13);
    expect(EDIT_STRIDE).toBe(7);
  });

  it("settles the acked revision: title r<version>, version bumped", () => {
    const before = seedTracker();
    const after = editOptimistic(before);
    expect(after.edits).toBe(1);
    expect(after.issues[0]).toMatchObject({
      version: 1,
      title: "issue 0 r1",
    });
    // indexes untouched: an edit changes no column membership or open flag
    expect(after.columns).toBe(before.columns);
    expect(after.openCols).toBe(before.openCols);
  });

  it("moves the revision checksum and leaves the pinned guard", () => {
    const before = seedTracker();
    const after = cycle(13, editOptimistic);
    expect(revisionOf(after.issues)).not.toBe(revisionOf(before.issues));
    expect(statusLine(after)).toBe(
      "tracker 5000 cols 1000 1000 1000 1000 1000 open 2500" +
        " moves 0 edits 13 filter all rev 10092539",
    );
  });
});

describe("tracker bench app — drawn guards and dispatcher wire", () => {
  it("draws the status line and per-column headers the scenarios pin", () => {
    const view = trackerView(seedTracker());
    const texts: string[] = [];
    const walk = (node: unknown): void => {
      const n = node as { type?: string; text?: string };
      if (n.type === "label" && typeof n.text === "string") texts.push(n.text);
      for (const child of children(node as never)) walk(child);
    };
    walk(view);
    expect(texts.some((t) => t.startsWith("tracker 5000"))).toBe(true);
    expect(texts).toContain("backlog 1000");
    expect(texts.filter((t) => t.startsWith("#")).length).toBe(8 * 5);
  });

  it("drives the ops through the ordinary dispatcher wire", async () => {
    const app = createTrackerApp();
    expect(TRACKER_PATH).toEqual([]);
    app.dispatch(["update", TRACKER_PATH, () => seedTracker()]);
    app.dispatch(["update", TRACKER_PATH, moveWindow]);
    const state = app.getState() as TrackerState;
    expect(state.moves).toBe(1);
    expect(state.issues.length).toBe(ISSUE_COUNT);
  });
});
