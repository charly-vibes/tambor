// Purpose: path.derivation — the typed runtime ref strategy and the
//   explicit, macro-free tier for deriving dollar paths from bindings.
// Responsibilities: Ref<T> values carrying value and path, with
//   get/getIn/nth/seqNth/filter/take/drop/or/assoc/selectOne/raw/rest/
//   restMap/each navigation; when-let and if-let guards; the dollar
//   name registry (bound names resolve, unbound ones stay plain
//   symbols); literal and opaque constant refs; the explicit
//   each(xs, $xs, fn) API; and the removed loop forms that throw.
// Rationale: specs/path-derivation.md is the design authority. The
//   known-call table maps nth/get/get-in/keyword call/filter/take/drop/
//   or/assoc/select-one/root-deref onto the navigators nth/keypath/
//   keypath-list/keypath/filter/take/drop/nil-to-val/identity/path/
//   rawPath — each ref operation below appends exactly its table
//   navigator. Derivation never reads types: paths are computed from
//   the dependencies at the time of binding (shadowing uses binding
//   time), so a later rebinding never changes an earlier ref's path.

import { select, setPath, updatePath, deletePath, type Path, type Pred } from "./paths.ts";

export type RefPath = Path;

export interface Ref<T = unknown> {
  readonly value: T;
  readonly path: RefPath;
  readonly root: unknown;
  /** get → keypath; with a default it adds a nilToVal step. */
  get(key: string, defaultValue?: unknown): Ref;
  /** get-in → keypathList. */
  getIn(keys: readonly string[]): Ref;
  /** nth → nth. */
  nth(i: number): Ref;
  /** seq-nth — the i-th entry of a map, or element of a sequence. */
  seqNth(i: number): Ref;
  /** filter → filter. */
  filter(pred: Pred | string): Ref;
  /** take → take. */
  take(n: number): Ref;
  /** drop → drop. */
  drop(n: number): Ref;
  /** or → nilToVal. */
  or(defaultValue: unknown): Ref;
  /** assoc is transparent: identity, the path does not change. */
  assoc(key: string, value: unknown): Ref<T>;
  /** select-one → path. */
  selectOne(path: RefPath): Ref;
  /** rest binding — the remaining sequence from start (drop). */
  rest(start: number): Ref;
  /** a rest map binding uses restArgsMap. */
  restMap(): Ref;
  /** root-deref → rawPath: the raw path itself. */
  raw(): Ref<T>;
  /** iteration: one ref per entry, at seq-nth(i). */
  each(): readonly Ref[];
}

// The pure navigation methods: each appends exactly its known-call
// table navigator to the ref's path.
function navMethods(root: unknown, path: RefPath): Pick<Ref, "get" | "getIn" | "nth" | "seqNth" | "filter" | "take" | "drop" | "or"> {
  return {
    get(key: string, defaultValue?: unknown): Ref {
      const steps: readonly unknown[] = defaultValue === undefined
        ? [["keypath", key]]
        : [["keypath", key], ["nil-to-val", defaultValue]];
      return derive(root, [...path, ...steps] as RefPath);
    },
    getIn(keys: readonly string[]): Ref {
      return derive(root, [...path, ["keypath-list", keys] as const]);
    },
    nth(i: number): Ref {
      return derive(root, [...path, ["nth", i] as const]);
    },
    seqNth(i: number): Ref {
      return derive(root, [...path, ["seq-nth", i] as const]);
    },
    filter(pred: Pred | string): Ref {
      return derive(root, [...path, ["filter", pred] as const]);
    },
    take(n: number): Ref {
      return derive(root, [...path, ["take", n] as const]);
    },
    drop(n: number): Ref {
      return derive(root, [...path, ["drop", n] as const]);
    },
    or(defaultValue: unknown): Ref {
      return derive(root, [...path, ["nil-to-val", defaultValue] as const]);
    },
  };
}

