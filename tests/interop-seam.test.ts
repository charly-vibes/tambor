// Purpose: executable contract tests for the interop-model spec — the
//   seam tier: state operations and app binding routed through DataOps.
// Responsibilities: encode each converted row's generator and predicate as a
//   vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/interop-model/spec.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text). No vacuous
//   predicates: every check encodes its row's stated behavior. Host
//   stand-ins (Keyword, PMap, cljsOps) live in tests/helpers — they are
//   host-language data the library never inspects.

import { expect, it } from "vitest";
import fc from "fast-check";

import { interDispatch, makeRegistry, seamSelect, seamSet, seamUpdate } from "../src/interop/seam.ts";
import { makeOpsApp } from "../src/interop/app.ts";
import { jsOps, type DataOps } from "../src/interop/ops.ts";
import { cljsOps, kw, not, pmap, PMap } from "./helpers/interop-standins.ts";

// The Web performance clock, outside tsconfig's ES2022 lib (see the
// shared note in tests/helpers/interop-standins.ts).
declare const performance: { now(): number };

// ---------------------------------------------------------------------------
// p_punctuated — derives_from: interop.model.punctuated_keys
// generator: state with keys complete?, next-todo-text and dollar-num
// predicate: select, set and update work on each
// ---------------------------------------------------------------------------

it("p_punctuated: select, set and update work on each punctuated key", () => {
  const state = { "complete?": false, "next-todo-text": "", $num: 3 };
  const frozen = { ...state };
  const cases: Array<[string, unknown, (old: unknown) => unknown, unknown]> = [
    ["complete?", true, (old) => !old, true],
    ["next-todo-text", "hello", (old) => `${String(old)}!`, "!"],
    ["$num", 7, (old) => (old as number) + 1, 4],
  ];
  for (const [key, setTo, f, updated] of cases) {
    // a seam path is a plain key sequence — the host form of [:todos ...]
    const path: readonly unknown[] = [key];
    // select works
    expect(seamSelect(state, path)).toEqual(state[key as keyof typeof state]);
    // set works — the input is not mutated
    const afterSet = seamSet(state, path, setTo);
    expect(seamSelect(afterSet, path)).toBe(setTo);
    // update works
    const afterUpdate = seamUpdate(state, path, f);
    expect(seamSelect(afterUpdate, path)).toEqual(updated);
    expect(state).toEqual(frozen);
  }
});

// ---------------------------------------------------------------------------
// p_nil — derives_from: interop.model.nil_is_nullish
// generator: null, undefined and a missing key
// predicate: all three read as nil and select returns undefined for each
// ---------------------------------------------------------------------------

