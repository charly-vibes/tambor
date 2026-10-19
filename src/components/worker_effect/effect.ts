// Purpose: the effect-dispatch bridge of the worker effect
//   (components.worker_effect, tambor-54j.8.6) — the send/reply/error
//   shapes as typed effects: a run is dispatched as plain effect data,
//   and the off-thread answer comes back as a typed reply or typed
//   error effect the app's handler merges into state.
// Responsibilities: the worker-effect spawn shape
//   (["worker-effect", handlerName, input] — plain data, dispatched
//   like any effect); workerEffectHandler — the EffectFn the app
//   registers with defeffect, which sends the request through a
//   WorkerEffectClient and, on the reply, dispatches the typed
//   completion shape ([\"worker-effect-reply\", id, value]) or typed
//   failure shape ([\"worker-effect-error\", id, message]).
// Rationale: openspec/specs/components-worker_effect/spec.md is the
//   design authority. The kit's component model speaks effects as
//   typed data ([type, ...args], src/effects/dispatch.ts) — the
//   notebook boundary returns Promises, which is the right shape for
//   its app code but not for an app that wants the off-thread result
//   to land in state through the ordinary dispatcher wire. The bridge
//   is deliberately thin: no registry of its own, no new scheduling —
//   the reply rides the SAME dispatch the effect system already
//   repaints on. The reply is asynchronous by nature (a real
//   termination-able worker takes as long as the compute takes), so
//   the handler returns before the reply lands and the app merges
//   state on the reply effect — the same per-cell flow the notebook
//   app rides (notebook-intents.ts), one shape over.

import type { EffectFn } from "../../effects/dispatch.ts";
import type { WorkerEffectClient } from "./client.ts";

// The spawn shape: one worker-effect run, dispatched as plain data.
export type WorkerEffectSpawnEffect = readonly [
  "worker-effect",
  handler: string,
  input: unknown,
];

// The typed reply shape: the handler's value landed.
export type WorkerEffectReplyEffect = readonly [
  "worker-effect-reply",
  id: number,
  value: unknown,
];

// The typed error shape: the run failed (or was terminated) and the
// message landed.
export type WorkerEffectErrorEffect = readonly [
  "worker-effect-error",
  id: number,
  message: string,
];

/** The EffectFn for defeffect("worker-effect", ...): dispatch a spawn
 * effect, and the reply (or typed error) comes back through the SAME
 * dispatch — the app registers its own handlers for
 * "worker-effect-reply" / "worker-effect-error" and merges state
 * there. The handler returns before the reply lands: a worker-effect
 * run is asynchronous by nature. */
export function workerEffectHandler(client: WorkerEffectClient): EffectFn {
  return (dispatch, ...raw: unknown[]) => {
    const handler = raw[0] as string;
    const input = raw[1];
    void client.run(handler, input).then((r) => {
      if (r.ok) dispatch(["worker-effect-reply", r.id, r.value]);
      else dispatch(["worker-effect-error", r.id, r.message]);
    });
  };
}
