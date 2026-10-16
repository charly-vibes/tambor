// Purpose: the Worker-boundary client of the example.logo demo
//   (tambor-y9d.10) — spawn the killable off-thread run, or degrade to the
//   in-thread interpreter when the host has no Worker.
// Responsibilities: the structural WorkerLike seam (no lib.dom — the core
//   stays DOM-free); makeRunner — a Worker-backed runner when the host has
//   a Worker constructor (browsers; node >= 12 harnesses), the in-thread
//   fallback otherwise; the fallback answers the same
//   Promise<RunResponse> contract but bounds the run at the in-thread
//   STEP_BUDGET, so a runaway errors instead of freezing; per-id reply
//   routing so a superseded run's late reply resolves only its own
//   promise; the load-failure downgrade — if the worker asset never loads
//   (a deploy without the worker chunk), in-flight runs resolve as typed
//   failures and later runs use the bounded fallback, so the demo never
//   sticks in a silent running state.
// Rationale: per the typed-outcome lens (wanna) the boundary never freezes —
//   the caller gets a typed answer either way. Graceful degradation keeps
//   the jsdom/node demo harnesses (no Worker global) on today's sync
//   behavior. esbuild bundles worker.ts out of the
//   new Worker(new URL("./worker.ts", import.meta.url)) pattern, so the
//   browser artifact carries the killable worker with no extra build step.

import { STEP_BUDGET } from "./interpreter.ts";
import { runProgram, type RunRequest, type RunResponse } from "./worker-main.ts";

interface WorkerLike {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: { readonly data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

type WorkerCtor = new (url: unknown, opts: { readonly type: string }) => WorkerLike;

type URLCtor = new (u: string, base: string) => unknown;

/** A killable run boundary. `worker` says which side answered: true = the
 * off-thread Worker (terminate() kills a runaway), false = the in-thread
 * fallback (terminate is a no-op; the budget bounds runaway runs). */
export interface LogoRunner {
  readonly worker: boolean;
  run(req: RunRequest): Promise<RunResponse>;
  terminate(): void;
}

// The Worker-backed runner: in-flight requests are routed by their echoed
// id, so a second Run supersedes the first without cross-resolving. If the
// worker fails to load (a deploy that ships no worker asset), every
// in-flight run resolves as a typed failure carrying its own request id —
// the typed apply turns it into a failed outcome, never a stuck running
// state — and the runner permanently downgrades to the bounded in-thread
// fallback (graceful degradation all the way down).
export function makeWorkerRunner(W: WorkerCtor, URLC: URLCtor): LogoRunner | null {
  let w: WorkerLike;
  try {
    // import.meta.url is the bundler-resolved module address; reached
    // structurally (the ES2022 lib has no ImportMeta.url declaration)
    const here = (import.meta as unknown as { url: string }).url;
    w = new W(new URLC("./worker.ts", here), { type: "module" });
  } catch {
    return null; // construction can fail even where Worker exists
  }
  const fallback = threadRunner();
  let dead = false;
  const pending = new Map<number, (r: RunResponse) => void>();
  w.onmessage = (e: { readonly data: unknown }) => {
    const r = e.data as RunResponse;
    pending.get(r.id)?.(r);
    pending.delete(r.id);
  };
  w.onerror = () => {
    dead = true;
    const msg = "logo worker failed to load — runs are bounded in-thread";
    for (const [id, resolve] of pending) resolve({ id, ok: false, message: msg });
    pending.clear();
  };
  return {
    worker: true,
    run: (req) => {
      if (dead) return fallback.run(req);
      return new Promise((resolve) => {
        pending.set(req.id, resolve);
        w.postMessage(req);
      });
    },
    terminate: () => {
      w.terminate();
    },
  };
}

// The in-thread fallback: same contract, bounded by the interpreter's own
// step budget — a runaway program is a typed failure, never a frozen host.
function threadRunner(): LogoRunner {
  return {
    worker: false,
    run: (req) => Promise.resolve(runProgram({ ...req, budget: STEP_BUDGET })),
    terminate: () => {},
  };
}

/** The demo's runner: Worker-backed when the host offers one, the bounded
 * in-thread fallback otherwise (graceful degradation — tambor-y9d.10). */
export function makeRunner(): LogoRunner {
  const W = (globalThis as { Worker?: WorkerCtor }).Worker;
  const URLC = (globalThis as { URL?: URLCtor }).URL;
  if (W !== undefined && URLC !== undefined) {
    const w = makeWorkerRunner(W, URLC);
    if (w !== null) return w;
  }
  return threadRunner();
}
