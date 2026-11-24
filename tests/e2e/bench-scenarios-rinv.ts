// Purpose: the RINV row of the bench scenario registry (tambor-1cr
//   4.1) — the "1 streaming message in a 1,000-message history"
//   tail scenario of the add-runtime-invalidation change, registered
//   BEFORE any optimization lands (the PR-01 baseline rule).
// Responsibilities: the rinv-tail-1msg row only — Build 1000 history
//   as the untimed setup op (drawnSetup: the drawn-DOM ground truth,
//   the 18-char label's replay divergence risk), "Stream 1" (exactly
//   ONE quote per click, the smallest possible tail mutation) as the
//   drawn op, the summary-line no-op guard and the opt-in
//   countMutations flag that makes the harness emit per-op
//   DOM-mutation counts (tasks.md 4.2 compares them before/after §3).
// Rationale: its own rows file — the findings-bz.md wave-3 finding
//   (bench-scenarios-bz.ts outgrew the gate's 400-line file limit) —
//   so every registry file stays under the limit WITHOUT changing any
//   scenario id (test names are contract bindings; the harness
//   selects rows by id). One message moves one ticker row + the
//   summary + the book, so a full-rebuild baseline mutates the whole
//   drawn tree per op while the post-§3 floor is the changed rows:
//   the mutation count is the reuse evidence wall-clock alone cannot
//   give.

import type { Scenario } from "./bench-scenarios-shared.ts";
import { buttonText } from "./bench-scenarios-shared.ts";

export const SCENARIOS_RINV: readonly Scenario[] = [
  {
    id: "rinv-tail-1msg",
    // one quote into a 1,000-message history: after the setup op
    // (msgs 1000) + 1 warmup + 12 timed ops the summary line must read
    // exactly 1013 delivered messages — a dropped, duplicated or
    // burst-flipped op changes it (the summary line is itself
    // state-derived, so the guard reads the drawn DOM)
    expectedText: "tickers 500 msgs 1013",
    app: "stream dashboard (bench demo, dist/spa.js)",
    demoId: "stream-dashboard",
    pointsOf: [buttonText("Stream 1")],
    drawnSetup: "Build 1000 history",
    drawnOps: ["Stream 1"],
    ops: 12,
    warmupOps: 1,
    // tasks.md 4.2: the DOM-mutation count must drop to the changed
    // rows, not only wall-clock ms — opt in here so the baseline
    // (PR-01 rule: recorded before any optimization) already carries
    // result.mutations, one per-op count, parallel to samples
    countMutations: true,
  },
];
