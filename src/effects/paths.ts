// Purpose: the state.paths path system — Specter-subset navigators as
//   plain data plus immutable select/set/update/delete over them.
// Responsibilities: encode navigators (["keypath", k], ["nth", i],
//   ["seq-nth", i], ["filter", pred], ["take", n], ["drop", n],
//   ["nil-to-val", v], ["keypath-list", ks], ["collect-one", p],
//   ["rest-args-map"], ["path", p], ["const", v]) and the special
//   symbols ALL/FIRST/LAST/MAP-VALS/END/META; normalize paths (nested
//   arrays flatten); select the value at a path; set, update and delete
//   immutably with structural sharing.
// Rationale: specs/state-paths.md is the design authority — never
//   improvise semantics beyond its constraint rows. Two encodings the
//   corpus demands but does not name: a ["const", v] navigator is the
//   constant segment of a literal value and the opaque segment of an
//   unknown-call result (both readable, never writable), and META
//   addresses a container's metadata under the reserved "::meta" key.
//   Absent locations read as undefined and are created on write; absent
//   locations short-circuit a select to undefined.

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

function isNavigator(step: unknown): step is Navigator {
  return Array.isArray(step) && typeof step[0] === "string" && NAVIGATORS.has(step[0]);
}

function isSpecial(step: unknown): step is SpecialSymbol {
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

const DELETED: unique symbol = Symbol("deleted");

type Mode = "select" | "write";

interface Ctx {
  readonly root: unknown;
  readonly collects: unknown[];
  readonly mode: Mode;
}

type Leaf = (old: unknown, collects: readonly unknown[]) => unknown;

function selectLeaf(old: unknown): unknown {
  return old;
}

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

function entriesOf(value: unknown): [PropertyKey, unknown][] {
  return Object.entries(value as Record<PropertyKey, unknown>) as [PropertyKey, unknown][];
}

function cloneWith(value: object, key: PropertyKey, child: unknown): object {
  if (Array.isArray(value)) {
    const out = [...(value as unknown[])];
    out[key as number] = child;
    return out;
  }
  return { ...(value as Record<PropertyKey, unknown>), [key]: child };
}

function withoutKey(value: object, key: PropertyKey): object {
  if (Array.isArray(value)) {
    return (value as unknown[]).filter((_, i) => i !== (key as number));
  }
  const out = { ...(value as Record<PropertyKey, unknown>) };
  delete out[key];
  return out;
}

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

function keywordPred(pred: Pred | string): Pred {
  if (typeof pred === "string") return (x) => Boolean((x as Record<string, unknown>)?.[pred]);
  return pred;
}

// The single recursive walk. In select mode it returns the value at the
// end of the path; in write mode it returns the (possibly new)
// container at the current level, or DELETED when a delete removed it.
function walk(
  value: unknown,
  path: readonly unknown[],
  i: number,
  ctx: Ctx,
  leaf: Leaf,
  writeKey = true,
): unknown {
  if (i >= path.length) return leaf(value, ctx.collects);

  const step = path[i] as Step;

  if (typeof step === "string") {
    // special navigators
    switch (step) {
      case ALL: {
        if (ctx.mode === "select" && !Array.isArray(value)) return undefined;
        if (!Array.isArray(value)) throw new Error("ALL requires a sequence");
        return walkSeq(value, path, i, ctx, leaf, 0, (value as unknown[]).length);
      }
      case MAP_VALS: {
        if (ctx.mode === "select" && (value === null || typeof value !== "object")) return undefined;
        if (value === null || typeof value !== "object") throw new Error("MAP-VALS requires a map");
        const entries = entriesOf(value);
        const children = entries.map(([, v]) => walk(v, path, i + 1, ctx, leaf, true));
        if (ctx.mode === "select") return children;
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
      case FIRST:
        return walk(value, [["nth", 0] as Navigator, ...path.slice(i + 1)], 0, ctx, leaf, writeKey);
      case LAST: {
        if (ctx.mode === "select" && !Array.isArray(value)) return undefined;
        if (!Array.isArray(value)) throw new Error("LAST requires a sequence");
        const idx = (value as unknown[]).length - 1;
        return walk(value, [["nth", idx] as Navigator, ...path.slice(i + 1)], 0, ctx, leaf, writeKey);
      }
      case END: {
        // the insertion point after the last element
        const child = walk(undefined, path, i + 1, ctx, leaf, writeKey);
        if (ctx.mode === "select") return child;
        if (child === DELETED) return value;
        if (!Array.isArray(value)) return [child];
        return [...(value as unknown[]), child];
      }
      case META: {
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
      default:
        throw new Error(`unknown navigator: ${String(step)}`);
    }
  }

  const name = step[0] as string;
  switch (name) {
    case "keypath": {
      const k = step[1] as PropertyKey;
      if (value === null || value === undefined) {
        if (ctx.mode === "select") return undefined;
        const child = walk(undefined, path, i + 1, ctx, leaf, true);
        if (child === DELETED || child === undefined) return value;
        return { [k]: child };
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
    case "nth": {
      const idx = step[1] as number;
      if (idx === 0 && !writeKey && ctx.mode === "write") {
        throw new Error("cannot write a map key");
      }
      if (ctx.mode === "select" && isAbsent(value)) return undefined;
      if (!Array.isArray(value)) {
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
      const cur = (value as unknown[])[idx];
      const child = walk(cur, path, i + 1, ctx, leaf, true);
      if (ctx.mode === "select") return child;
      if (child === DELETED) return (value as unknown[]).filter((_, j) => j !== idx);
      if (child === cur) return value;
      return cloneWith(value, idx, child);
    }
    case "seq-nth": {
      const idx = step[1] as number;
      if (ctx.mode === "select" && isAbsent(value)) return undefined;
      if (Array.isArray(value)) {
        return walk(value, [["nth", idx] as Navigator, ...path.slice(i + 1)], 0, ctx, leaf, true);
      }
      if (value === null || value === undefined || typeof value !== "object") {
        if (ctx.mode === "select") return undefined;
        throw new Error("seq-nth requires a sequence or map");
      }
      const entries = entriesOf(value);
      if (idx >= entries.length) {
        if (ctx.mode === "select") return undefined;
        throw new Error(`seq-nth index out of range: ${idx}`);
      }
      const [k, cur] = entries[idx] as [PropertyKey, unknown];
      // the entry pair keeps its map shape on write-back; its key is
      // not writable (key_paths_read_only)
      const child = walk([k, cur], path, i + 1, ctx, leaf, false);
      if (ctx.mode === "select") return child;
      if (child === DELETED) return withoutKey(value, k);
      if (Array.isArray(child) && child[1] === cur && child[0] === k) return value;
      const out: Record<PropertyKey, unknown> = {};
      for (const [j, [ek, ev]] of entries.entries()) {
        out[ek] = j === idx ? (child as [PropertyKey, unknown])[1] : ev;
      }
      return out;
    }
    case "filter": {
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
      if (child === DELETED) {
        return (value as unknown[]).filter((_, j) => !matched.includes(j));
      }
      // rewriting the sub-sequence elementwise keeps every matching
      // element in its original position and leaves non-matching
      // elements untouched
      if (Array.isArray(child)) {
        return writeBackSubseq(value as unknown[], matched, child);
      }
      // a scalar write replaces every matching element
      const out = [...(value as unknown[])];
      for (const j of matched) out[j] = child;
      return out;
    }
    case "take":
    case "drop": {
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
    case "nil-to-val": {
      const dflt = step[1];
      const effective = isAbsent(value) ? dflt : value;
      const child = walk(effective, path, i + 1, ctx, leaf, writeKey);
      if (ctx.mode === "select") return child;
      if (child === DELETED) return isAbsent(value) ? value : DELETED;
      if (child === effective) return value;
      return child;
    }
    case "keypath-list": {
      const ks = step[1] as readonly PropertyKey[];
      const rest: unknown[] = [];
      for (const k of ks) rest.push(["keypath", k]);
      return walk(value, [...rest, ...path.slice(i + 1)], 0, ctx, leaf, writeKey);
    }
    case "collect-one": {
      // transparent for navigation; prepends the value at its path to
      // the arguments of the update function, in path order
      ctx.collects.push(select(ctx.root, step[1] as Path));
      return walk(value, path, i + 1, ctx, leaf, writeKey);
    }
    case "rest-args-map": {
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
    case "path": {
      return walk(value, [...normalize(step[1] as Path), ...path.slice(i + 1)], 0, ctx, leaf, writeKey);
    }
    case "const": {
      if (ctx.mode === "write") throw new Error("cannot write a constant path segment");
      return step[1];
    }
    default:
      throw new Error(`unknown navigator: ${String(name)}`);
  }
}

// Shared walk for the elementwise sequence navigators (ALL): every
// element is a selected location.
function walkSeq(
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