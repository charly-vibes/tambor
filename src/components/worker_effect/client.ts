// Purpose: the client of the worker effect (components.worker_effect,
//   tambor-54j.8.6) — spawn the off-thread evaluation of a pure
//   handler, or degrade to the in-thread fallback when the host has no
//   Worker; the reply (or typed error) resolves per-request, and an
//   OPTIONAL terminate ends the spawned worker with in-flight runs
//   resolved as typed failures.
// Responsibilities: the structural WorkerLike seam (no lib.dom — the
//   core stays DOM-free); makeWorkerEffectRunner — a Worker-backed
//   client against the app's bundled worker asset; makeWorkerEffect —
//   the host-aware constructor that falls back in-thread; per-request
//   id routing so a late reply resolves only its own promise;
//   terminate() — terminate the worker, answer in-flight requests with
//   the typed terminated failure, and RESPAWN lazily on the next run
//   (the client stays usable after a terminate, like the notebook's
//   kill round trip); the load-failure downgrade — if the asset never
//   loads, in-flight runs resolve as typed failures and later runs use
//   the in-thread fallback.
// Rationale: openspec/specs/components-worker_effect/spec.md is the
//   design authority. The scope decision (BZ6) is followed exactly:
//   NO kill-switch-as-universal-mechanism — the only termination is the
//   OPTIONAL terminate on the client's own spawned worker, the
//   notebook precedent's kill minus the notebook semantics (tambor-54j.9:
//   lazy respawn so the boundary stays usable; a killed run answers as
//   a typed failure, never a stuck promise). The fallback answers the
//   same Promise contract evaluated synchronously on the host thread —
//   where the jsdom/node harnesses (no Worker global) ride today's
//   behavior, and the graceful-degradation contract holds all the way
//   down.

import {
  runWorkerEffect,
  type WorkerEffectHandler,
  type WorkerEffectRequest,
  type WorkerEffectResponse,
} from "./envelope.ts";

