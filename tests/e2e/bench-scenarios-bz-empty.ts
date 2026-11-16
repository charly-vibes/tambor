// Purpose: the plots empty-state bench row (tambor-yew) — Pan naive and
//   Zoom naive clicked BEFORE Load, over plotState()'s empty points.
// Responsibilities: one Scenario entry; the naive ops must be total on
//   the empty state (the guard returns the state unchanged, never an
//   uncaught TypeError), so both clicks leave the plots demo's summary
//   line reading "no data" with no bands drawn. The bench harness's
//   pageerror listener is what makes this row meaningful: expectedText
//   alone cannot tell a no-op from a crash.
// Rationale: split out of bench-scenarios-bz.ts when that registry grew
//   past the 400-line pretender cap — the row is a standalone
//   empty-state probe, not part of the BZ1/BZ2 op quintets.

import type { Scenario } from "./bench-scenarios-shared.ts";
import { buttonText } from "./bench-scenarios-shared.ts";

export const SCENARIOS_BZ_EMPTY: readonly Scenario[] = [
  {
    id: "bz2-ops-before-load",
    expectedText: "no data",
    app: "interactive plots (bench demo, dist/spa.js)",
    demoId: "plots",
    pointsOf: [buttonText("Pan naive"), buttonText("Zoom naive")],
    drawnOps: ["Pan naive", "Zoom naive"],
    ops: 2,
    warmupOps: 0,
  },
];