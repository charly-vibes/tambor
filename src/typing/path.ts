// Purpose: the typed lens layer of typing.model — Path<S, T> over the
//   state.paths runtime navigators, plus the typed select/set/update
//   API and the typed navigator constructors.
// Responsibilities: a Path<S, T> is a lens from the state S to the
//   focused type T carrying the runtime navigator steps it delegates
//   to; composing Path<S, A> with Path<A, B> yields Path<S, B>;
//   select returns T; set requires a T; the navigators key, nth,
//   filter, take, drop, nilToVal and collectOne carry the documented
//   inferred types (key narrows to the property type, nth to the
//   element type, filter/take/drop keep the array type, nilToVal
//   removes undefined, collectOne prepends the collected type to the
//   update function parameters).
// Rationale: openspec/specs/typing-model/spec.md is the design authority; path
//   derivation (path.derivation) uses typed runtime refs rather than
//   macros and these types sit on top of that — the lens phantoms are
//   erased at runtime and every operation delegates to the exact
//   navigator steps the state.paths spec defines, so no behaviour
//   depends on a type (types_erased). CollectPath is deliberately NOT
//   a subtype of Path: the `__collect: true` marker versus Path's
//   `__collect?: undefined` blocker keeps the two update shapes apart
//   so a plain path can never be mistaken for a collect path.

import {
  select as rawSelect,
  setPath as rawSetPath,
  updatePath as rawUpdatePath,
  type Path as RawPath,
} from "../effects/paths.ts";

/**
 * A lens from the state type S to the focused type T. The phantoms are
 * type-only: a Path's runtime payload is the navigator steps it
 * delegates to.
 */
export interface Path<S, T> {
  /** the runtime navigator steps this lens delegates to */
  readonly steps: RawPath;
  /** phantom: the state type the path starts from */
  readonly __state?: S | undefined;
  /** phantom: the focused type */
  readonly __focus?: T | undefined;
  /** the collect-one blocker: plain paths never carry the marker */
  readonly __collect?: undefined;
}

/**
 * A path prefixing a collect-one step: the value at the collected path
 * C is prepended to the update function parameters (navigator_types);
 * F is the final focus after the continuation. The `__collect: true`
 * marker keeps it out of plain-path positions.
 */
export interface CollectPath<S, C, F = C> {
  readonly steps: RawPath;
  readonly __state?: S | undefined;
  /** phantom: the collected type */
  readonly __collected?: C | undefined;
  /** phantom: the final focus */
  readonly __focus?: F | undefined;
  readonly __collect: true;
}

/** The root path: the whole state. */
export function root<S>(): Path<S, S> {
  return { steps: [] };
}

/** key narrows to the property type. */
export function key<S, C, K extends keyof C & string>(
  p: Path<S, C>,
  k: K,
): Path<S, C[K]> {
  return { steps: [...p.steps, ["keypath", k] as const] };
}

/** nth narrows to the element type. */
export function nth<S, E>(p: Path<S, readonly E[]>, i: number): Path<S, E> {
  return { steps: [...p.steps, ["nth", i] as const] };
}

/** filter keeps the array type. */
export function filter<S, E>(
  p: Path<S, readonly E[]>,
  pred: (e: E) => boolean,
): Path<S, readonly E[]> {
  // adapt the typed predicate to the runtime Pred shape
  return { steps: [...p.steps, ["filter", (x: unknown) => pred(x as E)] as const] };
}

/** take keeps the array type. */
export function take<S, E>(p: Path<S, readonly E[]>, n: number): Path<S, readonly E[]> {
  return { steps: [...p.steps, ["take", n] as const] };
}

/** drop keeps the array type. */
export function drop<S, E>(p: Path<S, readonly E[]>, n: number): Path<S, readonly E[]> {
  return { steps: [...p.steps, ["drop", n] as const] };
}

/** nilToVal removes undefined: the default replaces a nil location. */
export function nilToVal<S, T>(p: Path<S, T | undefined>, v: T): Path<S, T> {
  return { steps: [...p.steps, ["nil-to-val", v] as const] };
}

/** collectOne collects the value at the target path and prepends it to
 * the update function parameters; the location itself is transparent. */
export function collectOne<S, T>(target: Path<S, T>): CollectPath<S, T, T> {
  return { steps: [["collect-one", target.steps] as const], __collect: true };
}

/** The runtime payload every collect path carries: the marker is what
 * keeps a collect path out of plain-path positions. */
interface CollectMarker {
  readonly steps: RawPath;
  readonly __collect: true;
}

/** Composing a collect path with a continuation keeps the collected
 * type and moves the final focus. */
export function compose<S, C, F, B>(
  p1: CollectPath<S, C, F>,
  p2: Path<S, B>,
): CollectPath<S, C, B>;
/** Composing Path<S, A> with Path<A, B> yields Path<S, B>. */
export function compose<S, A, B>(p1: Path<S, A>, p2: Path<A, B>): Path<S, B>;
export function compose<S, A, B>(
  p1: Path<S, A> | CollectMarker,
  p2: Path<A, B> | Path<S, B>,
): Path<S, B> | CollectPath<S, A, B> {
  const steps: RawPath = [...p1.steps, ...p2.steps];
  if (p1.__collect === true) return { steps, __collect: true };
  return { steps };
}

/** select returns T. */
export function select<S, T>(state: S, p: Path<S, T>): T {
  return rawSelect(state, p.steps) as T;
}

/** set requires a T at a Path<S, T>. */
export function set<S, T>(state: S, p: Path<S, T>, value: T): S {
  return rawSetPath(state, p.steps, value) as S;
}

/** update over a plain path: the function receives the old value. */
export function update<S, T, U>(
  state: S,
  p: Path<S, T>,
  f: (old: T) => U,
): S;
/** update over a collect path: the collected value is prepended to the
 * function parameters. */
export function update<S, C, F, U>(
  state: S,
  p: CollectPath<S, C, F>,
  f: (collected: C, old: F) => U,
): S;
export function update<S, T>(
  state: S,
  p: Path<S, T> | CollectPath<S, T, T>,
  f: (...a: never[]) => unknown,
): S {
  const lowered = f as unknown as (old: unknown, ...a: unknown[]) => unknown;
  return rawUpdatePath(state, p.steps, lowered) as S;
}
