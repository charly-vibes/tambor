// Purpose: state.paths walk handlers for the navigator tuple steps
//   (keypath/nth/seq-nth/filter/take/drop/nil-to-val/keypath-list/
//   collect-one/rest-args-map/path/const).
// Responsibilities: one mode-aware handler per navigator plus its
//   write-back; structural-sharing helpers (cloneWith, withoutKey,
//   writeBackSubseq); the navigator dispatch table.
// Rationale: openspec/specs/state-paths/spec.md is the design authority — never
//   improvise semantics beyond its constraint rows. Handlers receive
//   the walk as their first argument so this module never imports the
//   dispatcher (tambor-272).

import {
  DELETED,
  cloneWith,
  entriesOf,
  isAbsent,
  keywordPred,
  normalize,
  selectLeaf,
  withoutKey,
  type Ctx,
  type Leaf,
  type Navigator,
  type Path,
  type Pred,
  type Step,
  type WalkFn,
} from "./paths-core.ts";

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

// Navigator-tuple handler (step[0] is the vocabulary key).
type NavHandler = (
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
) => unknown;

// Write a transformed sub-sequence back elementwise: every remaining
// element keeps its original position, deletions shrink the underlying
// sequence, and extras append after the last matched position.
function writeBackSubseq(
  value: unknown[],
  matched: readonly number[],
  child: readonly unknown[],
): unknown[] {
  const out = [...value];
  const lastMatched = matched.length > 0 ? (matched[matched.length - 1] as number) : -1;
  for (const [j, el] of child.entries()) {
    if (j < matched.length) out[matched[j] as number] = el;
    else out.splice(lastMatched + 1, 0, el); // extras append after the last match
  }
  for (let j = child.length; j < matched.length; j++) {
    out.splice(matched[j] as number, 1); // deletions shrink the subseq
  }
  return out;
}

function stepKeypath(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  const k = step[1] as PropertyKey;
  if (value === null || value === undefined) {
    if (ctx.mode === "select") return undefined;
    return createAbsentKeypath(walk, k, value, path, i, ctx, leaf);
  }
  if (typeof value !== "object") {
    if (ctx.mode === "select") return undefined;
    throw new Error(`cannot navigate into ${typeof value}`);
  }
  const cur = (value as Record<PropertyKey, unknown>)[k];
  const child = walk(cur, path, i + 1, ctx, leaf, true);
  if (ctx.mode === "select") return child;
  if (child === DELETED) return withoutKey(value, k);
  if (child === cur) return value;
  return cloneWith(value, k, child);
}

// Absent locations are created on write (absent_write_creates).
function createAbsentKeypath(
  walk: WalkFn,
  k: PropertyKey,
  value: unknown,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  const child = walk(undefined, path, i + 1, ctx, leaf, true);
  if (child === DELETED || child === undefined) return value;
  return { [k]: child };
}

function stepNth(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  const idx = step[1] as number;
  if (idx === 0 && !writeKey && ctx.mode === "write") {
    throw new Error("cannot write a map key");
  }
  if (ctx.mode === "select" && isAbsent(value)) return undefined;
  if (!Array.isArray(value)) return nthAbsentOrThrow(walk, value, idx, path, i, ctx, leaf);
  const cur = (value as unknown[])[idx];
  const child = walk(cur, path, i + 1, ctx, leaf, true);
  if (ctx.mode === "select") return child;
  if (child === DELETED) return (value as unknown[]).filter((_, j) => j !== idx);
  if (child === cur) return value;
  return cloneWith(value, idx, child);
}

function nthAbsentOrThrow(
  walk: WalkFn,
  value: unknown,
  idx: number,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  if (ctx.mode === "select") return undefined;
  if (isAbsent(value)) {
    const child = walk(undefined, path, i + 1, ctx, leaf, true);
    if (child === DELETED) return value;
    const out: unknown[] = [];
    out[idx] = child;
    return out;
  }
  throw new Error("nth requires a sequence");
}

function stepSeqNth(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  const idx = step[1] as number;
  if (ctx.mode === "select" && isAbsent(value)) return undefined;
  if (Array.isArray(value)) {
    return walk(value, [["nth", idx] as Navigator, ...path.slice(i + 1)], 0, ctx, leaf, true);
  }
  const entries = seqNthEntriesOrThrow(value, idx, ctx);
  if (entries === undefined) return undefined;
  const [k, cur] = entries[idx] as [PropertyKey, unknown];
  // the entry pair keeps its map shape on write-back; its key is
  // not writable (key_paths_read_only)
  const child = walk([k, cur], path, i + 1, ctx, leaf, false);
  if (ctx.mode === "select") return child;
  return writeBackSeqNth(value as object, entries, idx, k, cur, child);
}

// Guard the map-shape and range preconditions; undefined means the
// select short-circuits to undefined (absent_reads_undefined).
function seqNthEntriesOrThrow(
  value: unknown,
  idx: number,
  ctx: Ctx,
): readonly [PropertyKey, unknown][] | undefined {
  if (value === null || value === undefined || typeof value !== "object") {
    if (ctx.mode === "select") return undefined;
    throw new Error("seq-nth requires a sequence or map");
  }
  const entries = entriesOf(value);
  if (idx >= entries.length) {
    if (ctx.mode === "select") return undefined;
    throw new Error(`seq-nth index out of range: ${idx}`);
  }
  return entries;
}

