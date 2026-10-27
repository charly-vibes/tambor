// Purpose: the Worker-boundary client of the B9 reactive notebook
//   (tambor-54j.9) — spawn the killable off-thread evaluation, or
//   degrade to the in-thread evaluator when the host has no Worker.
// Responsibilities: the structural WorkerLike seam (no lib.dom — the
//   core stays DOM-free); makeNotebookRunner — a Worker-backed runner
//   when the host has a Worker constructor (browsers; node >= 12
//   harnesses), the in-thread fallback otherwise; per-id reply routing
//   so a superseded run's late reply resolves only its own promise;
//   kill() — terminate the worker mid-run, resolve every in-flight
//   request as the typed "killed" failure, and RESPAWN a fresh worker
//   on the next run (the notebook stays usable after a kill, unlike a
//   one-shot boundary); the load-failure downgrade — if the worker
//   asset never loads, in-flight runs resolve as typed failures and
//   later runs use the in-thread fallback.
// Rationale: the Logo worker precedent (worker-client.ts, tambor-y9d.10)
//   with one notebook-specific upgrade: kill is a ROUND TRIP, not
//   end-of-life — a killed notebook must accept new edits immediately,
//   so the client lazily respawns the terminated worker instead of
//   staying dead. The fallback answers the same Promise contract; the
//   host-thread evaluation is bounded only by the core's MAXN array
//   cap (a fallback kill is a no-op — the run already finished).

import { runNotebook, type NotebookRunRequest, type NotebookRunResponse } from "./worker-main.ts";

interface WorkerLike {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: { readonly data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

type WorkerCtor = new (url: unknown, opts: { readonly type: string }) => WorkerLike;

type URLCtor = new (u: string, base: string) => unknown;

/** A killable evaluation boundary. `worker` says which side answered:
 * true = the off-thread Worker (terminate() kills a long-running
 * cell), false = the in-thread fallback (kill is a no-op). */
export interface NotebookRunner {
  readonly worker: boolean;
  run(req: NotebookRunRequest): Promise<NotebookRunResponse>;
  kill(): void;
}

// The typed failure a killed run resolves with: the app marks the
// run's dirty cells with this message and keeps every other value.
export const KILLED_MESSAGE = "killed";

// The typed failure of a worker asset that never loaded.
const LOAD_MESSAGE = "notebook worker failed to load — runs fall back in-thread";

/** The Worker-backed runner: in-flight requests routed by their echoed
 * id; kill() terminates and answers every pending request with the
 * typed killed failure, then the NEXT run respawns a fresh worker
 * (lazy — a killed notebook stays usable); a worker that fails to load
 * resolves in-flight runs as typed failures and permanently downgrades
 * to the in-thread fallback (graceful degradation all the way down). */
export function makeWorkerRunner(W: WorkerCtor, URLC: URLCtor): NotebookRunner | null {
  const spawn = (): WorkerLike | null => {
    try {
      // import.meta.url is the bundler-resolved module address; reached
      // structurally (the ES2022 lib has no ImportMeta.url declaration)
      const here = (import.meta as unknown as { url: string }).url;
      // the asset name build:spa emits (demo-dist/notebook-worker.js) —
      // add-spa-delivery: splitting puts this client in
      // chunks/<demo>-<hash>.js, while the worker entries keep stable
      // demo-dist root names, so resolve against the chunk's PARENT
      // (the demo-dist root), not the chunk address itself
      const root = here.replace(/\/chunks\/[^/]*$/, "/");
      return new W(new URLC("./notebook-worker.js", root), { type: "module" });
    } catch {
      return null; // construction can fail even where Worker exists
    }
  };
  let w = spawn();
  if (w === null) return null;
  const fallback = threadRunner();
  let dead = false;
  let pending = new Map<number, (r: NotebookRunResponse) => void>();
  const deliver = (r: NotebookRunResponse): void => {
    pending.get(r.id)?.(r);
    pending.delete(r.id);
  };
  // the wiring is re-attached to every respawned worker
  const wire = (live: WorkerLike): void => {
    live.onmessage = (e: { readonly data: unknown }) => deliver(e.data as NotebookRunResponse);
    live.onerror = () => {
      dead = true;
      for (const [id, resolve] of pending) resolve({ id, ok: false, message: LOAD_MESSAGE });
      pending = new Map();
    };
  };
  wire(w);
  return {
    worker: true,
    run: (req) => {
      if (dead) return fallback.run(req);
      // a killed worker respawns lazily: the notebook stays usable
      if (w === null) {
        w = spawn();
        if (w === null) return fallback.run(req);
        wire(w);
      }
      const live = w;
      return new Promise((resolve) => {
        pending.set(req.id, resolve);
        live.postMessage(req);
      });
    },
    kill: () => {
      const live = w;
      if (live === null) return;
      live.terminate();
      for (const [id, resolve] of pending) resolve({ id, ok: false, message: KILLED_MESSAGE });
      pending = new Map();
      w = null; // killed — the next run() respawns a fresh worker
    },
  };
}

// The in-thread fallback: same contract, evaluated synchronously on the
// host thread — a kill is a no-op (nothing is left running).
function threadRunner(): NotebookRunner {
  return {
    worker: false,
    run: (req) => Promise.resolve(runNotebook(req)),
    kill: () => {},
  };
}

/** The demo's runner: Worker-backed when the host offers one, the
 * in-thread fallback otherwise (graceful degradation). A killed worker
 * respawns lazily on the next run. */
export function makeNotebookRunner(): NotebookRunner {
  const W = (globalThis as { Worker?: WorkerCtor }).Worker;
  const URLC = (globalThis as { URL?: URLCtor }).URL;
  if (W !== undefined && URLC !== undefined) {
    const r = makeWorkerRunner(W, URLC);
    if (r !== null) return r;
  }
  return threadRunner();
}
