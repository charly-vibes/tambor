// Purpose: the Worker-boundary contract tests of the B9 reactive
//   notebook (tambor-54j.9) — cell evaluation runs off-thread so a
//   long-running cell (a big range reduce, a 200k-point fan-out) is
//   killable via terminate() instead of hanging the tab, and a killed
//   run surfaces as a typed failure the app turns into a per-cell
//   "killed" error while the notebook stays usable.
// Responsibilities: (a) a heavy notebook run is killable — a real
//   Worker (node worker_threads against the esbuild-built harness
//   bundle) spins on the run, never answers, and terminate() stops it
//   without the main thread ever blocking, with no late reply; (b)
//   normal runs produce the SAME results as the in-process runAll
//   (values, ran counts, incremental reuse semantics across the
//   boundary); (c) the client's kill() resolves in-flight runs as the
//   typed killed failure and the NEXT run respawns a fresh worker; (d)
//   graceful degradation — no Worker global → the in-thread fallback
//   answers the same contract; a worker that fails to load resolves as
//   a typed failure and downgrades.
// Rationale: the Logo worker precedent (tests/logo-worker.test.ts,
//   tambor-y9d.10) adapted to the notebook envelope — the boundary
//   never freezes the caller, and the kill is a round trip, not
//   end-of-life.

import { beforeAll, describe, expect, it } from "vitest";
// test-only node access (tsconfig types:[vitest/globals] by design)
// @ts-expect-error node builtin
import { execSync } from "node:child_process";
// @ts-expect-error node builtin
import { Worker } from "node:worker_threads";

import { runAll, type Cell } from "../src/examples/notebook/notebook-core.ts";
import {
  runNotebook,
  type NotebookRunRequest,
  type NotebookRunResponse,
} from "../src/examples/notebook/worker-main.ts";
import {
  KILLED_MESSAGE,
  makeNotebookRunner,
  makeWorkerRunner,
} from "../src/examples/notebook/worker-client.ts";

// The node worker harness bundle (built in beforeAll — a child process:
// esbuild's node code cannot load inside the vitest environment).
const BUNDLE = "./dist/notebook-worker-node.test.mjs";

// The timer globals reached structurally (the ES2022 lib has no timer
// declarations; tsconfig types exclude node).
const timers = globalThis as unknown as {
  setTimeout: (f: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    timers.setTimeout(resolve, ms);
  });
}

// One request → one reply (the harness answers every message with
// runNotebook's response envelope, in order).
function send(w: Worker, req: NotebookRunRequest): Promise<NotebookRunResponse> {
  return new Promise((resolve, reject) => {
    const timer = timers.setTimeout(() => reject(new Error("worker did not reply")), 20000);
    w.on("message", (m: unknown) => {
      timers.clearTimeout(timer);
      resolve(m as NotebookRunResponse);
    });
    w.on("error", (e: unknown) => {
      timers.clearTimeout(timer);
      reject(e);
    });
    w.postMessage(req);
  });
}

// The demo notebook's 8 cells (the contract test's CELLS).
const CELLS: readonly Cell[] = [
  { id: 1, src: "freq = slider(1, 10, 1, 3)" },
  { id: 2, src: "xs = linspace(0, 6.283, 120)" },
  { id: 3, src: "ys = sin(xs * freq)" },
  { id: 4, src: "plot(xs, ys)" },
  { id: 5, src: "energy = sum(ys * ys) / len(ys)" },
  { id: 6, src: "amp = slider(0.5, 3, 0.1, 1)" },
  { id: 7, src: "zs = ys * amp" },
  { id: 8, src: "plot(xs, zs)" },
];

// A genuinely long-running notebook: a 1M-point array feeding 60 heavy
// reduction cells — seconds of work, killable mid-flight.
function heavyCells(): readonly Cell[] {
  const cells: Cell[] = [{ id: 0, src: "xs = range(0, 1000000)" }];
  for (let k = 1; k <= 60; k++) {
    cells.push({ id: k, src: `h${k} = sum(sin(xs * ${k}))` });
  }
  return cells;
}

beforeAll(() => {
  execSync(
    "npx esbuild tests/helpers/notebook-worker-node.ts --bundle --format=esm " +
      "--platform=node --outfile=" + BUNDLE,
    { stdio: "pipe" },
  );
});

describe("notebook worker — the killable evaluation boundary", () => {
  it("a heavy run is killable: terminate() stops the worker mid-flight", async () => {
    const w = new Worker(BUNDLE);
    let replies = 0;
    w.on("message", () => {
      replies += 1;
    });
    // a full run over 60 heavy reduction cells: seconds of off-thread
    // work — the main thread never blocks while it spins
    w.postMessage({ id: 1, cells: heavyCells(), sliders: {}, prev: {}, dirty: null });
    await delay(400);
    expect(replies).toBe(0); // still running, main thread never blocked
    await w.terminate();
    await delay(150);
    expect(replies).toBe(0); // no late reply after the kill
  }, 20000);

  it("normal runs produce the same results as the in-process runAll", async () => {
    const w = new Worker(BUNDLE);
    const resp = await send(w, { id: 1, cells: CELLS, sliders: {}, prev: {}, dirty: null });
    expect(resp.ok).toBe(true);
    if (!resp.ok) throw new Error("expected ok");
    expect(resp.ran).toBe(8);
    expect(resp.touched).toHaveLength(8);
    expect(resp.out[5]?.v).toBe(runAll(CELLS, {}, {}, null).out[5]?.v);
    // the incremental contract holds across the boundary: moving amp
    // with prev attached re-runs 3 and reuses the rest
    const full = runAll(CELLS, {}, {}, null);
    const inc = await send(w, { id: 2, cells: CELLS, sliders: { 6: 2 }, prev: full.out, dirty: [6] });
    expect(inc.ok).toBe(true);
    if (!inc.ok) throw new Error("expected ok");
    expect(inc.ran).toBe(3);
    expect(inc.out[7]?.v).not.toEqual(full.out[7]?.v);
    await w.terminate();
  }, 20000);
});

