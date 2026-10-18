// Purpose: the BZ rows of the bench scenario registry (the chat-repo
//   cold-read benchmark suite, tambor-54j.7) — split out of
//   tests/e2e/bench-scenarios.ts to keep every registry file under the
//   gate's file limit WITHOUT changing any scenario id (test names are
//   contract bindings; the harness selects rows by id).
// Responsibilities: the BZ1 stream-dashboard trio (tambor-54j.13), the
//   BZ2 interactive-plots quintet (tambor-54j.14 — pan/zoom naive vs
//   pan/zoom-as-transform over a decimated 100k domain), the BZ7
//   spreadsheet trio (tambor-54j.19 — the full-recompute baseline vs
//   the dependency-graph candidate over the same literal edits), and
//   the BZ4 tracker sextet (tambor-54j.16 — the render-every-row board
//   vs the virtual window over the same moves, the recomputed-filter
//   rescan vs the memoised derived indexes over the same toggles, and
//   the optimistic edit's clean-ack wire; conflict outcomes are the
//   wanna tracker's candidate, deferred).
// Rationale: the ops are cycled, so a run's samples are labelled by
//   position in the cycle in the samples array (cycle order, per run);
//   each row carries its own expectedText/expectedDrawn no-op guard so
//   a dropped or misrouted op fails loudly instead of measuring
//   overhead.

import type { Scenario } from "./bench-scenarios-shared.ts";
import { buttonText } from "./bench-scenarios-shared.ts";

