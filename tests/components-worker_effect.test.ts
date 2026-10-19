// Purpose: the contract tests of the worker effect component
//   (openspec/specs/components-worker_effect/spec.md — tambor-54j.8.6).
// Responsibilities: (a) the responsiveness contract — a long compute
//   off-thread keeps the main wire responsive, measured against a
//   blocking in-thread equivalent (the same burn) which stalls it;
//   (b) envelope parity — a real worker answers the same typed
//   envelope as runWorkerEffect (values, typed failures, unknown
//   handlers); (c) the optional terminate — in-flight runs resolve as
//   the typed terminated failure and the next run respawns; (d)
//   graceful degradation — no Worker global → the in-thread fallback
//   answers the same contract; a worker that fails to load resolves as
//   a typed failure and downgrades; (e) the effect bridge — spawn as
//   plain effect data, the reply/error landing as typed effects.
// Rationale: the notebook worker precedent (tests/notebook-worker.test.ts,
//   tambor-54j.9) adapted to the kit component's envelope — the
//   boundary never freezes the caller, every failure is typed, and the
//   scope decision (BZ6) holds: terminate is optional and scoped to
//   the spawned worker, nothing universal.

import { beforeAll, describe, expect, it } from "vitest";
// test-only node access (tsconfig types:[vitest/globals] by design)
// @ts-expect-error node builtin
import { execSync } from "node:child_process";
// @ts-expect-error node builtin
import { Worker } from "node:worker_threads";

import {
  runWorkerEffect,
  type WorkerEffectResponse,
} from "../src/components/worker_effect/envelope.ts";
import {
  TERMINATED_MESSAGE,
  makeWorkerEffect,
  makeWorkerEffectRunner,
  type WorkerEffectClient,
} from "../src/components/worker_effect/client.ts";
import { workerEffectHandler } from "../src/components/worker_effect/effect.ts";

import type { DispatchInput, Effect } from "../src/effects/dispatch.ts";

// The node worker harness bundle (built in beforeAll — a child process:
// esbuild's node code cannot load inside the vitest environment).
const BUNDLE = "./dist/worker-effect-node.test.mjs";

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

// The blocking equivalent of the harness's spin handler: the same
// busy-wait, run in-thread — it stalls the main wire for its full
// duration (the honest baseline the responsiveness contract compares
// against).
function burnInThread(ms: number): number {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // spin — the same loop shape as the harness's burn
  }
  return ms;
}

// The main wire's responsiveness probe: run `start()` (which begins
// the stall or the off-thread compute), then schedule `samples` 5 ms
// timers back to back, and report the worst observed drift between the
// requested and actual firing delay. A stalled wire shows the
// compute's whole duration in the drift; a responsive one shows only
// timer jitter. The stall must overlap a pending probe timer — the
// honest way to measure what a 5 ms-wire caller feels.
async function maxWireDrift(samples: number, start: () => void): Promise<number> {
  let worst = 0;
  start();
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    await delay(5);
    const drift = Date.now() - t0 - 5;
    if (drift > worst) worst = drift;
  }
  return worst;
}

// Begin the blocking equivalent: schedule the burn as its own timer
// (so it lands in the timer queue BEFORE the next probe timer — the
// queue order makes the burn stall the probes' firing). Returns the
// total drift window in ms the burn occupies.
function startBlockingBurn(ms: number): void {
  timers.setTimeout(() => {
    burnInThread(ms);
  }, 0);
}

// One request → one reply through the real worker harness.
function send(
  w: InstanceType<typeof Worker>,
  req: unknown,
): Promise<WorkerEffectResponse> {
  return new Promise((resolve, reject) => {
    const timer = timers.setTimeout(
      () => reject(new Error("worker did not reply")),
      20000,
    );
    w.on("message", (m: unknown) => {
      timers.clearTimeout(timer);
      resolve(m as WorkerEffectResponse);
    });
    w.on("error", (e: unknown) => {
      timers.clearTimeout(timer);
      reject(e);
    });
    w.postMessage(req);
  });
}

// Wait until `probe` observes what it waits for (poll — no vi.waitFor
// reliance in this suite; the notebook precedent polls too).
async function until(probe: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (probe()) return;
    await delay(5);
  }
  throw new Error("condition never became true");
}