describe("notebook worker — the client", () => {
  it("kill() resolves the in-flight run as the typed killed failure, and the next run respawns", async () => {
    const spawned: FakeWorker[] = [];
    class FakeWorker {
      onerror: ((e: unknown) => void) | null = null;
      onmessage: ((e: { readonly data: unknown }) => void) | null = null;
      posted: unknown[] = [];
      constructor(_u: unknown, _o: { readonly type: string }) {
        spawned.push(this);
      }
      postMessage(m: unknown): void {
        this.posted.push(m);
      }
      terminate(): void {}
    }
    class FakeURL {
      constructor(u: string, base: string) {
        void base;
        this.u = u;
      }
      u: string;
    }
    const runner = makeWorkerRunner(
      FakeWorker as unknown as Parameters<typeof makeWorkerRunner>[0],
      FakeURL as unknown as Parameters<typeof makeWorkerRunner>[1],
    );
    if (runner === null) throw new Error("expected a worker-backed runner");
    expect(runner.worker).toBe(true);
    const first = spawned[0];
    if (first === undefined) throw new Error("expected a spawned worker");
    const inFlight = runner.run({ id: 7, cells: CELLS, sliders: {}, prev: {}, dirty: null });
    expect(first.posted).toHaveLength(1);
    runner.kill();
    const killed = await inFlight;
    expect(killed.ok).toBe(false);
    if (!killed.ok) expect(killed.message).toBe(KILLED_MESSAGE);
    // the next run RESPAWNS a fresh worker (the notebook stays usable)
    const second = runner.run({ id: 8, cells: CELLS, sliders: {}, prev: {}, dirty: null });
    const respawned = spawned[1];
    if (respawned === undefined) throw new Error("expected a respawned worker");
    expect(respawned).not.toBe(first);
    expect(respawned.posted).toHaveLength(1);
    respawned.onmessage?.({ data: { id: 8, ok: true, out: {}, info: {}, touched: [], ran: 0, ms: 0 } });
    expect((await second).ok).toBe(true);
  });
});

// (the respawn assertions read the captured instances).

describe("notebook worker — graceful degradation", () => {
  it("without a Worker the runner degrades to the in-thread evaluator", async () => {
    const runner = makeNotebookRunner();
    if (runner.worker) throw new Error("expected the in-thread fallback in node vitest");
    const resp = await runner.run({ id: 1, cells: CELLS, sliders: {}, prev: {}, dirty: null });
    expect(resp.ok).toBe(true);
    if (!resp.ok) throw new Error("expected ok");
    expect(resp.ran).toBe(8);
    // kill is a no-op on the fallback (nothing left running)
    runner.kill();
  });

  it("a worker that fails to load answers a typed failure and downgrades", async () => {
    class FakeWorker {
      onerror: ((e: unknown) => void) | null = null;
      onmessage: ((e: { readonly data: unknown }) => void) | null = null;
      postMessage(): void {
        this.onerror?.(null);
      }
      terminate(): void {}
    }
    class FakeURL {
      constructor(u: string, base: string) {
        void base;
        this.u = u;
      }
      u: string;
    }
    const runner = makeWorkerRunner(
      FakeWorker as unknown as Parameters<typeof makeWorkerRunner>[0],
      FakeURL as unknown as Parameters<typeof makeWorkerRunner>[1],
    );
    if (runner === null) throw new Error("expected a worker-backed runner");
    const first = await runner.run({ id: 1, cells: CELLS, sliders: {}, prev: {}, dirty: null });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.id).toBe(1);
    // subsequent runs ride the in-thread fallback (typed, never a hang)
    const second = await runner.run({ id: 2, cells: CELLS, sliders: {}, prev: {}, dirty: null });
    expect(second.ok).toBe(true);
  });
});

describe("notebook worker — the pure envelope", () => {
  it("runNotebook answers the same envelope the harness serves", () => {
    const resp = runNotebook({ id: 7, cells: CELLS, sliders: {}, prev: {}, dirty: null });
    expect(resp.ok).toBe(true);
    if (!resp.ok) throw new Error("expected ok");
    expect(resp.ran).toBe(8);
    const bad = runNotebook({
      id: 8,
      cells: null as unknown as readonly Cell[],
      sliders: {},
      prev: {},
      dirty: null,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message.length).toBeGreaterThan(0);
  });
});
