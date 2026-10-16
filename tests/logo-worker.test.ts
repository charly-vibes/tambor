// Purpose: the Worker-boundary contract tests of the example.logo demo
//   (tambor-y9d.10) — the interpreter runs off-thread so a runaway program
//   (e.g. an infinite repeat) is killable via terminate() instead of hanging
//   the tab, and a killed run surfaces as a typed outcome, never a freeze.
// Responsibilities: (a) an infinite-loop command is killable — a real Worker
//   (node worker_threads against the esbuild-built harness bundle) spins on
//   the runaway repeat, never answers, and terminate() stops it without the
//   main thread ever blocking; (b) a terminated run reports a typed outcome
//   in the demo UI (running → terminated state + view label), stale replies
//   are ignored by the typed apply, and failures record the message; (c)
//   normal runs produce IDENTICAL worlds to the in-thread interpreter
//   (parity over the EN/ES examples, late mode, and typed failures); plus
//   the graceful degradation: with no Worker available the runner answers
//   with the in-thread step budget (errors, never hangs).
// Rationale: per the typed-outcome lens (wanna) the boundary never freezes —
//   the caller always gets a typed answer. The node harness bundle mirrors
//   the browser worker entry (both serve worker-main.ts's runProgram), built
//   in a child process (the TextEncoder invariant — tests/spa-bundle.test.ts
//   precedent); workers exist in node >= 12, so a real Worker is preferred
//   over any jsdom mock.

import { beforeAll, describe, expect, it } from "vitest";
// test-only node access (tsconfig types:[vitest/globals] by design)
// @ts-expect-error node builtin
import { execSync } from "node:child_process";
// @ts-expect-error node builtin
import { Worker } from "node:worker_threads";

import {
  EXAMPLES,
  EXAMPLES_ES,
  derive,
  type Dialect,
} from "../src/examples/logo/interpreter.ts";
import { logoState, logoView } from "../src/examples/logo/logo.ts";
import {
  runProgram,
  WORKER_BUDGET,
  type RunRequest,
  type RunResponse,
} from "../src/examples/logo/worker-main.ts";
import {
  makeRunner,
  makeWorkerRunner,
} from "../src/examples/logo/worker-client.ts";
import {
  applyRun,
  startRun,
  stopLogo,
  type RunOutcome,
} from "../src/examples/logo/run.ts";
import { scanOf } from "./helpers/scan.ts";

// The node worker harness bundle (built in beforeAll — a child process:
// esbuild's node code cannot load inside the vitest environment).
const BUNDLE = "./dist/logo-worker-node.test.mjs";

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
// runProgram's response envelope, in order).
function send(w: Worker, req: RunRequest): Promise<RunResponse> {
  return new Promise((resolve, reject) => {
    const timer = timers.setTimeout(() => reject(new Error("worker did not reply")), 20000);
    w.on("message", (m: unknown) => {
      timers.clearTimeout(timer);
      resolve(m as RunResponse);
    });
    w.on("error", (e: unknown) => {
      timers.clearTimeout(timer);
      reject(e);
    });
    w.postMessage(req);
  });
}

function reqOf(id: number, text: string, late = false, dialect: Dialect = "en"): RunRequest {
  return { id, entries: [{ text }], late, dialect, budget: WORKER_BUDGET };
}

function labelsOf(state: Parameters<typeof logoView>[0]): readonly string[] {
  return scanOf(logoView(state, {}))
    .map((f) => (f.node.type === "label" ? (f.node as { text: string }).text : ""))
    .filter((t) => t.length > 0);
}

beforeAll(() => {
  execSync(
    "npx esbuild tests/helpers/logo-worker-node.ts --bundle --format=esm " +
      "--platform=node --outfile=" + BUNDLE,
    { stdio: "pipe" },
  );
});

