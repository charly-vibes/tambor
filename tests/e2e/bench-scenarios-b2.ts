// Purpose: the B2 row of the bench scenario registry (add-keyed-dom-
//   reconciliation task 5.0) — reorder/insert/remove churn on a
//   memo-stable keyed list, registered and measured BEFORE the keyed
//   splice mechanism lands (the PR-01 baseline rule, rinv precedent).
// Responsibilities: the b2-keyed-churn row only — Build 1000 as the
//   untimed drawn setup, then a cycling churn op set (Swap Rows = the
//   reorder, Insert first = the mid-list insert whose positional cost
//   the keyed splice exists to kill, Remove 10 = the remove, Replace
//   10% = the relabel control that must stay a build either way), with
//   countMutations so the baseline carries per-op DOM-mutation counts —
//   the invariant the keyed re-run must move (moved rows moved, not
//   rebuilt).
// Rationale: its own rows file (the findings-bz.md wave-3 precedent —
//   registry files stay under the gate's 400-line limit WITHOUT
//   changing scenario ids). The demo's rows render through
//   components.memo keyed on row-object identity, so today's positional
//   rule already splices same-position rows; the churn set is chosen so
//   the BASELINE still shows the whole-tail cost of every position
//   shift: Insert first rebuilds rows 1..999, Swap Rows rebuilds the
//   swapped pair's wrappers, Remove 10 rebuilds every row after each
//   removed index. The keyed re-run (task 5.1) must drop mutations to
//   the structural delta.
import type { Scenario } from "./bench-scenarios-shared.ts";
import { buttonText } from "./bench-scenarios-shared.ts";

export const SCENARIOS_B2: readonly Scenario[] = [
  {
    id: "b2-keyed-churn",
    // after the setup (1000 rows) + 1 warmup + 2 churn cycles the table
    // must hold 1000 + 2 (two inserts) + 2000 (two appends) - 20 (two
    // removes) = 2982 drawn rows — a dropped, duplicated or
    // burst-flipped op shifts the count (the drawn-row count is the
    // no-op guard; there is no summary line in this demo)
    expectedDrawn: 1000,
    app: "keyed-table (bench demo, dist/spa.js)",
    demoId: "keyed-table",
    // drawnOps, not pointsOf: "Replace 10%" is a band's second button —
    // the replay point falls inside the drawn first button's box
    // (tambor-54j.17), and the misdirected click fired Build 1000
    // instead (a full ~2000-element rebuild measured as the replace op)
    pointsOf: [
      buttonText("Swap Rows"),
      buttonText("Insert first"),
      buttonText("Remove 10"),
      buttonText("Replace 10%"),
    ],
    drawnOps: ["Swap Rows", "Insert first", "Remove 10", "Replace 10%"],
    drawnSetup: "Build 1000",
    ops: 8,
    warmupOps: 1,
    countMutations: true,
  },
];
