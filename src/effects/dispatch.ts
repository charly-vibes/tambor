// Purpose: effect.dispatch — effects as typed data, the global effect
//   registry, dispatch with its three overload forms, and make-app.
// Responsibilities: define the Effect data shape ([type, ...args]);
//   defeffect registers handlers in a global registry (dispatchable by
//   type, callable directly); apply builtins update/set/get/delete and
//   clipboard-copy/clipboard-cut; skip and report unknown types; skip
//   empty or nil batches; apply batches strictly in order; schedule
//   exactly one repaint per dispatch on the next animation frame;
//   accept a plain initial state or an atom-like cell; place the
//   backend's container size in the render context; support a custom
//   dispatch for tests, undo history or an external store.
// Rationale: specs/effect-dispatch.md is the design authority.
//   counter-increment (update with inc) and add-counter (update with
//   conj of 0) are pre-registered effects. A registered effect receives
//   dispatch first; effects it dispatches are applied before it
//   returns, without re-triggering the repaint (one repaint per
//   top-level dispatch).

import { deletePath, select, setPath, updatePath, type Path } from "./paths.ts";
import type { Elem } from "../views/model.ts";

// An effect is a plain array whose first element is its type.
export type Effect = readonly unknown[];
export type EffectFn = (dispatch: DispatchFn, ...args: unknown[]) => unknown;
export type DispatchFn = (input: DispatchInput, ...rest: unknown[]) => undefined;
export type DispatchInput = string | Effect | readonly Effect[];
export type Handler = (state: unknown, effects: readonly Effect[], ctx: EffectContext) => unknown;

export interface Backend {
  copyToClipboard?: ((text: string) => void) | undefined;
  containerSize?: readonly [number, number] | null | undefined;
}

export interface EffectContext {
  readonly backend?: Backend | undefined;
  [key: string]: unknown;
}

// The registry is global: defeffect registers under its namespaced type.
const registry = new Map<string, EffectFn>();

/** defeffect: register an effect handler; the function is also exposed by name for isolated tests. */
export function defeffect(type: string, fn: EffectFn): EffectFn {
  registry.set(type, fn);
  return fn;
}

export function lookupEffect(type: string): EffectFn | undefined {
  return registry.get(type);
}

// The counter example's effects, registered like any other effect:
// counter-increment updates a path with inc, add-counter with conj of 0.
defeffect("counter-increment", (dispatch, ...raw: unknown[]) => {
  const path = raw[0] as Path;
  dispatch(["update", path, (n: unknown) => (n as number) + 1]);
});
defeffect("add-counter", (dispatch, ...raw: unknown[]) => {
  const path = raw[0] as Path;
  dispatch(["update", path, (nums: unknown) => [...(nums as unknown[]), 0]]);
});

// tap> — an unknown type is reported, never thrown.
function tap(value: unknown): void {
  console.log(value);
}

function builtin(state: unknown, effect: Effect, ctx: EffectContext): unknown {
  const [type, ...args] = effect;
  switch (type) {
    case "set":
      return setPath(state, args[0] as Path, args[1]);
    case "update":
      return updatePath(state, args[0] as Path, args[1] as (old: unknown, ...a: unknown[]) => unknown, ...args.slice(2));
    case "delete":
      return deletePath(state, args[0] as Path);
    case "get":
      // get is a pure read: the value at path, state unchanged
      select(state, args[0] as Path);
      return state;
    case "clipboard-copy":
    case "clipboard-cut":
      // writes the string to the system clipboard through the backend
      ctx.backend?.copyToClipboard?.(args[0] as string);
      return state;
    default:
      // an unknown type is reported and skipped; the rest of the
      // batch still runs
      tap(`unknown effect type: ${String(type)}`);
      return state;
  }
}

// The default handler applies builtin effects against the state in
// order; anything unregistered is reported and skipped.
export function defaultHandler(state: unknown, effects: readonly Effect[], ctx: EffectContext): unknown {
  let out = state;
  for (const effect of effects) out = builtin(out, effect, ctx);
  return out;
}

export interface ViewContext {
  [key: string]: unknown;
}
export type ViewFn = (state: unknown, context: ViewContext) => Elem;

export interface Cell<T> {
  value: T;
}

export function cell<T>(initial: T): Cell<T> {
  return { value: initial };
}

export function isCell(x: unknown): x is Cell<unknown> {
  return x !== null && typeof x === "object" && "value" in (x as Record<string, unknown>);
}

/** The stretch container-size key in the render context. */
export const CONTAINER_SIZE_KEY = "stretch/container-size";

export interface AppOptions {
  view: ViewFn;
  /** a plain initial state */
  state?: unknown;
  /** an atom-like cell, used as given (shared, not copied) */
  cell?: Cell<unknown>;
  /** the state handler; defaults to the builtin-applying defaultHandler */
  handler?: Handler | undefined;
  /** a custom dispatch for tests, undo history or an external store */
  dispatch?: ((effect: Effect) => unknown) | undefined;
  backend?: Backend | undefined;
}

export interface App {
  /** the view function: renders with the context (container size injected) */
  view(): Elem;
  dispatch: DispatchFn;
  getState(): unknown;
}

// make-app accepts an initial state or an atom and an optional handler,
// wraps the handler to skip empty or nil batches, and returns a view
// function.
export function makeApp(options: AppOptions): App {
  const useCell = options.cell !== undefined;
  let state = useCell ? options.cell!.value : options.state;
  const handler = options.handler ?? defaultHandler;

  const normalize = (input: DispatchInput, rest: unknown[]): readonly Effect[] => {
    // a bare type is a single effect, a sequence of effect vectors is a
    // batch, and type, ...args is one effect
    if (input === null || input === undefined) return []; // nil batch
    if (typeof input === "string") return [[input, ...rest]];
    if (Array.isArray(input)) {
      // a sequence of effect vectors is a batch; an empty array is an
      // empty batch; a vector whose head is a type is one effect
      if (input.length > 0 && typeof input[0] === "string") return [input as Effect];
      return input as readonly Effect[];
    }
    return [input as Effect];
  };

  const applyOne = (effect: Effect): void => {
    const [type, ...args] = effect;
    const fn = typeof type === "string" ? registry.get(type) : undefined;
    if (fn) {
      // a registered effect receives dispatch first; effects it
      // dispatches are applied before it returns (no repaint)
      fn(internalDispatch, ...args);
    } else {
      state = handler(state, [effect], { backend: options.backend });
      if (useCell) options.cell!.value = state;
    }
  };

  const dispatch: DispatchFn = (input, ...rest) => {
    const batch = normalize(input, rest);
    // an empty batch calls no handler and triggers no repaint
    if (batch.length === 0) return;

    if (options.dispatch) {
      // an app-supplied dispatch receives every effect
      for (const effect of batch) options.dispatch(effect);
    } else {
      for (const effect of batch) applyOne(effect);
    }

    // exactly one repaint, scheduled on the next animation frame
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => {
        app.view();
      });
    }
    return;
  };

  // effects composed from inside a registered effect still apply
  // immediately, but never schedule their own repaint
  const internalDispatch: DispatchFn = (input, ...rest) => {
    for (const effect of normalize(input, rest)) applyOne(effect);
    return;
  };

  const app: App = {
    view(): Elem {
      const context: ViewContext = {};
      const size = options.backend?.containerSize;
      // when the backend gives a container size it is placed in the
      // context under the stretch container-size key before render
      if (size !== undefined && size !== null) context[CONTAINER_SIZE_KEY] = size;
      return options.view(state, context);
    },
    dispatch,
    getState: () => state,
  };

  return app;
}