describe("logo worker — the killable run boundary", () => {
  it("an infinite-loop command is killable: terminate() stops the worker mid-flight", async () => {
    const w = new Worker(BUNDLE);
    let replies = 0;
    w.on("message", () => {
      replies += 1;
    });
    // a true runaway: 1e9 iterations ≫ any test timescale — the worker
    // spins off-thread while the main thread stays responsive
    w.postMessage(reqOf(1, "repeat 1000000000 [fd 0.1]"));
    await delay(400);
    expect(replies).toBe(0); // still running, main thread never blocked
    await w.terminate();
    await delay(150);
    expect(replies).toBe(0); // no late reply after the kill
  }, 20000);

  it("a terminated run reports a typed outcome in the demo UI", () => {
    const running: RunOutcome = { kind: "running" };
    const s0 = { ...logoState(), outcome: running };
    const s1 = stopLogo(s0);
    expect(s1.outcome).toEqual({ kind: "terminated" });
    const texts = labelsOf(s1);
    expect(texts.some((t) => t.includes("terminated"))).toBe(true);
  });

  it("stop outside a run leaves the outcome untouched", () => {
    const s0 = logoState();
    expect(stopLogo(s0)).toEqual(s0);
    const s1 = { ...logoState(), outcome: { kind: "ok" } as RunOutcome };
    expect(stopLogo(s1)).toEqual(s1);
  });

  it("startRun in worker mode parks the run as a typed running outcome and launches", () => {
    const launched: RunRequest[] = [];
    const hooks = {
      launch: (r: RunRequest) => {
        launched.push(r);
      },
      stop: () => {},
    };
    const s1 = startRun({ ...logoState(), src: EXAMPLES["square"] as string }, hooks, true);
    expect(s1.outcome).toEqual({ kind: "running" });
    expect(s1.runId).toBe(1);
    expect(launched.length).toBe(1);
    expect((launched[0] as RunRequest).budget).toBe(WORKER_BUDGET);
  });

  it("the typed apply moves the cursor on ok, records failures, ignores stale replies", () => {
    const src = EXAMPLES["square"] as string;
    const base = { ...logoState(), src, runId: 3 };
    const ok = applyRun(base, {
      id: 3,
      ok: true,
      world: derive([{ text: src }], false),
    });
    expect(ok.entries.length).toBe(1);
    expect(ok.cursor).toBe(1);
    expect(ok.outcome).toEqual({ kind: "ok" });
    const stale = applyRun(base, { id: 2, ok: true, world: derive([{ text: src }], false) });
    expect(stale.entries.length).toBe(0);
    const bad = applyRun(base, { id: 3, ok: false, message: "boom" });
    expect(bad.entries.length).toBe(0);
    expect(bad.outcome).toEqual({ kind: "failed", message: "boom" });
    expect(bad.err).toBe("boom");
  });

  it("normal runs produce identical worlds to the in-thread interpreter", async () => {
    const w = new Worker(BUNDLE);
    let id = 0;
    const en = Object.values(EXAMPLES).map((src) => [src, "en"] as const);
    const es = Object.values(EXAMPLES_ES).map((src) => [src, "es"] as const);
    for (const [src, dialect] of [...en, ...es]) {
      id += 1;
      const resp = await send(w, reqOf(id, src, false, dialect));
      if (!resp.ok) throw new Error("expected ok for " + src);
      expect(resp.world).toEqual(derive([{ text: src }], false, dialect));
    }
    // the Spanish dialect rides the same boundary
    const esResp = await send(w, reqOf(91, EXAMPLES_ES["cuadrado"] as string, false, "es"));
    if (!esResp.ok) throw new Error("expected ok for the es example");
    expect(esResp.world).toEqual(derive([{ text: EXAMPLES_ES["cuadrado"] as string }], false, "es"));
    // late binding re-runs every command against the newest definitions
    const late = await send(w, reqOf(92, EXAMPLES["tree"] as string, true));
    if (!late.ok) throw new Error("expected ok for the late example");
    expect(late.world).toEqual(derive([{ text: EXAMPLES["tree"] as string }], true));
    // and a bad program is a typed failure, not a crash
    const bad = await send(w, reqOf(93, "foo"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/don't know how to foo/);
    await w.terminate();
  }, 30000);
});

describe("logo worker — graceful degradation", () => {
  it("without a Worker the runner degrades to the in-thread interpreter", () => {
    // the vitest node environment has no Worker global: the demo must
    // fall back instead of freezing or crashing
    expect(makeRunner().worker).toBe(false);
  });

  it("a worker that fails to load answers a typed failure and downgrades", async () => {
    // a Worker whose module never loads: the runner must not stick in
    // "running" — the in-flight run resolves as a typed failure (with its
    // own request id, so the typed apply records it), and later runs use
    // the bounded in-thread fallback
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
    expect(runner.worker).toBe(true);
    const first = await runner.run(reqOf(1, "fd 10"));
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.id).toBe(1);
      expect(first.message).toMatch(/worker failed to load/);
    }
    // subsequent runs ride the bounded fallback (typed, never a hang)
    const second = await runner.run(reqOf(2, "foo"));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toMatch(/don't know how to foo/);
  });

  it("the fallback runner answers typed outcomes under the in-thread budget", async () => {
    const runner = makeRunner();
    const bad = await runner.run(reqOf(1, "foo"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/don't know how to foo/);
    // a runaway is bounded by the in-thread step budget — an error, never
    // a frozen tab (the kill-sized budget belongs to the Worker boundary)
    const spin = await runner.run(reqOf(2, "repeat 1000000000 [fd 0.1]"));
    expect(spin.ok).toBe(false);
    if (!spin.ok) expect(spin.message).toMatch(/too many steps/);
  });
});

describe("logo worker — the pure envelope", () => {
  it("runProgram answers the same envelope the harness serves", () => {
    const resp = runProgram(reqOf(7, "fd 10"));
    expect(resp.ok).toBe(true);
    if (!resp.ok) throw new Error("expected ok");
    // hd 0 faces +y: fd 10 moves the turtle to (0, 10)
    expect(resp.world.y).toBeCloseTo(10);
    const bad = runProgram(reqOf(8, "foo"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/don't know how to foo/);
  });
});
