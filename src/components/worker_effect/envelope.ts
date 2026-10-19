// Purpose: the request/response envelope of the worker effect
//   (components.worker_effect, tambor-54j.8.6) — a typed plain-data
//   protocol around a pure handler table, spoken identically by the
//   app's bundled browser worker entry and the node worker_threads test
//   harness (tests/helpers/worker-effect-node.ts).
// Responsibilities: the WorkerEffectRequest shape (a caller id echoed
//   back, the handler name, the plain-data input); the
//   WorkerEffectResponse union (the handler's value, or a typed
//   failure carrying the message); runWorkerEffect — run one handler
//   under the request, never throwing across the boundary.
// Rationale: openspec/specs/components-worker_effect/spec.md is the
//   design authority. The envelope follows the notebook precedent
//   (src/examples/notebook/worker-main.ts, tambor-54j.9) one
//   generalization over: the notebook envelope is notebook-shaped (a
//   full cells/sliders/prev/dirty evaluation), while a kit effect needs
//   the smallest shape that still keeps every failure typed — a
//   handler NAME into an app-supplied pure table plus its input. The
//   core stays pure and boundary-free: handlers are plain functions of
//   their input only, and runWorkerEffect catches every throw into the
//   failure branch — a worker entry must never throw across the
//   boundary (the runNotebook rule).

export interface WorkerEffectRequest {
  readonly id: number;
  readonly handler: string;
  /** plain, structured-cloneable data — the handler's only input */
  readonly input: unknown;
}

/** The typed outcome of one off-thread run: the handler's value, or a
 * typed failure carrying its message. */
export type WorkerEffectResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly message: string };

/** A worker-effect handler: a PURE function of its input only — no
 * reads of ambient state, no writes outside its returned value (the
 * pure-handler contract in the spec corpus; the same discipline the
 * notebook's runAll rides). */
export type WorkerEffectHandler = (input: unknown) => unknown;

/** Run one handler to a typed response: look the handler up in the
 * table, call it with the input, catching every failure into the
 * failure branch. An unknown handler name is a typed failure too —
 * never a cross-boundary throw. */
export function runWorkerEffect(
  handlers: Readonly<Record<string, WorkerEffectHandler>>,
  req: WorkerEffectRequest,
): WorkerEffectResponse {
  const h = handlers[req.handler];
  if (h === undefined) {
    return { id: req.id, ok: false, message: `unknown worker-effect handler: ${req.handler}` };
  }
  try {
    return { id: req.id, ok: true, value: h(req.input) };
  } catch (e) {
    return {
      id: req.id,
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
