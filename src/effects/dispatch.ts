// Purpose: effect.dispatch — the dispatch loop: effects as typed data,
//   the global effect registry, dispatch with its three overload
//   forms, and make-app. Commit/publication machinery (ChangeSet,
//   DispatchCommit, subscribe) lives in effects/commits.ts and is
//   re-exported here unchanged for existing importers.
// Responsibilities: define the Effect data shape ([type, ...args]);
//   defeffect registers handlers in a global registry (dispatchable by
//   type, callable directly); apply builtins update/set/get/delete and
//   clipboard-copy/clipboard-cut; skip and report unknown types; skip
//   empty or nil batches; apply batches strictly in order; schedule
//   exactly one repaint per dispatch on the next animation frame;
//   accept a plain initial state or an atom-like cell; place the
//   backend's container size in the render context; support a custom
//   dispatch for tests, undo history or an external store; own a per-app
//   ephemeral interaction lane the ["lane", key, fn] builtin applies to
//   without touching state identity (lane-only batches publish a commit
//   that still schedules no repaint); drive per-dispatch change
//   collection and publication through commits.ts — builtin path-edit
//   effects report known paths, custom handler effects default to an
//   unknown ChangeSet with a reason; re-export the commit types and
//   subscribe threading from commits.ts.
// Rationale: openspec/specs/effect-dispatch/spec.md and
//   openspec/specs/interaction-lane/spec.md are the design authorities.
//   counter-increment (update with inc) and add-counter (update with
//   conj of 0) are pre-registered effects. A registered effect receives
//   dispatch first; effects it dispatches are applied before it
//   returns, without re-triggering the repaint (one repaint per
//   top-level dispatch). Publication is downstream of dispatch (one-way
//   dependency on commits.ts; the DispatchFn type import there is
//   type-only, so no runtime cycle).

import { deletePath, select, setPath, updatePath, type Path } from "./paths.ts";
import type { Elem } from "../views/model.ts";
import {
  activeCollector,
  makeCommitStream,
  plainPath,
  scopedCollector,
  type ChangeCollector,
  type CommitListener,
} from "./commits.ts";

export type {
  ChangeSet,
  DispatchCommit,
  KnownChange,
  UnknownChange,
} from "./commits.ts";
export type { CommitListener };

// An effect is a plain array whose first element is its type.
export type Effect = readonly unknown[];

export type EffectFn = (dispatch: DispatchFn, ...args: unknown[]) => unknown;
export type DispatchFn = (input: DispatchInput, ...rest: unknown[]) => undefined;
export type DispatchInput = string | Effect | readonly Effect[] | null | undefined;
export type Handler = (state: unknown, effects: readonly Effect[], ctx: EffectContext) => unknown;

export interface Backend {
  copyToClipboard?: ((text: string) => void) | undefined;
  containerSize?: readonly [number, number] | null | undefined;
}

export interface EffectContext {
  readonly backend?: Backend | undefined;
  [key: string]: unknown;
}

// The per-app ephemeral interaction lane (interaction-lane): plain
// mutable record, never part of state, reached through the ctx
// extra-keys seam so the global registry stays app-agnostic.
export type LaneStore = Record<string, unknown>;

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

// dispatch accepts a bare type (a single effect), type with args (one
// effect), a sequence of effect vectors (a batch), or an empty/nil batch.
function normalizeBatch(input: DispatchInput, rest: readonly unknown[]): readonly Effect[] {
  if (input === null || input === undefined) return [];
  if (typeof input === "string") return [[input, ...rest]];
  if (Array.isArray(input)) {
    if (input.length > 0 && typeof input[0] === "string") return [input as Effect];
    return input as readonly Effect[];
  }
  return [input as Effect];
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
  /** the app's ephemeral interaction lane (interaction-lane) */
  getLane(): LaneStore;
  /**
   * Subscribe to commits; returns an unsubscribe taking effect from
   * the next commit. Optional on the shared interface (makeApp-backed
   * handles always carry it): apps built on other seams — the ops-app
   * wire — publish no commits, so they may omit the member and
   * accept listeners only through makeApp-backed handles
   * (add-runtime-invalidation).
   */
  subscribe?(listener: CommitListener): () => void;
}

