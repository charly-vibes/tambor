// Purpose: interop.model — the seam-routed state operations and effect
//   dispatch: every read or write of user state goes through the ops
//   object, and dispatch normalizes effect tags through it.
// Responsibilities: select, set, update and delete over a path with an
//   optional ops object (data_ops_seam); a per-call effect registry
//   keyed by opaque tag strings (string_tags: the registry treats them
//   as opaque strings); interDispatch applying a batch of effect
//   vectors — tags normalized via ops.tag so the keyword form and the
//   ns slash name string resolve to the same handler (p_string_tags);
//   builtins set, update, get and delete (delete only when the ops
//   carry dissoc); unknown tags reported and skipped; strict in-order
//   batch application; no state conversion in either direction
//   (no_boundary_conversion).
// Rationale: openspec/specs/interop-model/spec.md is the design authority. The
//   routing mirrors experiments/tambor-ops.mjs: host data straight in,
//   host data straight out, tags and paths normalized only through the
//   caller's ops. Paths are plain arrays of steps; their elements are
//   host data (keywords included) and are passed to ops.get/ops.assoc
//   untouched.

import { jsOps, type DataOps } from "./ops.ts";

/** The interop effect registry: opaque string tags to handlers. */
export type InterHandler = (state: unknown, ...args: unknown[]) => unknown;

/** A fresh registry — per call site, never module-global
 * (ops_bound_to_app). */
export function makeRegistry(): Map<string, InterHandler> {
  return new Map<string, InterHandler>();
}

export interface SeamOptions {
  /** the ops to route every state access through; default jsOps */
  ops?: DataOps | undefined;
  /** the registry consulted before the builtins */
  registry?: Map<string, InterHandler> | undefined;
}

/** Select the value at a path through the ops. */
export function seamSelect(state: unknown, path: readonly unknown[], options: SeamOptions = {}): unknown {
  const ops = options.ops ?? jsOps;
  let at = state;
  for (const key of path) {
    at = ops.get(at, key);
    if (at === null || at === undefined) return undefined;
  }
  return at;
}

/** Set a value at a path through the ops, immutably. */
export function seamSet(state: unknown, path: readonly unknown[], value: unknown, options: SeamOptions = {}): unknown {
  const ops = options.ops ?? jsOps;
  const go = (at: unknown, i: number): unknown => {
    if (i >= path.length) return value;
    return ops.assoc(at, path[i], go(ops.get(at, path[i]), i + 1));
  };
  return go(state, 0);
}

/** Update a value at a path through the ops: set with f(old, ...args). */
export function seamUpdate(
  state: unknown,
  path: readonly unknown[],
  f: (old: unknown, ...args: unknown[]) => unknown,
  ...args: unknown[]
): unknown {
  return seamSet(state, path, f(seamSelect(state, path), ...args));
}

/** Delete a value at a path through the ops (needs dissoc). */
export function seamDelete(state: unknown, path: readonly unknown[], options: SeamOptions = {}): unknown {
  const ops = options.ops ?? jsOps;
  if (ops.dissoc === undefined) return state;
  if (path.length === 0) return state;
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = seamSelect(state, parentPath, options);
  if (parent === null || parent === undefined) return state;
  return seamSet(state, parentPath, ops.dissoc(parent, key), options);
}

/** Apply one effect vector: registry first, then the builtins. An
 * unknown tag is reported and skipped; the batch still runs. */
function applyEffect(state: unknown, effect: readonly unknown[], options: SeamOptions): unknown {
  const tag = (options.ops ?? jsOps).tag(effect[0]);
  const registered = options.registry?.get(tag as string);
  if (registered) return registered(state, ...effect.slice(1));
  switch (tag) {
    case "set":
      return seamSet(state, effect[1] as readonly unknown[], effect[2], options);
    case "update":
      return updateAt(state, effect[1] as readonly unknown[], effect[2], options);
    case "get":
      // a pure read: the value at the path, state unchanged
      seamSelect(state, effect[1] as readonly unknown[], options);
      return state;
    case "delete":
      return seamDelete(state, effect[1] as readonly unknown[], options);
    default:
      // an unknown tag is reported and skipped, never thrown
      console.log(`unknown effect type: ${String(tag)}`);
      return state;
  }
}

/** The update builtin: set with f(old) when the carried f is callable. */
function updateAt(state: unknown, path: readonly unknown[], f: unknown, options: SeamOptions): unknown {
  if (typeof f !== "function") return state;
  return seamSet(state, path, (f as (old: unknown) => unknown)(seamSelect(state, path, options)), options);
}

/** Dispatch a batch of effect vectors through the seam, strictly in
 * order. The batch and each effect are normalized once at the boundary
 * via ops.toArray, so lazy host sequences work as inputs. */
export function interDispatch(state: unknown, batch: unknown, options: SeamOptions = {}): unknown {
  const ops = options.ops ?? jsOps;
  let out = state;
  for (const raw of ops.toArray(batch)) {
    out = applyEffect(out, ops.toArray(raw), options);
  }
  return out;
}
