// Purpose: shared host-language stand-ins for the interop-model contract
//   tests — ClojureScript keywords, persistent maps and the CLJS-flavored
//   DataOps seam, plus the plain-data / view-shape checkers the
//   predicates share.
// Responsibilities: model host data the library never inspects (only
//   the DataOps seam touches it, exactly the seam the corpus describes:
//   experiments/seam.cljs, experiments/tambor-ops.mjs are the
//   provenance); check plainness per interop.model.plain_data_api;
//   shape views for deep-equality across independently built apps.
// Rationale: specs/interop-model.md is the design authority. The
//   stand-ins live in the tests — host-language data is never part of
//   the library's public surface, so no class instance here violates
//   plain_data_api.

import type { DataOps } from "../../src/interop/ops.ts";
import type { Path } from "../../src/effects/paths.ts";

// The host globals tsconfig's ES2022 lib does not name; both exist in
// every runtime vitest targets (structuredClone: WHATWG HTML,
// performance: Web).
declare const structuredClone: <T>(value: T) => T;
declare const performance: { now(): number };

/** A ClojureScript keyword stand-in: a host object, normalized only by ops.tag. */
export class Keyword {
  constructor(
    readonly ns: string | null,
    readonly name: string,
  ) {}
  toString(): string {
    return this.ns === null ? this.name : `${this.ns}/${this.name}`;
  }
}
export const kw = (ns: string | null, name: string): Keyword => new Keyword(ns, name);

/** A ClojureScript persistent-map stand-in: assoc shares untouched entries. */
export class PMap {
  constructor(private readonly m: ReadonlyMap<unknown, unknown>) {}
  get(k: unknown): unknown {
    return this.m.get(k);
  }
  assoc(k: unknown, v: unknown): PMap {
    const next = new Map(this.m);
    next.set(k, v);
    return new PMap(next);
  }
  dissoc(k: unknown): PMap {
    const next = new Map(this.m);
    next.delete(k);
    return new PMap(next);
  }
  entries(): [unknown, unknown][] {
    return [...this.m.entries()];
  }
}
export const pmap = (entries: [unknown, unknown][]): PMap => new PMap(new Map(entries));

/** CLJS maps hash keywords; the stand-in canonicalizes keyword keys to
 * their string form inside the ops — the library never sees this. */
export const keyOf = (k: unknown): unknown => (k instanceof Keyword ? k.toString() : k);

function containerGet(c: unknown, k: unknown): unknown {
  if (c instanceof PMap) return c.get(keyOf(k));
  if (c == null) return undefined;
  return (c as unknown[])[k as number];
}

function containerAssoc(c: unknown, k: unknown, v: unknown): unknown {
  if (c instanceof PMap) return c.assoc(keyOf(k), v);
  if (c == null) return pmap([[keyOf(k), v]]);
  return containerWrite(c, k, v);
}

function containerWrite(c: unknown, k: unknown, v: unknown): unknown {
  if (Array.isArray(c)) {
    const out = [...(c as unknown[])];
    out[k as number] = v;
    return out;
  }
  return { ...(c as Record<PropertyKey, unknown>), [k as PropertyKey]: v };
}

function hostToArray(x: unknown): unknown[] {
  if (x == null) return [];
  if (Array.isArray(x)) return [...x];
  return Array.from(x as Iterable<unknown>);
}

/** CLJS-flavored DataOps: native CLJS data and keywords straight in, no conversion. */
export const cljsOps: DataOps = {
  get: containerGet,
  assoc: containerAssoc,
  dissoc: (c, k) => (c instanceof PMap ? c.dissoc(keyOf(k)) : (c as unknown[]).filter((_, i) => i !== (k as number))),
  toArray: hostToArray,
  tag: (x) => (x instanceof Keyword ? x.toString() : x),
};

/** Read a CLJS-shaped state out to plain JS (a test-side printer, not a
 * library conversion). */
export function toJs(v: unknown): unknown {
  if (v instanceof PMap) return pmapToJs(v);
  if (Array.isArray(v)) return v.map(toJs);
  return v;
}

function pmapToJs(m: PMap): Record<string, unknown> {
  return Object.fromEntries(m.entries().map(([k, v]) => [String(k), toJs(v)]));
}

export const not = (x: unknown): boolean => !x;

/** The active filter — a shared named predicate, like the corpus's
 * filter-fns table, so two independently built apps compare deep-equal. */
export const activePred = (t: unknown): boolean => !(t as Record<string, unknown>)["complete?"];

/** A structural view shape: function slots become markers so two
 * independently built views can be compared deep-equal. */
export function shape(v: unknown): unknown {
  if (typeof v === "function") return "ƒ";
  if (Array.isArray(v)) return v.map(shape);
  return shapeObject(v);
}

function shapeObject(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shape(x)]));
}

// ---------------------------------------------------------------------------
// plain-data checking (plain_data_api): a plain value is a
// string/number/boolean/null/undefined, a function, an array of plain
// values, or an object with Object.prototype, no accessors and no
// non-registered symbols.
// ---------------------------------------------------------------------------

const PLAIN_TYPES: ReadonlySet<string> = new Set(["string", "number", "boolean", "function"]);

function isPlainValue(v: unknown): boolean {
  return v === null || v === undefined || PLAIN_TYPES.has(typeof v);
}

export function isPlain(v: unknown): boolean {
  if (isPlainValue(v)) return true;
  if (Array.isArray(v)) return (v as unknown[]).every(isPlain);
  return isPlainObject(v);
}

function isForeignObject(o: unknown): boolean {
  return o === null || typeof o !== "object" || Object.getPrototypeOf(o) !== Object.prototype;
}

function isPlainObject(o: unknown): boolean {
  if (isForeignObject(o)) return false;
  return Reflect.ownKeys(o as object).every((key) => isPlainKey(o as object, key));
}

function isForeignSymbol(key: PropertyKey): boolean {
  if (typeof key !== "symbol") return false;
  return Symbol.keyFor(key) === undefined;
}

function isAccessor(d: PropertyDescriptor | undefined): boolean {
  return d === undefined || d.get !== undefined || d.set !== undefined;
}

function isPlainKey(o: object, key: PropertyKey): boolean {
  if (isForeignSymbol(key)) return false;
  const d = Object.getOwnPropertyDescriptor(o, key);
  if (isAccessor(d)) return false;
  return isPlain((d as PropertyDescriptor).value);
}

function isContainer(v: unknown): boolean {
  return v !== null && typeof v === "object";
}

function descendants(v: unknown): unknown[] {
  if (Array.isArray(v)) return [...(v as unknown[])];
  if (isContainer(v)) return Object.values(v as Record<string, unknown>);
  return [];
}

/** Does the value carry a function anywhere (effects with an update fn do)? */
export function hasFunction(v: unknown): boolean {
  if (typeof v === "function") return true;
  return descendants(v).some(hasFunction);
}

/** Call a view's handler slot: handlers are opaque, the caller only
 * invokes them and collects the emitted batch. */
export function fire(slot: unknown): unknown[] {
  return (slot as () => unknown[])();
}

/** The checkbox slot of a todo row, read through its quoted key. */
export function checkboxOf(row: Record<string, unknown> | undefined): Record<string, unknown> {
  return row?.["checkbox"] as Record<string, unknown>;
}

/** The path carried by the first effect of an emitted batch. */
export function effectPath(batch: unknown): Path {
  return ((batch as unknown[])[0] as unknown[])[1] as Path;
}
