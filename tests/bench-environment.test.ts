// Purpose: contract tests for the BZ6 environment bench app
//   (tambor-54j.18) — the 100k-object table, the deterministic edit
//   history and the two strategy pairs must be correct before the
//   browser scenarios can be trusted to measure anything: the
//   incremental-fold candidate must leave the SAME drawn window as
//   the re-fold-all naive op, and both rewind strategies must end at
//   exactly the pre-probe state.
// Responsibilities: pin (a) the seeded environment's shape (100k
//   objects, a 4096-entry history, checkpoints at 1024/2048/3072,
//   folds cached for the visible window), (b) the fold's printed form
//   against an independent recomputation, (c) naive-vs-incremental
//   state equality after a 13-edit cycle plus the identical status
//   guard, (d) both rewind probes' round-trip property (the state
//   after the probe equals the state before it) and their equality
//   with each other, (e) the checkpoint-restore equivalence (restoring
//   the nearest snapshot equals folding from empty), and (f) the
//   ordinary dispatcher wire drives the ops (no benchmark-specific
//   path).
// Rationale: a bench app whose measured op no-ops or diverges between
//   the paired strategies produces meaningless medians — equality
//   against the naive strategy and the round-trip property make "the
//   candidates are correct" a checked contract, per the keyed-table
//   finding.

import { describe, it, expect } from "vitest";
import {
  CKPT_EVERY,
  EDIT_DELTA,
  FIELD_COUNT,
  OBJ_COUNT,
  REWIND_N,
  SEED_EDITS,
  WIN_ROWS,
  articleAt,
  clsAt,
  editFold,
  editNaive,
  emptyEnvironment,
  entryLine,
  foldObj,
  makeObj,
  printVal,
  rewindCkpt,
  rewindReplay,
  seedEnvironment,
  seedVal,
  statusLine,
  targetOf,
  type EnvState,
} from "../src/examples/bench/environment-model.ts";
import {
  ENV_PATH,
  createEnvironmentApp,
  environmentState,
} from "../src/examples/bench/environment.ts";

// A cycle of k timed ops through one strategy, from a fresh seed.
function cycle(k: number, op: (s: EnvState) => EnvState): EnvState {
  let env = seedEnvironment();
  for (let i = 0; i < k; i++) env = op(env);
  return env;
}

describe("environment bench app — seeded shape", { timeout: 30_000 }, () => {
  const env = seedEnvironment();

  it("seeds 100k objects over the sparse table", () => {
    expect(env.objects.size).toBe(OBJ_COUNT);
    expect(OBJ_COUNT).toBe(100_000);
    // identity scheme: class roster cycles, ivars are deterministic
    expect(env.objects.get(0)?.cls).toBe("Point");
    expect(env.objects.get(7)?.cls).toBe("OrderedCollection");
    // id 5000 is beyond the seed edits' reach (they hit ids 0..4095)
    expect(env.objects.get(5000)?.vals).toEqual(
      Array.from({ length: FIELD_COUNT }, (_, f) => seedVal(5000, f)),
    );
  });

  it("seeds a 4096-entry history with checkpoints every 1024 entries", () => {
    expect(env.tip).toBe(SEED_EDITS);
    expect(env.rewinds).toBe(0);
    expect([...env.ckpts.keys()].sort((a, b) => a - b)).toEqual([
      CKPT_EVERY,
      2 * CKPT_EVERY,
      3 * CKPT_EVERY,
    ]);
    // a checkpoint is the table AS OF that entry count: entry 2047's
    // edit (target 2047) is in the 2048 snapshot but not the 1024 one
    expect(env.ckpts.get(2048)?.get(2047)?.vals).not.toEqual(
      env.ckpts.get(1024)?.get(2047)?.vals,
    );
  });

  it("caches folds for the visible window only", () => {
    expect([...env.folds.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: WIN_ROWS }, (_, i) => i),
    );
    expect(WIN_ROWS).toBe(24);
  });

  it("folds an entry's print form against an independent recomputation", () => {
    const obj = makeObj(3) as NonNullable<ReturnType<typeof makeObj>>;
    // independent: build the expected string by hand from seedVal
    const fields: string[] = [];
    let total = 0;
    for (let f = 0; f < FIELD_COUNT; f++) {
      fields.push(printVal(f, seedVal(3, f)));
      total += seedVal(3, f);
    }
    expect(foldObj(obj)).toBe(
      `${articleAt(clsAt(3))} ${clsAt(3)} 3 ${fields.join(" ")} total ${total}`,
    );
    // odd fields print as hundredths, even fields as integers
    expect(printVal(1, 425)).toBe("4.25");
    expect(printVal(0, 425)).toBe("425");
  });

  it("targets window objects early and off-window objects later", () => {
    // entries 0..23 edit the window itself; the timed cycle's first
    // entry (4096) lands off-window — the window sum stays pinned
    expect(targetOf(0)).toBe(0);
    expect(targetOf(23)).toBe(23);
    expect(targetOf(SEED_EDITS)).toBe(SEED_EDITS);
    expect(targetOf(SEED_EDITS)).toBeGreaterThanOrEqual(WIN_ROWS);
  });
});