export const SCENARIOS_BZ: readonly Scenario[] = [
  {
    id: "bz1-build",
    // the built dashboard draws its 500 ticker rows — a silently
    // dropped build would leave the stream empty
    expectedDrawn: 500,
    app: "stream dashboard (bench demo, dist/spa.js)",
    demoId: "stream-dashboard",
    pointsOf: [buttonText("Build 500")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "bz1-stream-naive",
    // one dispatch PER message (80 per op): after warmup + 12 timed
    // ops the summary line reads 13 × 80 = 1040 messages delivered —
    // a dropped or duplicated message changes it
    expectedText: "msgs 1040",
    app: "stream dashboard (bench demo, dist/spa.js)",
    demoId: "stream-dashboard",
    pointsOf: [buttonText("Stream naive")],
    drawnOps: ["Stream naive"],
    setupOf: buttonText("Build 500"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz1-stream-frame",
    // the coalesced candidate: the same 80-message burst folded into
    // ONE update intent, so the same 1040 msgs must be on the line
    expectedText: "msgs 1040",
    app: "stream dashboard (bench demo, dist/spa.js)",
    demoId: "stream-dashboard",
    pointsOf: [buttonText("Stream frame")],
    drawnOps: ["Stream frame"],
    setupOf: buttonText("Build 500"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz2-plots-build",
    // the load builds 100k points + the two full-domain band indexes
    // and draws the initial 800-band window per chart — 1600 real path
    // nodes; a silently dropped load would leave the charts empty
    expectedDrawn: 1600,
    expectedText: "pts 100000",
    app: "interactive plots (bench demo, dist/spa.js)",
    demoId: "plots",
    pointsOf: [buttonText("Load 100k")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "bz2-pan-naive",
    // the §4.3 BZ2 hazard: every pan copies the 40k window and
    // re-derives its decimation from the raw points, both charts —
    // warmup + 12 timed ops (13 × 10k steps over the 60k slideable
    // range) wrap to a deterministic win 10000 (the full-line no-op
    // guard: a dropped or misrouted pan leaves win 0 w 40000 pans 0)
    expectedText: "win 10000 w 40000 pans 13",
    app: "interactive plots (bench demo, dist/spa.js)",
    demoId: "plots",
    pointsOf: [buttonText("Pan naive")],
    drawnOps: ["Pan naive"],
    setupOf: buttonText("Load 100k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz2-pan-tx",
    // the candidate: the same 13-step pan cycle, but the drawn bands
    // are a slice of the precomputed index (data by reference, pan as
    // transform) — the same full line must appear
    expectedText: "win 10000 w 40000 pans 13",
    app: "interactive plots (bench demo, dist/spa.js)",
    demoId: "plots",
    pointsOf: [buttonText("Pan tx")],
    drawnOps: ["Pan tx"],
    setupOf: buttonText("Load 100k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz2-zoom-naive",
    // zoom halves the window (floored at 10k) and the naive op
    // re-derives the denser decimation from the raw points each op —
    // warmup + 12 timed ops floor at the guarded w 10000 (the full
    // line: a dropped zoom would leave w 40000)
    expectedText: "win 0 w 10000 pans 13",
    app: "interactive plots (bench demo, dist/spa.js)",
    demoId: "plots",
    pointsOf: [buttonText("Zoom naive")],
    drawnOps: ["Zoom naive"],
    setupOf: buttonText("Load 100k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz2-zoom-tx",
    // the candidate zoom: the same floor, bands sliced from the index
    expectedText: "win 0 w 10000 pans 13",
    app: "interactive plots (bench demo, dist/spa.js)",
    demoId: "plots",
    pointsOf: [buttonText("Zoom tx")],
    drawnOps: ["Zoom tx"],
    setupOf: buttonText("Load 100k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz7-build",
    // the seeded sheet draws its 24×10 window over the 1M logical grid
    // and the status line pins the defined-formula count — a silently
    // dropped seed would leave the window all empty markers
    expectedDrawn: 240,
    expectedText: "formulas 90000",
    app: "spreadsheet (bench demo, dist/spa.js)",
    demoId: "spreadsheet",
    pointsOf: [buttonText("Seed")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "bz7-edit-naive",
    // the §4.3 hazard: after warmup + 12 timed edits the counter reads
    // 13 and the values checksum matches the graph scenario's exactly —
    // a dropped edit or a misrecompute changes the line
    expectedDrawn: 240,
    expectedText: "edits 13 sum 160480317064",
    app: "spreadsheet (bench demo, dist/spa.js)",
    demoId: "spreadsheet",
    pointsOf: [buttonText("Edit naive")],
    drawnOps: ["Edit naive"],
    setupOf: buttonText("Seed"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz7-edit-graph",
    // the candidate: the same 13 edits, dependency-graph recompute —
    // the same checksum must be on the line (naive-vs-graph state
    // equality is the correctness gate on the measured ops)
    expectedDrawn: 240,
    expectedText: "edits 13 sum 160480317064",
    app: "spreadsheet (bench demo, dist/spa.js)",
    demoId: "spreadsheet",
    pointsOf: [buttonText("Edit graph")],
    drawnOps: ["Edit graph"],
    setupOf: buttonText("Seed"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz4-build",
    // the seeded board draws its 40 window rows (8 per column × 5) —
    // a silently dropped seed would leave the board header-only
    expectedDrawn: 45,
    expectedText: "tracker 5000 cols 1000 1000 1000 1000 1000 open 2500",
    app: "tracker (bench demo, dist/spa.js)",
    demoId: "tracker",
    pointsOf: [buttonText("Seed")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "bz4-move-naive",
    // the §4.3 hazard: after warmup + 13 moves the board derives +
    // draws ALL 5000 issue rows per op — the line pins the shifted
    // column counts (ids 0..12 moved one column right) and revision
    // checksum, so a dropped or misrouted move fails loudly
    expectedDrawn: 4000,
    expectedText: "cols 999 1000 1000 1001 1000 open 2500 moves 13",
    app: "tracker (bench demo, dist/spa.js)",
    demoId: "tracker",
    pointsOf: [buttonText("Move naive")],
    drawnOps: ["Move naive"],
    setupOf: buttonText("Seed"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz4-move-window",
    // the virtual-list candidate: the SAME 13 moves, the SAME final
    // board (the line must match move-naive exactly) — the only
    // variable is the drawn surface (8 rows × 5 columns)
    expectedDrawn: 45,
    expectedText: "cols 999 1000 1000 1001 1000 open 2500 moves 13",
    app: "tracker (bench demo, dist/spa.js)",
    demoId: "tracker",
    pointsOf: [buttonText("Move window")],
    drawnOps: ["Move window"],
    setupOf: buttonText("Seed"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz4-filter-naive",
    // the §4.3 hazard: after warmup + 13 toggles the board rescans
    // all 5000 issues per op to rebuild the filtered lists — 13 odd
    // toggles land filter open (the window draw matches the memo op,
    // so the measured delta is the recompute alone)
    expectedDrawn: 45,
    expectedText: "moves 0 edits 0 filter open rev 10092500",
    app: "tracker (bench demo, dist/spa.js)",
    demoId: "tracker",
    pointsOf: [buttonText("Filter naive")],
    drawnOps: ["Filter naive"],
    setupOf: buttonText("Seed"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz4-filter-memo",
    // the memoised-derived-paths candidate: the same 13 toggles read
    // the per-column indexes the ops maintain — the SAME line (and
    // the SAME draw) as filter-naive
    expectedDrawn: 45,
    expectedText: "moves 0 edits 0 filter open rev 10092500",
    app: "tracker (bench demo, dist/spa.js)",
    demoId: "tracker",
    pointsOf: [buttonText("Filter memo")],
    drawnOps: ["Filter memo"],
    setupOf: buttonText("Seed"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz4-edit",
    // the optimistic edit + clean-ack reconcile over the window board:
    // after warmup + 13 edits the counter reads 13 and the revision
    // checksum has moved — a lost or duplicated edit changes the line
    // (conflict OUTCOMES are the wanna tracker's candidate, deferred)
    expectedDrawn: 45,
    expectedText: "edits 13 filter all rev 10092539",
    app: "tracker (bench demo, dist/spa.js)",
    demoId: "tracker",
    pointsOf: [buttonText("Opt edit")],
    drawnOps: ["Opt edit"],
    setupOf: buttonText("Seed"),
    ops: 12,
    warmupOps: 1,
  },
];