beforeAll(() => {
  execSync(
    "npx esbuild tests/helpers/worker-effect-node.ts --bundle --format=esm " +
      "--platform=node --outfile=" + BUNDLE,
    { stdio: "pipe" },
  );
});

describe("worker effect — the responsiveness contract (real worker)", () => {
  it("p_wire: long compute off-thread keeps the main wire responsive; the blocking equivalent stalls it", async () => {
    const SPIN_MS = 1000;

    // the blocking equivalent: the same burn in-thread, started as a
    // timer so it stalls the probe timers firing — the wire feels the
    // compute's whole duration
    const blockedMax = await maxWireDrift(10, () => startBlockingBurn(SPIN_MS));
    expect(blockedMax).toBeGreaterThanOrEqual(SPIN_MS * 0.5);

    // the worker effect: the same spin off-thread — the main wire
    // never feels it (drift stays at timer jitter scale, ~2 orders of
    // magnitude under the blocked run)
    const w = new Worker(BUNDLE);
    // post the spin, then probe the wire while it spins off-thread
    const spin = send(w, { id: 1, handler: "spin", input: { ms: SPIN_MS } });
    const liveMax = await maxWireDrift(40, () => {});
    // the reply lands when the compute finishes — the wire kept
    // serving probes the whole time it was spinning
    const spinReply = await spin;
    expect(spinReply.ok).toBe(true);
    if (spinReply.ok) expect(spinReply.value).toBe(SPIN_MS);
    // the wire still serves work after the spin
    const reply = await send(w, { id: 2, handler: "double", input: 21 });
    expect(reply.ok).toBe(true);
    if (reply.ok) expect(reply.value).toBe(42);
    await w.terminate();
    expect(liveMax).toBeLessThan(150);
    expect(liveMax * 5).toBeLessThan(blockedMax);
  }, 20000);

  it("p_envelope_parity: a real worker answers the same envelope as runWorkerEffect (values, typed failures)", async () => {
    const w = new Worker(BUNDLE);
    const ok = await send(w, { id: 1, handler: "sum", input: [1, 2, 3, 4] });
    expect(ok).toEqual({ id: 1, ok: true, value: 10 });
    const thrown = await send(w, { id: 2, handler: "boom", input: null });
    expect(thrown).toEqual({ id: 2, ok: false, message: "boom" });
    const unknown = await send(w, { id: 3, handler: "nope", input: null });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toContain("nope");
    await w.terminate();
  }, 20000);
});

describe("worker effect — the pure envelope", () => {
  it("p_pure: runWorkerEffect returns the value, catches every failure into the typed failure branch, and types unknown handlers", () => {
    const handlers = {
      double: (input: unknown) => (input as number) * 2,
      boom: () => {
        throw new Error("boom");
      },
    };
    expect(runWorkerEffect(handlers, { id: 7, handler: "double", input: 21 })).toEqual({
      id: 7,
      ok: true,
      value: 42,
    });
    expect(runWorkerEffect(handlers, { id: 8, handler: "boom", input: null })).toEqual({
      id: 8,
      ok: false,
      message: "boom",
    });
    expect(runWorkerEffect(handlers, { id: 9, handler: "missing", input: null }).ok).toBe(
      false,
    );
  });
});

describe("worker effect — per-id routing", () => {
  it("p_route: each reply resolves only its own request's promise — a late reply never cross-resolves", async () => {
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
    const client = makeWorkerEffectRunner(
      FakeWorker as unknown as Parameters<typeof makeWorkerEffectRunner>[0],
      FakeURL as unknown as Parameters<typeof makeWorkerEffectRunner>[1],
      "./worker-effect.js",
    );
    if (client === null) throw new Error("expected a worker-backed client");
    const first = client.run("double", 21);
    const second = client.run("sum", [1, 2, 3]);
    const w = spawned[0];
    if (w === undefined) throw new Error("expected a spawned worker");
    expect(w.posted).toHaveLength(2);
    // the ids are echoed back verbatim (read them off the posted
    // requests — they are monotonic across the module, not per-test)
    const req1 = w.posted[0] as { readonly id: number };
    const req2 = w.posted[1] as { readonly id: number };
    // the replies arrive REVERSED: the second request's value first
    w.onmessage?.({ data: { id: req2.id, ok: true, value: 6 } });
    w.onmessage?.({ data: { id: req1.id, ok: true, value: 42 } });
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    const r1 = await first;
    const r2 = await second;
    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(42); // id 1's own value, not the late 6
      expect(r2.value).toBe(6); // id 2's own value, not the late 42
    }
  });
});

