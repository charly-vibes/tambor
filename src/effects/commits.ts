// Purpose: effect.commits — the commit/publication machinery of a
//   dispatching app (split out of effects/dispatch.ts).
// Responsibilities: define the runtime-invalidation ChangeSet (known
//   keypaths vs the conservative unknown fallback) and the frozen
//   DispatchCommit (previousState, state, ChangeSet, sequence starting
//   at 1, strictly increasing); own per-dispatch change collection —
//   builtin path edits record their paths, custom effects flip the
//   ChangeSet to unknown — scoped so nested (synchronous) dispatches
//   each publish against their own collector; publish one frozen commit
//   per top-level dispatch and deliver it to subscribers in
//   registration order, isolating a throwing listener — later listeners
//   still receive the commit and the first error is re-thrown after the
//   delivery pass — while a dispatch made during delivery queues as its
//   own later commit.
// Rationale: openspec/specs/effect-dispatch/spec.md and the
//   add-runtime-invalidation change are the design authorities. This
//   module is publication-only: it never applies effects or schedules
//   repaints, so the dispatch loop (dispatch.ts) depends on it one-way.
//   The DispatchFn type is a type-only import — erased at runtime, so
//   no import cycle exists despite dispatch.ts re-exporting these
//   symbols for its existing importers.

import type { Path, Step } from "./paths.ts";
import type { DispatchFn } from "./dispatch.ts";

// Runtime-invalidation ChangeSet (add-runtime-invalidation): what a
// dispatch touched, as data. Known narrows to the touched keypaths;
// unknown is the conservative fallback (full re-derive downstream).
export interface KnownChange {
  readonly kind: "known";
  /** the touched paths, exactly as dispatched */
  readonly paths: readonly Path[];
}

export interface UnknownChange {
  readonly kind: "unknown";
  /** why the change could not be narrowed to paths */
  readonly reason: string;
}

export type ChangeSet = KnownChange | UnknownChange;

// The immutable commit published after each top-level dispatch: one
// frozen object shared by every subscriber (add-runtime-invalidation).
// The freeze is deep at one level — the ChangeSet and the known paths
// array are frozen with it.
export interface DispatchCommit {
  readonly previousState: unknown;
  readonly state: unknown;
  readonly changes: ChangeSet;
  /** strictly increasing, starting at 1 */
  readonly sequence: number;
}

export type CommitListener = (commit: DispatchCommit) => void;

// Per-dispatch path collection: builtin path edits record their paths,
// custom effects flip the whole ChangeSet to unknown (conservative).
export interface ChangeCollector {
  paths: Path[];
  unknownReason: string | null;
}

// keypath steps unwrap to their bare keys so a one-keypath path reads
// as ["n"]; non-keypath navigators pass through untouched.
export function plainPath(path: Path): Path {
  return path.map((step) =>
    Array.isArray(step) && step[0] === "keypath" ? (step[1] as Step) : step,
  );
}

// Change collection is per top-level dispatch; the active dispatch sets
// it and restores the outer value in its finally, so nested (synchronous)
// dispatches each publish against their own collector.
let currentCollector: ChangeCollector | null = null;

/** the collector of the dispatch currently applying, if any */
export function activeCollector(): ChangeCollector | null {
  return currentCollector;
}

/** runs fn with collector active, restoring the outer collector afterwards */
export function scopedCollector<T>(collector: ChangeCollector, fn: () => T): T {
  const outerCollector = currentCollector;
  currentCollector = collector;
  try {
    return fn();
  } finally {
    currentCollector = outerCollector;
  }
}

type DispatchInput = Parameters<DispatchFn>[0];

export interface CommitStream {
  publish: (previousState: unknown, collector: ChangeCollector) => void;
  subscribe: (listener: CommitListener) => () => void;
  isDelivering: () => boolean;
  /** queues a dispatch made during delivery as its own later commit */
  enqueue: (input: DispatchInput, rest: unknown[]) => void;
}

interface PendingDispatch {
  input: DispatchInput;
  rest: unknown[];
}