it("p_nil: null, undefined and a missing key all read as nil and select returns undefined for each", () => {
  const state = { a: null, b: undefined };
  for (const key of ["a", "b", "c"]) {
    const v = seamSelect(state, [key]);
    // select returns undefined for each
    expect(v).toBeUndefined();
    // all three read as nil — loose equality to null
    expect(v == null).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// p_functions — derives_from: interop.model.functions_opaque
// generator: an update function with rest parameters and one with default parameters
// predicate: both are called with the same arguments
// ---------------------------------------------------------------------------

it("p_functions: update functions with rest and with default parameters are called with the same arguments", () => {
  const state = { xs: [1, 2, 3] };
  const path: readonly unknown[] = ["xs"];
  const viaRest = (...args: unknown[]): unknown => {
    const [old, a, b] = args as [number[], number, number];
    return [...old, a + b];
  };
  const viaDefaults = (old: unknown, a = 10, b = 5): unknown => [...(old as number[]), (a as number) + (b as number)];
  // (the casts are the functions_opaque bridge: the seam calls but never
  // inspects the function, and TS cannot unify default-parameter shapes)
  const opaque = (f: unknown) => f as (old: unknown, ...args: unknown[]) => unknown;
  // both are called with the same arguments
  const r1 = seamUpdate(state, path, opaque(viaRest), 10, 5);
  const r2 = seamUpdate(state, path, opaque(viaDefaults), 10, 5);
  expect(r1).toEqual(r2);
  expect(seamSelect(r1, path)).toEqual([1, 2, 3, 15]);
  // behaviour never depends on function length: omitted args fall back
  const r3 = seamUpdate(state, path, opaque(viaDefaults));
  expect(seamSelect(r3, path)).toEqual([1, 2, 3, 15]);
});

// ---------------------------------------------------------------------------
// p_seam — derives_from: interop.model.data_ops_seam
// generator: persistent-collection ops over a 3-level state
// predicate: update at one path works and default ops are used when none are given
// ---------------------------------------------------------------------------

it("p_seam: persistent ops update one path of a 3-level state and default ops apply when none are given", () => {
  // persistent-collection ops over a 3-level state
  const state = pmap([
    ["todos", [pmap([["complete?", false]]), pmap([["complete?", true]])]],
    ["n", 1],
  ]);
  const path: readonly unknown[] = ["todos", 0, "complete?"];
  const out = interDispatch(state, [["update", path, not]], { ops: cljsOps });
  const todos = cljsOps.get(out, "todos") as unknown[];
  // update at one path works
  expect(cljsOps.get(todos[0], "complete?")).toBe(true);
  // and the branch that was not on the updated path is untouched
  expect(cljsOps.get(todos[1], "complete?")).toBe(true);

  // default ops are used when none are given
  const plain = { a: { b: { c: 1 } } };
  const out2 = interDispatch(plain, [["update", ["a", "b", "c"], (x: unknown) => (x as number) + 1]]);
  expect(out2).toEqual({ a: { b: { c: 2 } } });
});

// ---------------------------------------------------------------------------
// p_ops_bound — derives_from: interop.model.ops_bound_to_app
// generator: two apps with plain and persistent ops
// predicate: each behaves per its own ops
// ---------------------------------------------------------------------------

it("p_ops_bound: two apps with plain and persistent ops each behave per their own ops", () => {
  const plainApp = makeOpsApp({ state: { n: 1, todos: [{ "complete?": false }] }, ops: jsOps });
  const cljsApp = makeOpsApp({ state: pmap([["n", 1], ["todos", [pmap([["complete?", false]])]]]), ops: cljsOps });
  // each behaves per its own ops — string tags for the plain app...
  plainApp.dispatch([["update", ["n"], (x: unknown) => (x as number) + 1]]);
  // ...keyword tags and keyword keys for the persistent app
  cljsApp.dispatch([[kw(null, "update"), [kw(null, "n")], (x: unknown) => (x as number) + 1]]);
  const plainState = plainApp.getState() as { n: number; todos: unknown[] };
  expect(plainState.n).toBe(2);
  expect(plainState.todos).toEqual([{ "complete?": false }]);
  const cljsState = cljsApp.getState();
  expect(cljsState).toBeInstanceOf(PMap);
  expect(cljsOps.get(cljsState, "n")).toBe(2);
  // passed down internally, never module-global: neither app saw the other's ops
  expect(cljsOps.get(cljsOps.get(cljsState, "todos"), 0)).toBeInstanceOf(PMap);
  expect(plainState.todos[0]).toEqual({ "complete?": false });
});

// ---------------------------------------------------------------------------
// p_identity — derives_from: interop.model.seam_keeps_identity
// generator: 5000 todos and an update to index 2
// predicate: todo 3 is reference-equal before and after and the input is unchanged
// ---------------------------------------------------------------------------

it("p_identity: with custom ops todo 3 is reference-equal before and after and the input is unchanged", () => {
  const todos: PMap[] = Array.from({ length: 5000 }, (_, i) =>
    pmap([
      ["description", `t${i}`],
      ["complete?", false],
    ]),
  );
  const state = pmap([["todos", todos]]);
  const before3 = cljsOps.get(cljsOps.get(state, "todos"), 3);
  const out = interDispatch(
    state,
    [["update", ["todos", 2, "complete?"], not]],
    { ops: cljsOps },
  );
  const after3 = cljsOps.get(cljsOps.get(out, "todos"), 3);
  // todo 3 is reference-equal before and after
  expect(after3).toBe(before3);
  // the input is unchanged
  const originalTodo2 = cljsOps.get(cljsOps.get(cljsOps.get(state, "todos"), 2), "complete?");
  expect(originalTodo2).toBe(false);
});

// ---------------------------------------------------------------------------
// p_no_conversion — derives_from: interop.model.no_boundary_conversion
// generator: 1000 dispatches on 5000 todos with custom ops
// predicate: total time is under 1000 ms and no conversion function is called
// ---------------------------------------------------------------------------

it("p_no_conversion: 1000 dispatches on 5000 todos with custom ops stay under 1000 ms and never convert", () => {
  const todos = Array.from({ length: 5000 }, (_, i) => ({ description: `t${i}`, "complete?": false }));
  let state: unknown = { todos, n: 1 };
  let gets = 0;
  let assocs = 0;
  // custom ops that count every seam call — a boundary conversion would
  // traverse the whole state, which is thousands of gets per dispatch
  const counted: DataOps = {
    get: (c, k) => {
      gets++;
      return jsOps.get(c, k);
    },
    assoc: (c, k, v) => {
      assocs++;
      return jsOps.assoc(c, k, v);
    },
    // (the cast: jsOps.dissoc's optional type reads back possibly-undefined
    // under exactOptionalPropertyTypes; the default ops always define it)
    dissoc: jsOps.dissoc as (container: unknown, key: unknown) => unknown,
    toArray: jsOps.toArray,
    tag: jsOps.tag,
  };
  const path: readonly unknown[] = ["todos", 7, "complete?"];
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    state = interDispatch(state, [["update", path, not]], { ops: counted });
  }
  const ms = performance.now() - t0;
  // total time is under 1000 ms
  expect(ms).toBeLessThan(1000);
  // no conversion function is called: only the updated path is touched
  expect(gets / 1000).toBeLessThan(10);
  expect(assocs / 1000).toBeLessThan(5);
});
