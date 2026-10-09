// Purpose: interop.model — the app-level seam binding: ops are supplied
//   once when an app is created and passed down internally, never held
//   in module-global state (ops_bound_to_app).
// Responsibilities: makeOpsApp(options) closes over the caller's ops
//   and registry; dispatch routes every effect application through
//   that closed-over seam, so two apps with different ops coexist and
//   each behaves per its own ops.
// Rationale: openspec/specs/interop-model/spec.md is the design authority. Unlike
//   the global effect registry of effect.dispatch, the interop tier
//   keeps its seam per instance: the ops object is constructor state,
//   not module state.

import { interDispatch, type SeamOptions } from "./seam.ts";
import { jsOps, type DataOps } from "./ops.ts";

export interface OpsAppOptions {
  /** a plain initial state, passed through unchanged (no conversion) */
  state?: unknown;
  /** the ops supplied once at creation; default jsOps */
  ops?: DataOps | undefined;
  /** the registry consulted before the builtins */
  registry?: Map<string, (state: unknown, ...args: unknown[]) => unknown> | undefined;
}

export interface OpsApp {
  /** dispatch a batch (or nil) of effect vectors through the app's ops */
  dispatch(batch: unknown): unknown;
  /** the current state — host data straight through */
  getState(): unknown;
}

export function makeOpsApp(options: OpsAppOptions): OpsApp {
  // the seam is closed over here — never module-global
  const seam: SeamOptions = {
    ops: options.ops ?? jsOps,
    ...(options.registry !== undefined ? { registry: options.registry } : {}),
  };
  let state = options.state;
  return {
    dispatch(batch: unknown): unknown {
      state = interDispatch(state, batch, seam);
      return state;
    },
    getState: () => state,
  };
}