// make-app accepts an initial state or an atom and an optional handler,
// wraps the handler to skip empty or nil batches, and returns a view
// function.
// exactly one repaint, scheduled on the next animation frame
function scheduleRepaint(repaint: () => void): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(repaint);
  }
}

// The view entry: builds the render context — when the backend gives a
// container size it is placed in the context under the stretch
// container-size key before render — and renders.
function appView(options: AppOptions, getState: () => unknown): Elem {
  const context: ViewContext = {};
  const size = options.backend?.containerSize;
  if (size !== undefined && size !== null) context[CONTAINER_SIZE_KEY] = size;
  return options.view(getState(), context);
}

// Internal dispatch: effects composed from inside a registered effect
// still apply immediately, but never schedule their own repaint.
function makeInternalDispatch(applyOne: (effect: Effect) => void): DispatchFn {
  return (input, ...rest) => {
    for (const effect of normalizeBatch(input, rest)) applyOne(effect);
  };
}

function makeAppObject(
  options: AppOptions,
  getState: () => unknown,
  dispatch: DispatchFn,
  getLane: () => LaneStore,
  subscribe: (listener: CommitListener) => () => void,
): App {
  return {
    view: () => appView(options, getState),
    dispatch,
    getState,
    getLane,
    subscribe,
  };
}

// The state box lets the extracted seams read and write the app's
// current state through one shared cell.
interface StateBox {
  state: unknown;
}

// Everything applyEffect needs from its owning app.
interface ApplyDeps {
  lane: LaneStore;
  ctx: EffectContext;
  handler: Handler;
  box: StateBox;
  useCell: boolean;
  cell?: Cell<unknown> | undefined;
}

// interaction-lane: the lane effect mutates the app's ephemeral lane
// store, never the state — lane[key] = updateFn(lane[key]).
function applyLane(lane: LaneStore, args: readonly unknown[]): void {
  const [key, fn] = args as [string, (old: unknown) => unknown];
  lane[key] = fn(lane[key]);
}

// change-collection annotation: builtin path edits report the touched
// path exactly as dispatched, keypath steps unwrapped; custom handler
// effects have no path annotations, so the ChangeSet degrades to
// unknown (conservative full re-derive)
function annotateCollector(type: unknown, args: readonly unknown[]): void {
  const collector = activeCollector();
  if (!collector) return;
  if (type === "set" || type === "update" || type === "delete") {
    collector.paths.push(plainPath(args[0] as Path));
  } else {
    collector.unknownReason ??= "custom handler";
  }
}

// Applies one effect: the lane effect runs registry-style BEFORE any
// state handler, so custom handlers (undo history, external stores)
// cannot drop lane writes; the store also rides the ctx extra-keys seam
// for handler reads. A registered effect receives dispatch first and
// effects it dispatches are applied before it returns (no repaint);
// anything else goes through the state handler, mirroring into the cell.
function applyEffect(effect: Effect, deps: ApplyDeps, internalDispatch: DispatchFn): void {
  const [type, ...args] = effect;
  if (type === "lane") return void applyLane(deps.lane, args);
  annotateCollector(type, args);
  const fn = typeof type === "string" ? registry.get(type) : undefined;
  if (fn) return void fn(internalDispatch, ...args);
  deps.box.state = deps.handler(deps.box.state, [effect], deps.ctx);
  if (deps.useCell && deps.cell) deps.cell.value = deps.box.state;
}

