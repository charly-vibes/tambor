// Purpose: the state.paths walk engine — dispatch and entry points.
// Responsibilities: the single recursive walk dispatches each path step
//   to a per-navigator handler (special symbols in paths-walk-specials,
//   navigator tuples in paths-walk-navigators); select/set/update/
//   delete build a context and run the walk to a leaf.
// Rationale: openspec/specs/state-paths/spec.md is the design authority — never
//   improvise semantics beyond its constraint rows. Dispatch is a table
//   lookup so walk itself stays tiny; handlers receive the walk as
//   their first argument, keeping the module graph acyclic (tambor-272).

import {
  DELETED,
  normalize,
  selectLeaf,
  type Ctx,
  type Leaf,
  type Path,
  type Step,
  type WalkFn,
} from "./paths-core.ts";
import { SPECIAL_HANDLERS } from "./paths-walk-specials.ts";
import { NAV_HANDLERS } from "./paths-walk-navigators.ts";

// The single recursive walk. In select mode it returns the value at the
// end of the path; in write mode it returns the (possibly new)
// container at the current level, or DELETED when a delete removed it.
export const walk: WalkFn = (value, path, i, ctx, leaf, writeKey = true) => {
  if (i >= path.length) return leaf(value, ctx.collects);

  const step = path[i] as Step;

  if (typeof step === "string") {
    const handler = SPECIAL_HANDLERS[step];
    if (handler === undefined) throw new Error(`unknown navigator: ${String(step)}`);
    return handler(walk, value, step, path, i, ctx, leaf, writeKey);
  }

  const name = step[0] as string;
  const handler = NAV_HANDLERS[name];
  if (handler === undefined) throw new Error(`unknown navigator: ${String(name)}`);
  return handler(walk, value, step, path, i, ctx, leaf, writeKey);
};

// Shared walk for the elementwise sequence navigators (ALL): every
// element is a selected location.
export function walkSeq(
  value: unknown[],
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  start: number,
  end: number,
): unknown {
  const children: unknown[] = [];
  for (let j = start; j < end; j++) {
    children.push(walk(value[j], path, i + 1, ctx, leaf, true));
  }
  if (ctx.mode === "select") return children;
  const kept = children.filter((c) => c !== DELETED);
  const unchanged =
    kept.length === value.length && kept.every((c, j) => c === value[j]);
  return unchanged ? value : kept;
}

export function select(state: unknown, path: Path): unknown {
  return walk(state, normalize(path), 0, { root: state, collects: [], mode: "select" }, selectLeaf);
}

export function setPath(state: unknown, path: Path, v: unknown): unknown {
  return walk(state, normalize(path), 0, { root: state, collects: [], mode: "write" }, () => v);
}

export function updatePath(
  state: unknown,
  path: Path,
  f: (old: unknown, ...args: unknown[]) => unknown,
  ...args: unknown[]
): unknown {
  return walk(
    state,
    normalize(path),
    0,
    { root: state, collects: [], mode: "write" },
    (old, collects) => {
      const all: unknown[] = [...collects, old, ...args];
      return f(all[0] as unknown, ...all.slice(1));
    },
  );
}

export function deletePath(state: unknown, path: Path): unknown {
  return walk(state, normalize(path), 0, { root: state, collects: [], mode: "write" }, () => DELETED);
}