interface WorkerLike {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: { readonly data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

type WorkerCtor = new (url: unknown, opts: { readonly type: string }) => WorkerLike;

type URLCtor = new (u: string, base: string) => unknown;

/** A worker-effect boundary. `worker` says which side answered: true =
 * the off-thread Worker (a long compute never blocks the host wire;
 * terminate() is available), false = the in-thread fallback (terminate
 * is a no-op — the run already finished synchronously). */
export interface WorkerEffectClient {
  readonly worker: boolean;
  run(handler: string, input: unknown): Promise<WorkerEffectResponse>;
  /** optional terminate: ends the spawned worker; in-flight runs
   * resolve as the typed terminated failure and the NEXT run respawns
   * a fresh worker. A no-op on the in-thread fallback. */
  terminate(): void;
}

// The typed failure a terminated run resolves with.
export const TERMINATED_MESSAGE = "terminated";

// The typed failure of a worker asset that never loaded.
const LOAD_MESSAGE = "worker effect failed to load — runs fall back in-thread";

// The typed failure a malformed reply whose echoed id routes delivers
// (add-worker-reply-validation: a malformed envelope never resolves a
// pending request with the malformed payload).
const MALFORMED_MESSAGE = "malformed worker reply";

// The validated-reply view of one incoming message (the reply guard):
// a plain object with a numeric id, a boolean ok, and the payload shape
// the envelope declares for that ok (value present on ok:true, a string
// message on ok:false). `routable` says a numeric id exists — a
// malformed reply whose id still routes delivers a typed failure to its
// own request; a reply with NO numeric id (nothing to route by) is
// dropped inertly.
function validateReply(
  data: unknown,
): { readonly reply: WorkerEffectResponse } | { readonly routableId: number } | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (typeof m["id"] !== "number") return null;
  if (typeof m["ok"] !== "boolean") return { routableId: m["id"] };
  if (m["ok"] === true) {
    if (!("value" in m)) return { routableId: m["id"] };
    return { reply: m as unknown as WorkerEffectResponse };
  }
  if (typeof m["message"] !== "string") return { routableId: m["id"] };
  return { reply: m as unknown as WorkerEffectResponse };
}

// Deliver one validated (or failed) reply through the pending queue:
// a malformed envelope whose id routes answers its own request with the
// typed malformed failure — every reply resolves, never rejects.
function deliverReply(pending: PendingQueue, data: unknown): void {
  const v = validateReply(data);
  if (v === null) return; // no numeric id — nothing to route by
  if ("reply" in v) {
    pending.deliver(v.reply);
    return;
  }
  pending.deliver({ id: v.routableId, ok: false, message: MALFORMED_MESSAGE });
}

// Spawn the worker against the app's bundled asset: import.meta.url is
// the bundler-resolved module address; reached structurally (the ES2022
// lib has no ImportMeta.url declaration). The asset name is reached
// relative to the bundled entry address so it resolves on Pages too
// (the notebook client's dist/notebook-worker.js precedent).
function spawnWorker(W: WorkerCtor, URLC: URLCtor, asset: string): WorkerLike | null {
  try {
    const here = (import.meta as unknown as { url: string }).url;
    return new W(new URLC(asset, here), { type: "module" });
  } catch {
    return null; // construction can fail even where Worker exists
  }
}

// Wire one live worker: replies route through the pending queue; a load
// failure marks the boundary dead, answers every in-flight request as a
// typed failure and clears the queue. Re-attached to every respawn.
function wireWorker(
  live: WorkerLike,
  pending: PendingQueue,
  onDead: () => void,
): void {
  live.onmessage = (e: { readonly data: unknown }) => deliverReply(pending, e.data);
  live.onerror = () => {
    onDead();
    pending.failAll(LOAD_MESSAGE);
  };
}

// The per-request reply queue: the echoed id routes each reply to its
// own promise, so a superseded run's late reply never cross-resolves.
interface PendingQueue {
  add(id: number, resolve: (r: WorkerEffectResponse) => void): void;
  deliver(r: WorkerEffectResponse): void;
  failAll(message: string): void;
}

// One request across the boundary: queue the resolver under the echoed
// id and post the plain-data envelope.
function sendRequest(
  live: WorkerLike,
  pending: PendingQueue,
  handler: string,
  input: unknown,
): Promise<WorkerEffectResponse> {
  const id = nextId();
  return new Promise((resolve) => {
    pending.add(id, resolve);
    live.postMessage({ id, handler, input } satisfies WorkerEffectRequest);
  });
}

function makePending(): PendingQueue {
  const map = new Map<number, (r: WorkerEffectResponse) => void>();
  return {
    add: (id, resolve) => {
      map.set(id, resolve);
    },
    deliver: (r) => {
      map.get(r.id)?.(r);
      map.delete(r.id);
    },
    failAll: (message) => {
      for (const [id, resolve] of map) resolve({ id, ok: false, message });
      map.clear();
    },
  };
}

/** The Worker-backed client: requests routed by their echoed id; a
 * terminate() terminates and answers every pending request with the
 * typed terminated failure, then the NEXT run respawns a fresh worker
 * (lazy — the boundary stays usable); a worker that fails to load
 * resolves in-flight runs as typed failures and permanently downgrades
 * to the in-thread fallback (graceful degradation all the way down). */
export function makeWorkerEffectRunner(
  W: WorkerCtor,
  URLC: URLCtor,
  asset: string,
  handlers: Readonly<Record<string, WorkerEffectHandler>> = {},
): WorkerEffectClient | null {
  const start = spawnWorker(W, URLC, asset);
  // no worker to attach → the host-aware constructor falls back
  if (start === null) return null;
  return liveClient(W, URLC, asset, start, handlers);
}

// The live boundary's state (current worker, dead flag) and its two
// operations — run (with lazy respawn) and terminate — in one closure
// so the exported constructor stays a thin spawn-or-fallback check.
function liveClient(
  W: WorkerCtor,
  URLC: URLCtor,
  asset: string,
  start: WorkerLike,
  handlers: Readonly<Record<string, WorkerEffectHandler>>,
): WorkerEffectClient {
  const pending = makePending();
  const fallback = threadRunner(handlers);
  let w: WorkerLike | null = start;
  let dead = false;
  const wire = (live: WorkerLike): void =>
    wireWorker(live, pending, () => (dead = true));
  wire(w);
  // a terminated worker respawns lazily: the boundary stays usable
  const respawn = (): WorkerLike | null => {
    w = spawnWorker(W, URLC, asset);
    if (w !== null) wire(w);
    return w;
  };
  return {
    worker: true,
    run: (handler, input) => {
      if (dead) return fallback.run(handler, input);
      const live = w ?? respawn();
      if (live === null) return fallback.run(handler, input);
      return sendRequest(live, pending, handler, input);
    },
    terminate: () => {
      const live = w;
      if (live === null) return;
      live.terminate();
      pending.failAll(TERMINATED_MESSAGE);
      w = null; // terminated — the next run() respawns a fresh worker
    },
  };
}

// The in-thread fallback: same contract, evaluated synchronously on the
// host thread against the app's pure handler table — a terminate is a
// no-op (nothing is left running).
function threadRunner(
  handlers: Readonly<Record<string, WorkerEffectHandler>>,
): WorkerEffectClient {
  return {
    worker: false,
    run: (handler, input) =>
      Promise.resolve(runWorkerEffect(handlers, { id: nextId(), handler, input })),
    terminate: () => {},
  };
}

// Monotonic request ids: the echo routes every reply to its own
// promise, so a superseded run's late reply never cross-resolves.
let idCounter = 0;
function nextId(): number {
  idCounter += 1;
  return idCounter;
}

/** The host-aware client: Worker-backed when the host offers a Worker
 * constructor and URL (browsers; node >= 12 harnesses), the in-thread
 * fallback otherwise (graceful degradation — the notebook's
 * makeNotebookRunner precedent). `asset` is the worker asset name the
 * app's bundler emits (e.g. "./worker-effect.js"). */
export function makeWorkerEffect(
  asset: string,
  handlers: Readonly<Record<string, WorkerEffectHandler>> = {},
): WorkerEffectClient {
  const W = (globalThis as { Worker?: WorkerCtor }).Worker;
  const URLC = (globalThis as { URL?: URLCtor }).URL;
  if (W !== undefined && URLC !== undefined) {
    const c = makeWorkerEffectRunner(W, URLC, asset, handlers);
    if (c !== null) return c;
  }
  return threadRunner(handlers);
}