// The value-forming and iteration methods: assoc replaces the value at
// the same path; rest/restMap/raw/each navigate the remaining forms.
function valueMethods(root: unknown, path: RefPath, value: unknown): Pick<Ref, "assoc" | "selectOne" | "rest" | "restMap" | "raw" | "each"> {
  return {
    assoc(key: string, v: unknown): Ref {
      // assoc is transparent: same path, updated value
      return makeRef(root, path, { ...((value as Record<string, unknown>) ?? {}), [key]: v });
    },
    selectOne(p: RefPath): Ref {
      return derive(root, [...path, ["path", p] as const]);
    },
    rest(start: number): Ref {
      // a rest binding takes the path of the remaining sequence
      return derive(root, [...path, ["drop", start] as const]);
    },
    restMap(): Ref {
      return derive(root, [...path, ["rest-args-map"] as const]);
    },
    raw(): Ref {
      // root-deref: the raw path itself, still navigable
      return derive(root, path);
    },
    each(): readonly Ref[] {
      const items = entriesFor(value);
      return items.map((entry) =>
        derive(root, [...path, ["seq-nth", entry.index]] as RefPath),
      );
    },
  };
}

function makeRef(root: unknown, path: RefPath, value: unknown): Ref {
  return {
    value,
    path,
    root,
    ...navMethods(root, path),
    ...valueMethods(root, path, value),
  } as Ref;
}

// what does iterating this value yield? sequences yield their
// elements; maps yield their [key, value] entry pairs
function entriesFor(value: unknown): readonly { index: number }[] {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((_, index) => ({ index }));
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).map((_, index) => ({ index }));
  }
  return [];
}

function derive(root: unknown, path: RefPath): Ref {
  return makeRef(root, path, select(root, path));
}

/** The root ref: an empty path over the whole state. */
export function rootRef<T>(state: T): Ref<T> {
  return makeRef(state, [], state) as Ref<T>;
}

/** A literal value: a constant segment that can be read but not written. */
export function literalRef<T>(value: T): Ref<T> {
  return makeRef(null, [["const", value]] as unknown as RefPath, value) as Ref<T>;
}

/**
 * The result of an unrecognised function call: an opaque path that is
 * readable as a value but never writable.
 */
export function opaqueRef<T>(value: T): Ref<T> {
  return makeRef(null, [["const", value]] as unknown as RefPath, value) as Ref<T>;
}

// when-let with a nil or false value renders nothing and so produces
// no handlers; otherwise the body sees paths into the bound value.
export function whenLet<T>(
  ref: Ref<T>,
  body: (r: Ref<T>) => unknown,
): unknown {
  if (ref.value === null || ref.value === undefined || ref.value === false) return null;
  return body(ref);
}

// in if-let the then branch sees the new bindings and the else branch
// sees only the outer ones.
export function ifLet<T>(
  ref: Ref<T>,
  thenFn: (r: Ref<T>) => unknown,
  elseFn: (r: Ref<T>) => unknown,
): unknown {
  if (ref.value === null || ref.value === undefined || ref.value === false) {
    return elseFn(rootRef(ref.root) as Ref<T>);
  }
  return thenFn(ref);
}

// the dollar name registry: every name bound by destructuring has a
// dollar path; a dollar name with no bound base name is left as a plain
// symbol and is never replaced.
const dollarTable = new Map<string, Ref>();

export function bindDollar(name: string, ref: Ref): void {
  dollarTable.set(name, ref);
}

export function dollar(name: string): Ref | string {
  const ref = dollarTable.get(name);
  return ref ?? `$${name}`;
}

// The explicit, macro-free tier: path concatenation, a filter
// navigator, each(xs, $xs, fn).
export function each<T>(
  xs: readonly unknown[],
  $xs: Ref,
  fn: (item: Ref<T>) => unknown,
): readonly unknown[] {
  const out: unknown[] = [];
  for (const [i] of (xs as readonly unknown[]).entries()) {
    const item = derive($xs.root, [...$xs.path, ["seq-nth", i] as const]);
    out.push(fn(item as Ref<T>));
  }
  return out;
}

// The removed forms raise an error saying they are no longer supported.
export function fori(): never {
  throw new Error("fori is no longer supported — use for");
}
export function forKv(): never {
  throw new Error("for-kv is no longer supported — use for");
}
export function forWithLast(): never {
  throw new Error("for-with-last is no longer supported — use for");
}

// re-exported for the transform law (transform(path, f) changes only x)
export { select, setPath, updatePath, deletePath };