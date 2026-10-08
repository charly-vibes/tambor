// Purpose: the typed effect layer of typing.model — the Effect
//   discriminated tuple union over the EffectMap registry, dispatch
//   that accepts only union members with the right arguments, the
//   typed on-intercept constructor, the function-bearing mark and the
//   raw-effect bridge to the effect.dispatch runtime.
// Responsibilities: EffectMap names the effect types and their
//   argument tuples (the built-ins update, set, get and delete carry
//   typed paths; applications register custom effects by extending the
//   interface by declaration merging); Effect is the union of
//   [type, ...args] tuples derived from the map; FunctionBearing marks
//   the kinds whose arguments carry functions; on(type, fn) infers the
//   parameters of fn from the registered effect type; dispatch accepts
//   only members of the union and hands them to the runtime
//   dispatcher; toRaw lowers a typed batch to the runtime effect data
//   (paths become their navigator steps).
// Rationale: specs/typing-model.md is the design authority. The type
//   system does all the rejection work (dispatch_checked) — at runtime
//   the batch is plain data forwarded to the effect.dispatch spec's
//   dispatcher unchanged, so no behaviour depends on a type
//   (types_erased). toRaw lowers a path argument by its `steps`
//   payload; that duck type names exactly what this layer constructs.

import { makeApp, type Effect as RuntimeEffect } from "../effects/dispatch.ts";
import type { Handler } from "../views/model.ts";
import type { Path } from "./path.ts";

/**
 * The effect registry: each member names an effect type and its
 * argument tuple. The built-ins are fixed; applications add their own
 * members by declaration merging (effect_union).
 */
export interface EffectMap {
  update: [path: Path<unknown, unknown>, fn: (old: never) => unknown];
  set: [path: Path<unknown, unknown>, value: unknown];
  get: [path: Path<unknown, unknown>];
  delete: [path: Path<unknown, unknown>];
}

/** The discriminated tuple union of the registered effect kinds. */
export type Effect = {
  [K in keyof EffectMap]-?: readonly [K, ...EffectMap[K]];
}[keyof EffectMap];

/** The function-bearing mark: does the registered kind carry a
 * function argument (serialisable_effects)? */
type IsFn<T> = T extends Function ? 1 : 0;
type MarkArgs<T> = { [i in keyof T]: IsFn<T[i]> };
export type FunctionBearing<K extends keyof EffectMap> =
  1 extends MarkArgs<EffectMap[K]>[number] ? true : false;

/**
 * on(type, fn): the parameters of fn infer from the registered effect
 * type, so the argument types are checked (intercept_typed). The
 * result is the [type, handler] pair the event.bubble layer nests
 * around a body.
 */
export function on<K extends keyof EffectMap>(
  type: K,
  fn: (...args: EffectMap[K]) => unknown,
): readonly [K, Handler] {
  return [type, fn as unknown as Handler];
}

/** Is this argument a typed path (lowered by its steps)? */
function isPath(x: unknown): x is Path<unknown, unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    !Array.isArray(x) &&
    Array.isArray((x as Path<unknown, unknown>).steps)
  );
}

/** Lower a typed batch to the runtime effect data: path arguments
 * become the navigator steps the runtime dispatcher navigates. */
export function toRaw(effects: Effect | readonly Effect[]): readonly RuntimeEffect[] {
  const batch = (Array.isArray(effects) ? effects : [effects]) as readonly Effect[];
  return batch.map((effect) => {
    const [type, ...args] = effect;
    return [type, ...args.map((arg) => (isPath(arg) ? arg.steps : arg))] as RuntimeEffect;
  });
}

/**
 * dispatch accepts only members of the Effect union and rejects an
 * unregistered effect type or wrong argument types at compile time
 * (dispatch_checked); at runtime the batch is forwarded to the
 * effect.dispatch dispatcher unchanged.
 */
export function dispatch(effects: Effect | readonly Effect[]): void {
  const app = makeApp({ view: () => null });
  app.dispatch(toRaw(effects));
}