export function makeApp(options: AppOptions): App {
  const useCell = options.cell !== undefined;
  const box: StateBox = { state: useCell ? options.cell!.value : options.state };
  // the per-app lane store (interaction-lane): one plain record, owned
  // here, threaded through the effect context's extra-keys seam
  const deps: ApplyDeps = {
    lane: {},
    ctx: { backend: options.backend },
    handler: options.handler ?? defaultHandler,
    box,
    useCell,
    cell: options.cell,
  };
  deps.ctx = { backend: options.backend, lane: deps.lane };

  const applyOne = (effect: Effect): void => applyEffect(effect, deps, internalDispatch);
  const internalDispatch = makeInternalDispatch(applyOne);
  // the per-app commit stream: publish/subscribe/delivery and the
  // reentrant-dispatch queue live in commits.ts
  const stream = makeCommitStream(() => box.state, () => dispatch);
  const rawDispatch = makeAppDispatch(options, box, applyOne, stream.publish);
  // a dispatch during delivery queues as a new commit, processed after
  // the current delivery pass completes
  const dispatch: DispatchFn = (input, ...rest) => {
    if (stream.isDelivering()) {
      stream.enqueue(input, rest);
      return undefined;
    }
    return rawDispatch(input, ...rest);
  };
  return makeAppObject(options, () => box.state, dispatch, () => deps.lane, stream.subscribe);
}

// The effects-apply section of a dispatch: an app-supplied dispatch
// receives every effect (degrading the ChangeSet to unknown), otherwise
// each effect goes through applyOne.
function applyBatch(
  options: AppOptions,
  applyOne: (effect: Effect) => void,
  collector: ChangeCollector,
  batch: readonly Effect[],
): void {
  if (options.dispatch) {
    // an app-supplied dispatch receives every effect
    for (const effect of batch) {
      collector.unknownReason ??= "custom dispatch";
      options.dispatch(effect);
    }
  } else {
    for (const effect of batch) applyOne(effect);
  }
}

// The app dispatch: normalize, apply (custom dispatch first, applyOne
// otherwise), then exactly one repaint — skipped for a lane-only batch
// (interaction-lane lane_batch_no_repaint): it changed nothing the view
// derives from, so a 60 Hz lane stream costs no per-event
// re-derivation; any state effect repaints once as usual
// (single_repaint).
function makeAppDispatch(
  options: AppOptions,
  box: StateBox,
  applyOne: (effect: Effect) => void,
  publish: (previousState: unknown, collector: ChangeCollector) => void,
): DispatchFn {
  return (input, ...rest) => {
    const batch = normalizeBatch(input, rest);
    // an empty batch calls no handler and triggers no repaint
    if (batch.length === 0) return;

    // change collection spans the whole top-level dispatch: builtin
    // path edits record their paths, any custom effect degrades the
    // ChangeSet to unknown (conservative full re-derive)
    const collector: ChangeCollector = {
      paths: [],
      unknownReason: null,
      // the batch being applied, published as commit.intents
      // (add-gallery-inspector §1)
      intents: batch,
    };
    const previousState = box.state;
    scopedCollector(collector, () => applyBatch(options, applyOne, collector, batch));

    // a lane-only batch changed nothing the view derives from
    // (interaction-lane lane_batch_no_repaint): it still publishes its
    // commit (commits_published — every top-level dispatch publishes
    // exactly one), but the lane builtin leaves no path annotations, so
    // the ChangeSet carries the lane marker (unknown, lane-only batch
    // reason) and NO repaint is scheduled. Any state effect in the
    // batch commits and repaints exactly once as usual (single_repaint).
    if (batch.every((effect) => effect[0] === "lane")) {
      collector.unknownReason ??= "lane-only batch";
      publish(previousState, collector);
      return;
    }

    // the frozen commit publishes before the repaint is scheduled
    publish(previousState, collector);

    // exactly one repaint, scheduled on the next animation frame
    scheduleRepaint(() => appView(options, () => box.state));
    return;
  };
}