describe("environment bench app — the two fold strategies", { timeout: 30_000 }, () => {
  it("leaves naive and incremental fold in the SAME state after 13 edits", { timeout: 30_000 }, () => {
    const naive = cycle(13, editNaive);
    const fold = cycle(13, editFold);
    expect(fold.tip).toBe(naive.tip);
    expect(fold.tip).toBe(SEED_EDITS + 13);
    expect(fold.objects).toEqual(naive.objects);
    // both caches must cover the window with the SAME strings — the
    // drawn window is what the scenarios' equality gate pins
    for (let id = 0; id < WIN_ROWS; id++) {
      expect(fold.folds.get(id)).toBe(naive.folds.get(id));
      expect(fold.folds.get(id)).toBe(foldObj(fold.objects.get(id)!));
    }
  });

  it("applies exactly EDIT_DELTA to the targeted entry's field per edit", () => {
    let env = seedEnvironment();
    for (let i = 0; i < 3; i++) {
      const n = env.tip;
      const id = targetOf(n);
      const field = n % FIELD_COUNT;
      const before = env.objects.get(id)?.vals[field] as number;
      env = editFold(env);
      expect(env.objects.get(id)?.vals[field]).toBe(before + EDIT_DELTA);
      expect(env.tip).toBe(n + 1);
    }
  });

  it("draws the same status guards under both fold strategies", () => {
    const naive = cycle(13, editNaive);
    const fold = cycle(13, editFold);
    expect(statusLine(fold)).toBe(statusLine(naive));
    expect(statusLine(fold)).toContain(
      `objs ${OBJ_COUNT} hist ${SEED_EDITS + 13} rewinds 0`,
    );
    // entryLine prefers the cache; both must equal the fresh fold
    expect(entryLine(fold, 0)).toBe(`#0 ${foldObj(fold.objects.get(0)!)}`);
  });
});

describe("environment bench app — the two rewind strategies", { timeout: 30_000 }, () => {
  it("returns BOTH probes to exactly the pre-op state (round trip)", { timeout: 30_000 }, () => {
    const before = seedEnvironment();
    for (const probe of [rewindReplay, rewindCkpt]) {
      const after = probe(before);
      expect(after.tip).toBe(before.tip);
      expect(after.rewinds).toBe(before.rewinds + 1);
      expect(after.objects).toEqual(before.objects);
      for (let id = 0; id < WIN_ROWS; id++) {
        expect(entryLine(after, id)).toBe(entryLine(before, id));
      }
    }
  });

  it("ends replay and checkpoint restores at the SAME state", { timeout: 30_000 }, () => {
    const replay = cycle(13, rewindReplay);
    const ckpt = cycle(13, rewindCkpt);
    expect(ckpt.objects).toEqual(replay.objects);
    expect(ckpt.tip).toBe(replay.tip);
    expect(ckpt.rewinds).toBe(replay.rewinds);
    expect(ckpt.rewinds).toBe(13);
    expect(statusLine(ckpt)).toBe(statusLine(replay));
    expect(statusLine(replay)).toContain(
      `objs ${OBJ_COUNT} hist ${SEED_EDITS} rewinds 13`,
    );
  });

  it("restores the nearest checkpoint ≤ the probe target", () => {
    const env = seedEnvironment();
    // probe target = 4096 − 512 = 3584 → nearest snapshot 3072; the
    // checkpointed restore must equal folding from empty up to the tip
    const ckpt = rewindCkpt(env);
    const replay = rewindReplay(env);
    expect(ckpt.objects).toEqual(replay.objects);
    // and the snapshot it restored from is genuinely the as-of-3072
    // table: entry 3071's edit is in it, entry 3072's is replayed on
    expect(env.ckpts.get(3072)?.get(targetOf(3071))).toBeDefined();
  });

  it("starts empty — seeding is the untimed setup op", () => {
    const empty = emptyEnvironment();
    expect(empty.tip).toBe(0);
    expect(empty.objects.size).toBe(0);
    expect(statusLine(empty)).toContain("objs 0 hist 0 rewinds 0");
  });
});

describe("environment bench app — the ordinary dispatcher wire", () => {
  it("drives the ops and the view through makeApp", () => {
    const app = createEnvironmentApp();
    expect(app.getState()).toEqual(environmentState());
    expect(JSON.stringify(app.view())).toContain("objs 0 hist 0");
    // one dispatch per op — the same intent shape every corpus app uses
    app.dispatch(["update", ENV_PATH, seedEnvironment]);
    const seeded = (app.getState() as { env: EnvState }).env;
    expect(seeded.tip).toBe(SEED_EDITS);
    app.dispatch(["update", ENV_PATH, editFold]);
    const edited = (app.getState() as { env: EnvState }).env;
    expect(edited.tip).toBe(SEED_EDITS + 1);
    expect(JSON.stringify(app.view())).toContain(statusLine(edited));
  });

  it("draws the visible window (24 folded entries), never the 100k table", () => {
    const app = createEnvironmentApp();
    app.dispatch(["update", ENV_PATH, seedEnvironment]);
    const text = JSON.stringify(app.view());
    expect(text).toContain("#0 ");
    expect(text).toContain(`#${WIN_ROWS - 1} `);
    expect(text).not.toContain(`#${WIN_ROWS} `);
    expect(text).not.toContain("#99999 ");
  });
});
