// Purpose: the bench scenario registry (tambor-yx8 + tambor-1jz +
//   tambor-di0 + tambor-bkg) — the declarative half of
//   tests/e2e/bench-apps.bench.ts
//   (the harness lives there; this file holds only what varies per
//   scenario: id, demo, op points, setup op, op counts).
// Responsibilities: the Scenario shape (with the expectedDrawn /
//   expectedText "the op actually happened" checks), the view-point
//   resolvers (button text, first visible todo row, form label — fixed
//   control-row / list-head positions), and SCENARIOS: keyed-table
//   build/ops, todomvc-ops, form-200-focus, turtle-20k draw/recolor,
//   save-restore-5k, time-travel-10k build/ops, dashboard-derived
//   build/bump, review-faults build/faults, and the BZ1 stream
//   dashboard trio (bz1-build, bz1-stream-naive, bz1-stream-frame —
//   the per-message-dispatch baseline vs the frame-coalesced
//   candidate, tambor-54j.13).
// Rationale: the ops are cycled, so a run's samples are labelled by
//   position in the cycle in the samples array (cycle order, per run) —
//   keyed-table-ops grows the table within a run (Append 1k), bounded
//   by the fresh page per run; save-restore-5k holds 5k plain items
//   steady (Save/Restore cycle — serialise/parse, no tree walk). The
//   registry is data, not machinery, so the bench harness stays a
//   single loop; the split keeps both files under the gate's file
//   limit without changing any scenario id (test names are contract
//   bindings).

import type { Elem } from "../../src/views/model.ts";
import { buttonPoint, pointWhere, type ViewPoint } from "./drive.ts";

// A view-point resolver: the fresh in-process view the page's initial
// view equals (pure views over plain state).
type PointOf = (view: Elem) => ViewPoint;

interface Scenario {
  /** minimum drawn-descendant count the op must produce — a no-op op
   * (state update silently dropped) would measure overhead only */
  readonly expectedDrawn?: number;
  /** drawn text the ops must leave in the demo — the count/checksum
   * form of the same no-op guard for summary-line apps */
  readonly expectedText?: string;
  readonly id: string;
  readonly app: string;
  readonly demoId: string;
  readonly pointsOf: readonly PointOf[];
  readonly setupOf?: PointOf;
  readonly ops: number;
  readonly warmupOps: number;
  /** drawn button texts cycled instead of the view-space points
   * (tambor-54j.13): the in-process replay measures labels at
   * text.length (defaultMeasure) while the bundle configures real
   * text metrics, so a non-first button's replay point can fall
   * inside the drawn first button's box — scenarios whose no-op guard
   * distinguishes the ops click the drawn button's live DOM box
   * (the drive.ts clickDrawnText ground truth) instead */
  readonly drawnOps?: readonly string[];
}

// The first visible row's toggle checkbox (list-head-stable position).
const firstCheckbox: PointOf = (view) =>
  pointWhere(view, (f) => f.underHandler && f.node.type === "checkbox");

// The first visible row's delete X (list-head-stable position).
const firstDeleteX: PointOf = (view) =>
  pointWhere(view, (f) => f.underHandler && f.node.type === "path");

// The op button with the given drawn text (fixed control-row position).
const buttonText = (text: string): PointOf => (view) => buttonPoint(view, text);

// A drawn label by its exact text (the form's field labels).
const labelText = (text: string): PointOf => (view) =>
  pointWhere(view, (f) => f.node.type === "label" && f.node.text === text);

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
];