interface CommitStreamState {
  sequence: number;
  delivering: boolean;
  listeners: CommitListener[];
  pending: PendingDispatch[];
  getState: () => unknown;
  getDispatch: () => DispatchFn;
}

// the ChangeSet freezes too (the commit freeze is shallow): the known
// paths array is COPIED so a listener cannot mutate the collector's
// live array through the published commit
function buildCommit(
  state: CommitStreamState,
  previousState: unknown,
  collector: ChangeCollector,
): DispatchCommit {
  const changes: ChangeSet =
    collector.unknownReason !== null
      ? Object.freeze({ kind: "unknown", reason: collector.unknownReason })
      : Object.freeze({ kind: "known", paths: Object.freeze([...collector.paths]) });
  return Object.freeze({
    previousState,
    state: state.getState(),
    changes,
    sequence: state.sequence,
  });
}

// Throw isolation (add-runtime-invalidation task 2.3): a throwing
// listener does not prevent later listeners from receiving the commit —
// each delivery is wrapped, the FIRST error is collected, and it is
// re-thrown only after every listener was served (delivery order
// otherwise unchanged; no-op when nothing throws).
function deliverCommit(
  state: CommitStreamState,
  commit: DispatchCommit,
): { error: unknown } | null {
  let firstError: { error: unknown } | null = null;
  // snapshot at dispatch start: unsubscribes during delivery affect
  // only the NEXT commit
  for (const listener of [...state.listeners]) {
    try {
      listener(commit);
    } catch (error) {
      firstError ??= { error };
    }
  }
  return firstError;
}

// a listener's reentrant dispatch lands as its own new commit with a
// strictly greater sequence
function drainPending(state: CommitStreamState): void {
  while (state.pending.length > 0) {
    const next = state.pending.shift()!;
    state.getDispatch()(next.input, ...next.rest);
  }
}

// publishes the frozen commit after a top-level dispatch's effects
// apply, then delivers it to the snapshot of subscribers in
// registration order
function publishCommit(
  state: CommitStreamState,
  previousState: unknown,
  collector: ChangeCollector,
): void {
  state.sequence += 1;
  const commit = buildCommit(state, previousState, collector);
  state.delivering = true;
  let firstError: unknown;
  let hasFirstError = false;
  try {
    const delivered = deliverCommit(state, commit);
    if (delivered !== null) {
      firstError = delivered.error;
      hasFirstError = true;
    }
  } finally {
    state.delivering = false;
  }
  // the drain runs before the collected error surfaces so a THROWING
  // reentrant effect cannot swallow firstError — the first collected
  // error surfaces even when the queue itself fails mid-drain (throw
  // isolation, task 2.3); the drain's own error surfaces only when no
  // listener error was collected
  let drainError: { error: unknown } | null = null;
  try {
    drainPending(state);
  } catch (error) {
    drainError = { error };
  }
  if (hasFirstError) throw firstError;
  if (drainError !== null) throw drainError.error;
}

// subscription takes effect immediately; an unsubscribe made during
// delivery affects only the NEXT commit (delivery snapshots the list)
function subscribeListener(listeners: CommitListener[], listener: CommitListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
  };
}

/**
 * The per-app commit stream: sequence, subscriber list, delivery pass
 * and the reentrant-dispatch queue. `getState` reads the app's current
 * state at publish time; `getDispatch` yields the app's outer dispatch,
 * which drains the pending queue after delivery.
 */
export function makeCommitStream(
  getState: () => unknown,
  getDispatch: () => DispatchFn,
): CommitStream {
  // runtime-invalidation: per-app commit sequence starting at 1; a
  // dispatch made during delivery queues as its own later commit
  // (strictly increasing sequences, no deadlock)
  const state: CommitStreamState = {
    sequence: 0,
    delivering: false,
    listeners: [],
    pending: [],
    getState,
    getDispatch,
  };
  return {
    publish: (previousState, collector) => publishCommit(state, previousState, collector),
    subscribe: (listener) => subscribeListener(state.listeners, listener),
    isDelivering: () => state.delivering,
    enqueue: (input, rest) => {
      state.pending.push({ input, rest });
    },
  };
}
