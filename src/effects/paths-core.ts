// Purpose: shared atoms of the state.paths path system — symbols,
//   types and path normalization.
// Responsibilities: define the special symbols (ALL/FIRST/LAST/
//   MAP-VALS/END/META), the Navigator/Step/Path types, the navigator
//   vocabulary, and normalize (nested path arrays flatten; keypath-list
//   expands to nested keypath steps; the path navigator splices its
//   path); small value helpers shared by the walk.
// Rationale: specs/state-paths.md is the design authority. Splitting
//   the atoms out keeps paths.ts a thin public-API surface and the
//   walk machinery self-contained (tambor-272).

export const ALL = "ALL";
export const FIRST = "FIRST";
export const LAST = "LAST";
export const MAP_VALS = "MAP-VALS";
export const END = "END";
export const META = "META";

export type SpecialSymbol =
  | typeof ALL
  | typeof FIRST
  | typeof LAST
  | typeof MAP_VALS
  | typeof END
  | typeof META;

export type Navigator = readonly [name: string, ...args: unknown[]];
export type Step = Navigator | SpecialSymbol;
export type Path = readonly Step[];
export type Pred = (x: unknown) => boolean;

const SPECIALS: ReadonlySet<string> = new Set([ALL, FIRST, LAST, MAP_VALS, END, META]);

const NAVIGATORS: ReadonlySet<string> = new Set([
  "keypath",
  "nth",
  "seq-nth",
  "filter",
  "take",
  "drop",
  "nil-to-val",
  "keypath-list",
  "collect-one",
  "rest-args-map",
  "path",
  "const",
]);

export function isNavigator(step: unknown): step is Navigator {
  return Array.isArray(step) && typeof step[0] === "string" && NAVIGATORS.has(step[0]);
}

export function isSpecial(step: unknown): step is SpecialSymbol {
  return typeof step === "string" && SPECIALS.has(step);
}

// Nested path arrays flatten (nested_paths_flatten); keypath-list
// expands to nested keypath steps; the path navigator splices its path.
export function normalize(path: Path): Path {
  const out: Step[] = [];
  for (const step of path) {
    if (isSpecial(step) || isNavigator(step)) {
      if (Array.isArray(step)) {
        const name = step[0] as string;
        if (name === "keypath-list") {
          for (const k of step[1] as readonly PropertyKey[]) out.push(["keypath", k] as Navigator);
        } else if (name === "path") {
          out.push(...normalize(step[1] as Path));
        } else {
          out.push(step);
        }
      } else {
        out.push(step);
      }
    } else if (Array.isArray(step)) {
      out.push(...normalize(step as Path));
    } else {
      throw new Error(`unknown navigator: ${String(step)}`);
    }
  }
  return out;
}

export const DELETED: unique symbol = Symbol("deleted");

export type Mode = "select" | "write";

// Per-walk context threaded through the recursion.
export interface Ctx {
  readonly root: unknown;
  readonly collects: unknown[];
  readonly mode: Mode;
}

// The leaf applied when the path is exhausted.
export type Leaf = (old: unknown, collects: readonly unknown[]) => unknown;

// The recursive step-walk, passed to handlers so the handler modules
// stay acyclic (no handler-module → dispatcher import).
export type WalkFn = (
  value: unknown,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey?: boolean,
) => unknown;

export function selectLeaf(old: unknown): unknown {
  return old;
}

// Structural-sharing write helpers.
export function cloneWith(value: object, key: PropertyKey, child: unknown): object {
  if (Array.isArray(value)) {
    const out = [...(value as unknown[])];
    out[key as number] = child;
    return out;
  }
  return { ...(value as Record<PropertyKey, unknown>), [key]: child };
}

export function withoutKey(value: object, key: PropertyKey): object {
  if (Array.isArray(value)) {
    return (value as unknown[]).filter((_, i) => i !== (key as number));
  }
  const out = { ...(value as Record<PropertyKey, unknown>) };
  delete out[key];
  return out;
}

export function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

export function entriesOf(value: unknown): [PropertyKey, unknown][] {
  return Object.entries(value as Record<PropertyKey, unknown>) as [PropertyKey, unknown][];
}

export function keywordPred(pred: Pred | string): Pred {
  if (typeof pred === "string") return (x) => Boolean((x as Record<string, unknown>)?.[pred]);
  return pred;
}
