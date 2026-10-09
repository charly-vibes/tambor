// Purpose: state.paths walk handlers for the special symbol steps
//   (ALL/FIRST/LAST/MAP-VALS/END/META).
// Responsibilities: one mode-aware handler per special symbol; each
//   receives the walk as its first argument so this module never
//   imports the dispatcher.
// Rationale: openspec/specs/state-paths/spec.md is the design authority — never
//   improvise semantics beyond its constraint rows (tambor-272).

import {
  ALL,
  DELETED,
  END,
  FIRST,
  LAST,
  MAP_VALS,
  META,
  entriesOf,
  isAbsent,
  type Ctx,
  type Leaf,
  type Navigator,
  type Step,
  type WalkFn,
} from "./paths-core.ts";
import { walkSeq } from "./paths-walk.ts";

type Handler = (
  walk: WalkFn,
  value: unknown,
  step: Step,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
) => unknown;

function stepAll(
  walk: WalkFn,
  value: unknown,
  _step: Step,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  if (ctx.mode === "select" && !Array.isArray(value)) return undefined;
  if (!Array.isArray(value)) throw new Error("ALL requires a sequence");
  return walkSeq(value, path, i, ctx, leaf, 0, (value as unknown[]).length);
}

function stepMapVals(
  walk: WalkFn,
  value: unknown,
  _step: Step,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  if (ctx.mode === "select" && (value === null || typeof value !== "object")) return undefined;
  if (value === null || typeof value !== "object") throw new Error("MAP-VALS requires a map");
  const entries = entriesOf(value);
  const children = entries.map(([, v]) => walk(v, path, i + 1, ctx, leaf, true));
  if (ctx.mode === "select") return children;
  return writeBackMapEntries(value, entries, children);
}

function writeBackMapEntries(
  value: unknown,
  entries: readonly [PropertyKey, unknown][],
  children: readonly unknown[],
): unknown {
  const out: Record<PropertyKey, unknown> = {};
  let changed = false;
  for (const [j, [k]] of entries.entries()) {
    const child = children[j] as unknown;
    if (child === DELETED) {
      changed = true;
    } else {
      out[k] = child;
      if (child !== (value as Record<PropertyKey, unknown>)[k]) changed = true;
    }
  }
  return changed ? out : value;
}

function stepFirst(
  walk: WalkFn,
  value: unknown,
  _step: Step,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  return walk(value, [["nth", 0] as Navigator, ...path.slice(i + 1)], 0, ctx, leaf, writeKey);
}

function stepLast(
  walk: WalkFn,
  value: unknown,
  _step: Step,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  if (ctx.mode === "select" && !Array.isArray(value)) return undefined;
  if (!Array.isArray(value)) throw new Error("LAST requires a sequence");
  const idx = (value as unknown[]).length - 1;
  return walk(value, [["nth", idx] as Navigator, ...path.slice(i + 1)], 0, ctx, leaf, writeKey);
}

function stepEnd(
  walk: WalkFn,
  value: unknown,
  _step: Step,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  // the insertion point after the last element
  const child = walk(undefined, path, i + 1, ctx, leaf, writeKey);
  if (ctx.mode === "select") return child;
  if (child === DELETED) return value;
  if (!Array.isArray(value)) return [child];
  return [...(value as unknown[]), child];
}

function stepMeta(
  walk: WalkFn,
  value: unknown,
  _step: Step,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  const meta = isAbsent(value) ? undefined : entriesOf(value).find(([k]) => k === "::meta")?.[1];
  const child = walk(meta, path, i + 1, ctx, leaf, writeKey);
  if (ctx.mode === "select") return child;
  if (child === DELETED) {
    if (meta === undefined) return value;
    const out = { ...(value as Record<PropertyKey, unknown>) };
    delete out["::meta"];
    return out;
  }
  if (child === meta) return value;
  if (isAbsent(value)) return { "::meta": child };
  return { ...(value as Record<PropertyKey, unknown>), "::meta": child };
}

export const SPECIAL_HANDLERS: Readonly<Record<string, Handler>> = {
  [ALL]: stepAll,
  [MAP_VALS]: stepMapVals,
  [FIRST]: stepFirst,
  [LAST]: stepLast,
  [END]: stepEnd,
  [META]: stepMeta,
};
