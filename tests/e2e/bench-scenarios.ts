// Purpose: the bench scenario registry (tambor-yx8 + tambor-1jz +
//   tambor-di0 + tambor-bkg) — the declarative half of
//   tests/e2e/bench-apps.bench.ts
//   (the harness lives there; this file holds only what varies per
//   scenario: id, demo, op points, setup op, op counts).
// Responsibilities: the Scenario shape + the view-point resolvers
//   (button text, first visible todo row, form label — fixed
//   control-row / list-head positions) live in
//   bench-scenarios-shared.ts; this file holds the keyed-table,
//   todomvc, form-200, turtle-20k, save-restore-5k, time-travel-10k,
//   dashboard-derived, review-faults and log-stream rows, and
//   re-exports SCENARIOS with the BZ rows (bench-scenarios-bz.ts —
//   split out here to keep every registry file under the gate's file
//   limit WITHOUT changing any scenario id; test names are contract
//   bindings).
// Rationale: the ops are cycled, so a run's samples are labelled by
//   position in the cycle in the samples array (cycle order, per run) —

import {
  type Scenario,
  buttonText,
  firstCheckbox,
  firstDeleteX,
  labelText,
} from "./bench-scenarios-shared.ts";
import { SCENARIOS_BZ } from "./bench-scenarios-bz.ts";