function writeBackSeqNth(
  value: object,
  entries: readonly [PropertyKey, unknown][],
  idx: number,
  k: PropertyKey,
  cur: unknown,
  child: unknown,
): unknown {
  if (child === DELETED) return withoutKey(value, k);
  if (Array.isArray(child) && child[1] === cur && child[0] === k) return value;
  const out: Record<PropertyKey, unknown> = {};
  for (const [j, [ek, ev]] of entries.entries()) {
    out[ek] = j === idx ? (child as [PropertyKey, unknown])[1] : ev;
  }
  return out;
}

function stepFilter(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  if (ctx.mode === "select" && !Array.isArray(value)) return undefined;
  if (!Array.isArray(value)) throw new Error("filter requires a sequence");
  const pred = keywordPred(step[1] as Pred | string);
  const matched: number[] = [];
  for (const [j, el] of (value as unknown[]).entries()) {
    if (pred(el)) matched.push(j);
  }
  const subseq = matched.map((j) => (value as unknown[])[j]);
  const child = walk(subseq, path, i + 1, ctx, leaf, true);
  if (ctx.mode === "select") return child;
  return writeBackFilter(value as unknown[], matched, child);
}

function writeBackFilter(value: unknown[], matched: readonly number[], child: unknown): unknown {
  if (child === DELETED) {
    return value.filter((_, j) => !matched.includes(j));
  }
  // rewriting the sub-sequence elementwise keeps every matching
  // element in its original position and leaves non-matching
  // elements untouched
  if (Array.isArray(child)) {
    return writeBackSubseq(value, matched, child);
  }
  // a scalar write replaces every matching element
  const out = [...value];
  for (const j of matched) out[j] = child;
  return out;
}

function stepTakeDrop(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  const name = step[0] as string;
  if (ctx.mode === "select" && !Array.isArray(value)) return undefined;
  if (!Array.isArray(value)) throw new Error(`${name} requires a sequence`);
  const n = step[1] as number;
  const len = (value as unknown[]).length;
  const start = name === "take" ? 0 : Math.min(n, len);
  const end = name === "take" ? Math.min(n, len) : len;
  const subseq = (value as unknown[]).slice(start, end);
  const child = walk(subseq, path, i + 1, ctx, leaf, true);
  if (ctx.mode === "select") return child;
  if (child === DELETED) {
    return (value as unknown[]).filter((_, j) => j < start || j >= end);
  }
  if (!Array.isArray(child)) throw new Error(`${name} writes a sequence`);
  return [...(value as unknown[]).slice(0, start), ...child, ...(value as unknown[]).slice(end)];
}

function stepNilToVal(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  const dflt = step[1];
  const effective = isAbsent(value) ? dflt : value;
  const child = walk(effective, path, i + 1, ctx, leaf, writeKey);
  if (ctx.mode === "select") return child;
  if (child === DELETED) return isAbsent(value) ? value : DELETED;
  if (child === effective) return value;
  return child;
}

function stepKeypathList(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  const ks = step[1] as readonly PropertyKey[];
  const rest: unknown[] = [];
  for (const k of ks) rest.push(["keypath", k]);
  return walk(value, [...rest, ...path.slice(i + 1)], 0, ctx, leaf, writeKey);
}

function stepCollectOne(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  // transparent for navigation; prepends the value at its path to
  // the arguments of the update function, in path order
  ctx.collects.push(
    walk(ctx.root, normalize(step[1] as Path), 0,
      { root: ctx.root, collects: [], mode: "select" }, selectLeaf),
  );
  return walk(value, path, i + 1, ctx, leaf, writeKey);
}

function stepRestArgsMap(
  walk: WalkFn,
  value: unknown,
  _step: Step,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
): unknown {
  if (ctx.mode === "select" && !Array.isArray(value)) return undefined;
  const flat = Array.isArray(value) ? (value as unknown[]) : [];
  const view: Record<PropertyKey, unknown> = {};
  for (let j = 0; j + 1 < flat.length; j += 2) view[flat[j] as PropertyKey] = flat[j + 1];
  const child = walk(view, path, i + 1, ctx, leaf, true);
  if (ctx.mode === "select") return child;
  if (child === DELETED) return [];
  if (child === view) return value;
  const out: unknown[] = [];
  for (const [k, v] of Object.entries(child as Record<PropertyKey, unknown>)) {
    out.push(k, v);
  }
  return out;
}

function stepPathNav(
  walk: WalkFn,
  value: unknown,
  step: Navigator,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey: boolean,
): unknown {
  return walk(value, [...normalize(step[1] as Path), ...path.slice(i + 1)], 0, ctx, leaf, writeKey);
}

function stepConst(
  _walk: WalkFn,
  _value: unknown,
  step: Navigator,
  _path: readonly unknown[],
  _i: number,
  ctx: Ctx,
): unknown {
  if (ctx.mode === "write") throw new Error("cannot write a constant path segment");
  return step[1];
}

export const NAV_HANDLERS: Readonly<Record<string, NavHandler>> = {
  keypath: stepKeypath,
  nth: stepNth,
  "seq-nth": stepSeqNth,
  filter: stepFilter,
  take: stepTakeDrop,
  drop: stepTakeDrop,
  "nil-to-val": stepNilToVal,
  "keypath-list": stepKeypathList,
  "collect-one": stepCollectOne,
  "rest-args-map": stepRestArgsMap,
  path: stepPathNav,
  const: stepConst,
};
