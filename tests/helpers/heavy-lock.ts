// Purpose: cross-process advisory lock for the vitest heavy test files
//   (CI-red 42082454763) — the files that mutate or pack shared build
//   trees (dist/ via npm pack + prepack tsc, demo-dist/ via build-spa,
//   src/docs/content/generated/ via the docs generator) acquire ONE
//   global lock for their whole file lifetime, serialising them against
//   each other while every other file keeps full vitest parallelism.
// Responsibilities: atomic lock acquisition (mkdir is exclusive on
//   POSIX), bounded spin-wait with jitter, stale-lock seizure by TTL
//   (a crashed worker must not deadlock the suite), release-on-demand
//   with best-effort process-exit cleanup.
// Rationale: global fileParallelism:false was tried and rejected: it
//   inflates ah check --run-tests's single batched CI invocation past
//   the step timeout, silently dropping it into per-binding
//   batch-fallback storms (CI run 42115074478 wedged >2h on exactly
//   that). A vitest project split was also rejected: per-project junit
//   reporters clobber the single target/test-results.xml testaruda
//   ingests. The races are real (CI rerun green-on-retry + tarball
//   failure at a no-op mirror commit), so exclusion must be explicit
//   and per-file — which is what the consumers (beforeAll / top-level
//   await + afterAll in the five heavy files) implement with this lock.

// @ts-expect-error node builtin (tsconfig types exclude node; repo
// test-local pin convention, e.g. spa-delivery.test.ts)
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";

// The timer global reached structurally (the ES2022 lib has no timer
// declarations; same pattern as docs-keyboard.test.ts).
const timers = globalThis as unknown as {
  setTimeout: (f: () => void, ms: number) => unknown;
};

// Node's process reached structurally for the same reason: tsconfig
// types exclude @types/node by design.
const proc = globalThis as unknown as {
  process: { readonly pid: number; on(event: "exit", listener: () => void): void };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    timers.setTimeout(resolve, ms);
  });
}

export interface HeavyLockOptions {
  // Lock identity: the lock dir is <dir>/<name>.d. Tests use a
  // scratch name; production consumers use the default "heavy".
  readonly name?: string;
  readonly dir?: string;
  // Max total spin-wait before giving up (a livelocked suite should
  // fail loudly, not hang forever).
  readonly maxWaitMs?: number;
  // Locks older than this are considered abandoned (crashed worker)
  // and may be seized. Must exceed the longest heavy file runtime.
  readonly ttlMs?: number;
}

export type HeavyRelease = () => void;

const DEFAULT_DIR = "target/locks";
const DEFAULT_MAX_WAIT_MS = 300_000;
const DEFAULT_TTL_MS = 240_000;

function stealIfStale(lockDir: string, ttlMs: number): boolean {
  // True when the caller should retry immediately: either the lock
  // vanished between the failed mkdir and the stat, or it is old
  // enough (TTL) to be considered abandoned by a crashed worker.
  let mtimeMs: number;
  try {
    mtimeMs = statSync(lockDir).mtimeMs;
  } catch {
    return true;
  }
  if (Date.now() - mtimeMs <= ttlMs) return false;
  // Seizure is racy by construction (two stealers); the mkdir in the
  // spin below still elects exactly one winner — the loser re-enters
  // the loop.
  rmSync(lockDir, { recursive: true, force: true });
  return true;
}

async function spinUntilHeld(
  lockDir: string,
  maxWaitMs: number,
  ttlMs: number,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      // mkdir is atomic: success == ownership (the lock dir IS the
      // lock — its mtime is the TTL clock, no pid bookkeeping needed
      // for correctness, but we record it for forensics).
      mkdirSync(lockDir);
      return;
    } catch {
      // held by someone else — fall through to staleness/wait.
    }
    const waited = Date.now() - started;
    if (waited >= maxWaitMs) {
      throw new Error(
        `heavy-lock: timed out after ${waited}ms waiting for ${lockDir}`,
      );
    }
    if (!stealIfStale(lockDir, ttlMs)) {
      await sleep(250 + Math.floor(Math.random() * 250));
    }
  }
}

export async function acquireHeavyLock(
  options: HeavyLockOptions = {},
): Promise<HeavyRelease> {
  const name = options.name ?? "heavy";
  const dir = options.dir ?? DEFAULT_DIR;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const lockDir = `${dir}/${name}.d`;
  mkdirSync(dir, { recursive: true });
  await spinUntilHeld(lockDir, maxWaitMs, ttlMs);

  try {
    writeFileSync(`${lockDir}/holder`, String(proc.process.pid));
  } catch {
    // forensics only — never fail acquisition over it
  }

  const release: HeavyRelease = () => {
    rmSync(lockDir, { recursive: true, force: true });
  };
  // Best-effort cleanup if the worker dies without running afterAll;
  // the TTL seizure above is the real safety net.
  proc.process.on("exit", release);
  return release;
}