describe("worker effect — the optional terminate", () => {
  it("p_terminate: terminate() resolves the in-flight run as the typed terminated failure, and the next run respawns", async () => {
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
      u: string;
      constructor(u: string, base: string) {
        void base;
        this.u = u;
      }
    }
    const client = makeWorkerEffectRunner(
      FakeWorker as unknown as Parameters<typeof makeWorkerEffectRunner>[0],
      FakeURL as unknown as Parameters<typeof makeWorkerEffectRunner>[1],
      "./worker-effect.js",
    );
    if (client === null) throw new Error("expected a worker-backed client");
    expect(client.worker).toBe(true);
    const first = spawned[0];
    if (first === undefined) throw new Error("expected a spawned worker");
    const inFlight = client.run("sum", [1, 2, 3]);
    expect(first.posted).toHaveLength(1);
    client.terminate();
    const terminated = await inFlight;
    expect(terminated.ok).toBe(false);
    if (!terminated.ok) expect(terminated.message).toBe(TERMINATED_MESSAGE);
    // the next run RESPAWNS a fresh worker (the boundary stays usable)
    const second = client.run("double", 21);
    const respawned = spawned[1];
    if (respawned === undefined) throw new Error("expected a respawned worker");
    expect(respawned).not.toBe(first);
    expect(respawned.posted).toHaveLength(1);
    const req2 = respawned.posted[0] as { readonly id: number };
    respawned.onmessage?.({ data: { id: req2.id, ok: true, value: 42 } });
    const reply = await second;
    expect(reply.ok).toBe(true);
    if (reply.ok) expect(reply.value).toBe(42);
  });
});

describe("worker effect — graceful degradation", () => {
  it("p_fallback: without a Worker the host-aware constructor degrades to the in-thread fallback", async () => {
    const client = makeWorkerEffect("./worker-effect.js", {
      double: (input) => (input as number) * 2,
    });
    if (client.worker) throw new Error("expected the in-thread fallback in node vitest");
    const reply = await client.run("double", 21);
    expect(reply).toMatchObject({ ok: true, value: 42 });
    // terminate is a no-op on the fallback (nothing is left running)
    client.terminate();
  });

  it("p_load_fail: a worker that fails to load answers a typed failure and downgrades", async () => {
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
    const client = makeWorkerEffectRunner(
      FakeWorker as unknown as Parameters<typeof makeWorkerEffectRunner>[0],
      FakeURL as unknown as Parameters<typeof makeWorkerEffectRunner>[1],
      "./worker-effect.js",
      { double: (input) => (input as number) * 2 },
    );
    if (client === null) throw new Error("expected a worker-backed client");
    const first = await client.run("double", 21);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.message).toContain("fall back in-thread");
    // subsequent runs ride the in-thread fallback (typed, never a hang)
    const second = await client.run("double", 42);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toBe(84);
  });
});

describe("worker effect — the effect bridge", () => {
  function bridge(client: WorkerEffectClient): Effect[] {
    const seen: Effect[] = [];
    const fn = workerEffectHandler(client);
    fn((input: DispatchInput) => {
      seen.push(input as Effect);
    }, "double", 21);
    return seen;
  }

  it("p_bridge: a spawn effect lands the typed reply effect (or typed error effect) through the same dispatch", async () => {
    const client = makeWorkerEffect("./worker-effect.js", {
      double: (input) => (input as number) * 2,
      boom: () => {
        throw new Error("boom");
      },
    });
    const reply = bridge(client);
    await until(() => reply.length > 0);
    expect(reply[0]).toEqual(["worker-effect-reply", expect.any(Number), 42]);
    const seen: Effect[] = [];
    workerEffectHandler(client)((input: DispatchInput) => {
      seen.push(input as Effect);
    }, "boom", null);
    await until(() => seen.length > 0);
    expect(seen[0]).toEqual(["worker-effect-error", expect.any(Number), "boom"]);
  });
});
