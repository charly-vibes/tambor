// Purpose: behaviour contract for tests/helpers/heavy-lock.ts — the
//   cross-process lock the heavy vitest files use to serialise
//   against each other (CI-red 42082454763 follow-up).
// Responsibilities: prove the four properties the production consumers
//   rely on: (1) acquisition returns a release that frees the lock;
//   (2) a second acquisition cannot proceed while a first holds;
//   (3) the waiter proceeds after release; (4) a stale lock (older
//   than the TTL — a crashed worker) is seized, not waited on.
// Rationale: the lock is the exclusion primitive for the shared-tree
//   races (npm pack vs prepack tsc on dist/, build-spa wipes of
//   demo-dist/, the docs generator wiping its outdir). If exclusion
//   itself is broken the suite is silently racy again. Every test uses
//   a scratch lock name/dir — never the production "heavy" identity —
//   so this file can run in parallel with the heavy files themselves.

// @ts-expect-error node builtin (tsconfig types exclude node; repo
// test-local pin convention)
import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
// @ts-expect-error node builtin (tsconfig types exclude node; repo
// test-local pin convention)
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";

import { acquireHeavyLock } from "./helpers/heavy-lock.ts";

// Structural process handle (tsconfig types exclude @types/node).
const proc = globalThis as unknown as {
  process: {
    readonly execPath: string;
    env: Record<string, string | undefined>;
  };
};

const SCRATCH_DIR = "target/locks-test";
const NAME = "scratch";
const LOCK_PATH = `${SCRATCH_DIR}/${NAME}.d`;

function cleanScratch(): void {
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
}

async function acquireScratch(overrides?: {
  readonly maxWaitMs?: number;
  readonly ttlMs?: number;
}) {
  return acquireHeavyLock({
    name: NAME,
    dir: SCRATCH_DIR,
    ...overrides,
  });
}

// The timers global reached structurally (same pattern as the helper).
const timers = globalThis as unknown as {
  setTimeout: (f: () => void, ms: number) => unknown;
};
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    timers.setTimeout(resolve, ms);
  });
}

// A pid that is definitively dead: spawn a child that exits
// immediately and use its reaped pid — process.kill(pid, 0) then
// throws ESRCH (pid-reuse reuse aside, deterministically dead here).
function deadPid(): number {
  const child = spawnSync(proc.process.execPath, ["-e", ""], { encoding: "utf8" });
  return child.pid;
}

// A full hand-rolled crashed-worker lock: stale dir + a dead holder.
function plantDeadLock(): Date {
  mkdirSync(SCRATCH_DIR, { recursive: true });
  mkdirSync(LOCK_PATH);
  writeFileSync(`${LOCK_PATH}/holder`, String(deadPid()));
  const now = new Date();
  utimesSync(LOCK_PATH, now, new Date(now.getTime() - 10 * 60_000));
  return now;
}

afterEach(cleanScratch);

it("acquisition succeeds on a free lock and release frees it", async () => {
  const release = await acquireScratch({ maxWaitMs: 2_000 });
  expect(() => mkdirSync(LOCK_PATH)).toThrow(); // held: mkdir collides
  release();
  expect(() => mkdirSync(LOCK_PATH)).not.toThrow();
});

it("a second acquisition waits while the lock is held and proceeds after release", async () => {
  const first = await acquireScratch({ maxWaitMs: 30_000 });
  let secondDone = false;
  const secondPromise = acquireScratch({ maxWaitMs: 30_000 }).then((r) => {
    secondDone = true;
    return r;
  });
  await sleep(800);
  expect(secondDone, "second acquisition must block while held").toBe(false);
  first();
  const second = await secondPromise;
  expect(secondDone).toBe(true);
  second();
});

it("exceeding the max wait fails loudly instead of hanging", async () => {
  const held = await acquireScratch({ maxWaitMs: 30_000 });
  await expect(
    acquireScratch({ maxWaitMs: 600, ttlMs: 60_000 }),
  ).rejects.toThrow(/heavy-lock: timed out/);
  held();
});

it("a stale lock past the TTL with a DEAD holder is seized, not waited on", async () => {
  // A crashed worker's lock: dir aged 10 minutes into the past, its
  // recorded holder pid reaped — the liveness check must seize it
  // (a pure spin would time out instead).
  const now = plantDeadLock();
  const seized = await acquireScratch({ maxWaitMs: 5_000, ttlMs: 60_000 });
  // seizure succeeded within the 5s budget (spin would have timed out)
  expect(statSync(LOCK_PATH).mtimeMs).toBeGreaterThan(
    now.getTime() - 60_000,
  );
  seized();
});

it("a stale lock past the TTL with a LIVE holder is NOT seized (C-4)", async () => {
  // The real acquisition path records OUR live pid as holder: past the
  // TTL the lock must still not be stolen — a live worker beats the
  // clock, and max-wait still fails loudly rather than hang.
  const held = await acquireScratch({ maxWaitMs: 30_000 });
  const now = new Date();
  utimesSync(LOCK_PATH, now, new Date(now.getTime() - 10 * 60_000));
  await expect(
    acquireScratch({ maxWaitMs: 600, ttlMs: 60_000 }),
  ).rejects.toThrow(/heavy-lock: timed out/);
  held();
});

it("the AH_RUNNER=1 marker short-circuits acquisition to a no-op", async () => {
  // ah's runner config sets AH_RUNNER=1; its narrowed batched
  // invocation must skip exclusion entirely (fast path, budget
  // safety) rather than serialise into a batch-fallback storm.
  proc.process.env["AH_RUNNER"] = "1";
  try {
    const first = await acquireScratch({ maxWaitMs: 30_000 });
    first(); // no-op release must not throw
    // No lock dir was ever created:
    expect(() => statSync(LOCK_PATH)).toThrow();
  } finally {
    delete proc.process.env["AH_RUNNER"];
  }
  // and normal exclusion resumes without the marker
  const held = await acquireScratch({ maxWaitMs: 5_000 });
  expect(() => mkdirSync(LOCK_PATH)).toThrow();
  held();
});

it("AH_RUNNER values other than exactly 1 keep full exclusion (C-3)", async () => {
  // The bypass arms on the exact value "1" — a set-but-wrong marker
  // ("0", "", "true", …) must still take the lock, so a misconfigured
  // runner never silently drops shared-tree exclusion.
  for (const value of ["0", "", "2", "true", "no"]) {
    proc.process.env["AH_RUNNER"] = value;
    try {
      const held = await acquireScratch({ maxWaitMs: 5_000 });
      expect(() => mkdirSync(LOCK_PATH)).toThrow();
      held();
    } finally {
      delete proc.process.env["AH_RUNNER"];
    }
  }
});