export type { Scenario } from "./bench-scenarios-shared.ts";

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "keyed-table-build",
    expectedDrawn: 1000,
    app: "keyed-table (bench demo, dist/spa.js)",
    demoId: "keyed-table",
    pointsOf: [buttonText("Build 1000")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "keyed-table-ops",
    app: "keyed-table (bench demo, dist/spa.js)",
    demoId: "keyed-table",
    pointsOf: [
      buttonText("Replace 10%"),
      buttonText("Swap Rows"),
      buttonText("Remove 10"),
      buttonText("Append 1k"),
    ],
    setupOf: buttonText("Build 1000"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "todomvc-ops",
    app: "todo at scale (bench demo, dist/spa.js)",
    demoId: "todomvc",
    pointsOf: [
      buttonText("Add Todo"),
      firstCheckbox,
      firstDeleteX,
    ],
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "form-200-focus",
    app: "200-field form (bench demo, dist/spa.js)",
    demoId: "form-200",
    // five spread fields, cycled — each click routes the ordinary
    // request-focus/edit intents and re-derives the whole 200-field view
    pointsOf: [
      labelText("field 0"),
      labelText("field 50"),
      labelText("field 100"),
      labelText("field 150"),
      labelText("field 199"),
    ],
    ops: 10,
    warmupOps: 1,
  },
  {
    id: "turtle-20k-draw",
    expectedDrawn: 20000,
    app: "turtle 20k (bench demo, dist/spa.js)",
    demoId: "turtle-20k",
    pointsOf: [buttonText("Draw 20k")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "turtle-20k-recolor",
    app: "turtle 20k (bench demo, dist/spa.js)",
    demoId: "turtle-20k",
    pointsOf: [buttonText("Recolor red")],
    setupOf: buttonText("Draw 20k"),
    ops: 10,
    warmupOps: 1,
  },
  {
    id: "save-restore-5k",
    // the summary line still reads 5000 items after the Save/Restore
    // cycle — a dropped update or a corrupt restore would change it
    expectedText: "items 5000",
    app: "save/restore 5k (bench demo, dist/spa.js)",
    demoId: "save-restore-5k",
    pointsOf: [buttonText("Save"), buttonText("Restore")],
    setupOf: buttonText("Build 5k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "time-travel-10k-build",
    expectedDrawn: 10000,
    app: "time travel 10k (bench demo, dist/spa.js)",
    demoId: "time-travel-10k",
    pointsOf: [buttonText("Build 10k")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "review-build",
    // submit moves all 200 drafts — the counts line is the no-op guard
    expectedText: "submitted 200",
    app: "review faults (bench demo, dist/spa.js)",
    demoId: "review-faults",
    pointsOf: [buttonText("Submit all")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "review-faults",
    // honest ack + the three injections cycled over a submitted queue:
    // after warmup + 12 timed ops (4-point cycle ×3) the fault log reads
    // 3 duplicate + 3 stale + 3 lost — a dropped or mis-applied fault
    // would change the summary line
    expectedText: "fault log 9",
    app: "review faults (bench demo, dist/spa.js)",
    demoId: "review-faults",
    pointsOf: [
      buttonText("Ack next"),
      buttonText("Duplicate ack"),
      buttonText("Stale ack"),
      buttonText("Drop ack"),
    ],
    setupOf: buttonText("Submit all"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "time-travel-10k-ops",
    app: "time travel 10k (bench demo, dist/spa.js)",
    demoId: "time-travel-10k",
    // scrub 5k ↔ 10k and undo-one cycled: each op re-derives the whole
    // visible prefix (5k–10k labels) — the honest whole-view measure
    pointsOf: [
      buttonText("Scrub to 5k"),
      buttonText("Scrub to 10k"),
      buttonText("Undo one"),
    ],
    setupOf: buttonText("Build 10k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "dashboard-build",
    // the seeded dashboard draws its ~20 tiles — a silently dropped
    // seed would leave the grid empty
    expectedDrawn: 20,
    app: "dashboard derived (bench demo, dist/spa.js)",
    demoId: "dashboard-derived",
    pointsOf: [buttonText("Seed")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "log-stream-naive-append",
    // unbounded ingest: after warmup + 12 ops the naive corpus holds
    // 13 × 250 = 3250 lines — and all of them are drawn (the memory
    // growth the BZ5 row predicts); a dropped append would leave the
    // count short
    expectedDrawn: 3300,
    expectedText: "all 3250",
    app: "log stream (bench demo, dist/spa.js)",
    demoId: "log-stream",
    pointsOf: [buttonText("Append 250")],
    drawnOps: ["Append 250"],
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "log-stream-ring-append",
    // the candidate: the ring keeps only the newest 2000 of the 3250
    // ingested lines (oldest dropped) and draws a fixed-height window —
    // the kept count is the no-op guard
    expectedText: "kept 2000",
    app: "log stream (bench demo, dist/spa.js)",
    demoId: "log-stream",
    pointsOf: [buttonText("Ring append 250")],
    drawnOps: ["Ring append 250"],
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "log-stream-search",
    // the Search all / Search ring cycle (ingest-then-search): warmup
    // + 6 cycles each — naive corpus 1750 lines, ring 1500 (ids 0..1499,
    // error every 10th id) — so the last op's outcome line reads 150
    // ring matches; a dropped append or a mis-scanned corpus would
    // change the count
    expectedText: "matches 150 of error",
    app: "log stream (bench demo, dist/spa.js)",
    demoId: "log-stream",
    pointsOf: [buttonText("Search all"), buttonText("Search ring")],
    drawnOps: ["Search all", "Search ring"],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "dashboard-bump",
    // the count tile still reads 500 after the Bump / Bump 100 cycle —
    // every timed op re-derives all ~20 tiles from the bumped series
    expectedText: "count 500",
    app: "dashboard derived (bench demo, dist/spa.js)",
    demoId: "dashboard-derived",
    pointsOf: [buttonText("Bump"), buttonText("Bump 100")],
    setupOf: buttonText("Seed"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "notebook-chain-200",
    // the B9 reactive notebook (tambor-54j.9): setup builds the 200-cell
    // dependency chain (full run → ran 209/209); every timed op is one
    // +1 step on the chain base's slider path (the same intent shape a
    // slider gesture produces — update the sliders map, launch with only
    // the slider's cell dirty), so each op re-runs exactly the 201-cell
    // dependent closure through the killable Worker: the stats line
    // reading ran 201/209 (not 209/209) is the misroute guard — a
    // dropped or misrouted op leaves the full-run count and fails
    // loudly. Both clicks ride the drawn-DOM ground truth (drawnOps/
    // drawnSetup): the demo's title/stats labels above the control row
    // replay taller-unit-measured than the bundle's real metrics, so
    // view-space points land off the drawn buttons (the SIDE BAND
    // replay-divergence finding, tambor-54j.17).
    expectedText: "ran 201/209",
    app: "notebook (bench demo, dist/spa.js)",
    demoId: "notebook",
    pointsOf: [buttonText("+1 chain")],
    drawnOps: ["+1 chain"],
    drawnSetup: "+200 chained",
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "virt-list-10k-whole",
    // the failing-before meter (tambor-54j.8.2): every timed op is one
    // +1-row scroll whose draw is the honest whole-view redraw of all
    // 10k rows — the readout still reads drawn 10000, so a dropped or
    // mode-flipped op fails loudly
    expectedDrawn: 10000,
    expectedText: "drawn 10000",
    app: "virtual list (bench demo, dist/spa.js)",
    demoId: "virtual-list",
    pointsOf: [buttonText("Scroll down")],
    setupOf: buttonText("Draw all 10k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "virt-list-10k-window",
    // the windowed candidate (tambor-54j.8.2): the same +1-row scroll
    // op over the same 10k summaries, drawn through
    // components.virtual_list — only the window's rows exist in the
    // drawn DOM. The readout's from/at lines are ratios of the row
    // pitch (the first window index and the offset in rows), so they
    // are metric-independent guards: a dropped op reads at 12, a
    // whole-view flip reads from 0 / drawn 10000.
    expectedText: "window from 13 at 13",
    app: "virtual list (bench demo, dist/spa.js)",
    demoId: "virtual-list",
    pointsOf: [buttonText("Scroll down")],
    drawnSetup: "Window 10k",
    drawnOps: ["Scroll down"],
    ops: 12,
    warmupOps: 1,
  },
  ...SCENARIOS_BZ,
];