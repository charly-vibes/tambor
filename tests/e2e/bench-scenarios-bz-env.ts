// Purpose: the BZ6 environment rows of the bench scenario registry
//   (tambor-54j.18) — the third registry split (wave 4): the BZ row
//   file outgrew the gate's file limit again, so the newest rows live
//   here WITHOUT changing any scenario id (test names are contract
//   bindings; the harness selects rows by id).
// Responsibilities: the BZ6 Smalltalk-like environment quintet —
//   build, edit naive (re-fold all visible entries) vs edit fold
//   (incremental), rewind by full-history replay vs checkpoint
//   restore.
// Rationale: counter+checksum summary lines guard every scenario;
//   naive≡fold and replay≡ckpt state equality is pinned in
//   tests/bench-environment.test.ts.

import type { Scenario } from "./bench-scenarios-shared.ts";
import { buttonText } from "./bench-scenarios-shared.ts";

export const SCENARIOS_BZ_ENV: readonly Scenario[] = [
  {
    id: "bz6-build",
    // the seed builds the 100k-object table + 4096-entry history —
    // pinned by the status line (the node count cannot guard it: the
    // 24-entry window is drawn empty or not)
    expectedDrawn: 35,
    expectedText: "objs 100000 hist 4096 rewinds 0 sum 21446140",
    app: "environment (bench demo, dist/spa.js)",
    demoId: "environment",
    pointsOf: [buttonText("Seed 100k")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "bz6-edit-naive",
    // the §4.3 hazard: every edit re-folds ALL 24 window entries —
    // 13 edits read hist 4109 and the pinned window checksum
    expectedDrawn: 35,
    expectedText: "objs 100000 hist 4109 rewinds 0 sum 21446140",
    app: "environment (bench demo, dist/spa.js)",
    demoId: "environment",
    pointsOf: [buttonText("Edit naive")],
    drawnOps: ["Edit naive"],
    setupOf: buttonText("Seed 100k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz6-edit-fold",
    // the candidate: the same 13 edits, only the edited entry's fold
    // recomputed — the SAME line (window untouched by them)
    expectedDrawn: 35,
    expectedText: "objs 100000 hist 4109 rewinds 0 sum 21446140",
    app: "environment (bench demo, dist/spa.js)",
    demoId: "environment",
    pointsOf: [buttonText("Edit fold")],
    drawnOps: ["Edit fold"],
    setupOf: buttonText("Seed 100k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz6-rewind-replay",
    // the logo-pattern probe: rewind 512 behind the tip and return by
    // folding the whole world from EMPTY each op — 13 probes read
    // rewinds 13 and the untouched pre-seed checksum
    expectedDrawn: 35,
    expectedText: "objs 100000 hist 4096 rewinds 13 sum 21446140",
    app: "environment (bench demo, dist/spa.js)",
    demoId: "environment",
    pointsOf: [buttonText("Rewind replay")],
    drawnOps: ["Rewind replay"],
    setupOf: buttonText("Seed 100k"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "bz6-rewind-ckpt",
    // the candidate: the same probe, restored from the nearest
    // checkpoint snapshot (1024-entry replay instead of the full
    // world) — the SAME line must appear
    expectedDrawn: 35,
    expectedText: "objs 100000 hist 4096 rewinds 13 sum 21446140",
    app: "environment (bench demo, dist/spa.js)",
    demoId: "environment",
    pointsOf: [buttonText("Rewind ckpt")],
    drawnOps: ["Rewind ckpt"],
    setupOf: buttonText("Seed 100k"),
    ops: 12,
    warmupOps: 1,
  },
];
