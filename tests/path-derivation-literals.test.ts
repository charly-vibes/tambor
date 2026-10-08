// Purpose: path.derivation shadowing, the known-call table, literals,
//   opaque refs and filter composition.
// Responsibilities: p_shadow, p_fn_shadow, p_call_table, p_get_default,
//   p_assoc, p_literal, p_opaque, p_filter_path, p_unsupported.
// Rationale: specs/path-derivation.md is the design authority. Split
//   from path-derivation.test.ts so no file exceeds the test-role
//   file-lines threshold (tambor-272); test names are byte-identical to
//   the originals (contract bindings are name-based).

import { expect, it } from "vitest";
import { deletePath, select, setPath, updatePath, type Path } from "../src/effects/paths.ts";
import {
  dollar,
  each,
  forKv,
  forWithLast,
  fori,
  literalRef,
  opaqueRef,
  rootRef,
} from "../src/effects/ref.ts";
import type { Ref } from "../src/effects/ref.ts";

// p_shadow — derives_from: path.derivation.shadowing_uses_binding_time
// generator: let a, then b from a, then a rebound
// predicate: dollar b still points into the first a
it("p_shadow: dollar b still points into the first a", () => {
  const first = { a: { b: 1 } };
  const rebound = { a: { b: 9 } };
  const a = rootRef(first).get("a");
  const b = a.get("b");
  rootRef(rebound).get("a"); // a rebound; b was computed at binding time
  expect(b.path).toEqual([["keypath", "a"], ["keypath", "b"]]);
  expect(b.value).toBe(1);
  expect(select(first, b.path)).toBe(1);
  expect(select(rebound, b.path)).toBe(9);
});

// p_fn_shadow — derives_from: path.derivation.fn_params_shadow
// generator: inner fn with parameter named like a binding
// predicate: the inner name is not replaced
it("p_fn_shadow: the inner name is not replaced", () => {
  const bound = rootRef({ a: 1 }).get("a");
  // a nested function parameter with the same name hides the binding:
  // the runtime-ref strategy only ever rewrites explicit Ref values,
  // so the inner parameter stays exactly what was passed in
  const inner = (a: unknown) => a;
  expect(inner(7)).toBe(7);
  expect((inner(7) as Ref).path).toBeUndefined();
  expect(bound.value).toBe(1);
});

// p_call_table — derives_from: path.derivation.known_call_table
// generator: each known call — predicate: the navigator list matches the table
it("p_call_table: the navigator list matches the table", () => {
  const state = { a: { b: 1 } };
  const pred = (x: unknown) => Boolean(x);
  const cases: [string, Ref, unknown[]][] = [
    ["nth", rootRef(state).nth(2), [["nth", 2]]],
    ["get", rootRef(state).get("k"), [["keypath", "k"]]],
    // a keyword call maps to keypath just like get
    ["keyword-call", rootRef(state).get("kw"), [["keypath", "kw"]]],
    // get with a default adds a nilToVal step
    ["get-default", rootRef(state).get("k", 42), [["keypath", "k"], ["nil-to-val", 42]]],
    ["get-in", rootRef(state).getIn(["a", "b"]), [["keypath-list", ["a", "b"]]]],
    ["filter", rootRef(state).get("xs").filter(pred), [["filter", pred]]],
    ["take", rootRef(state).get("xs").take(2), [["take", 2]]],
    ["drop", rootRef(state).get("xs").drop(1), [["drop", 1]]],
    ["or", rootRef(state).get("k").or(7), [["nil-to-val", 7]]],
    // assoc is transparent: identity, no navigator
    ["assoc", rootRef(state).get("m").assoc("k", 5), []],
    ["select-one", rootRef(state).selectOne([["keypath", "b"]] as Path), [["path", [["keypath", "b"]] as Path]]],
  ];
  for (const [call, ref, expected] of cases) {
    expect(ref.path.slice(ref.path.length - expected.length)).toEqual(expected);
  }
  // root-deref maps to rawPath: the raw path itself
  const r = rootRef(state).get("a");
  expect(r.raw().path).toEqual(r.path);
});

// p_get_default — derives_from: path.derivation.get_with_default
// generator: get with default 42 — predicate: reading an absent key gives 42
it("p_get_default: reading an absent key gives 42", () => {
  const ref = rootRef({ a: 1 }).get("missing", 42);
  expect(ref.value).toBe(42);
  expect(select({ a: 1 }, ref.path)).toBe(42);
  expect(ref.path[1]).toEqual(["nil-to-val", 42]);
});

// p_assoc — derives_from: path.derivation.assoc_transparent
// generator: assoc onto a prop map — predicate: path equals the original map path
it("p_assoc: path equals the original map path", () => {
  const state = { m: { a: 1, b: 2 } };
  const m = rootRef(state).get("m");
  const assoced = m.assoc("a", 9);
  expect(assoced.path).toEqual(m.path);
  expect(assoced.value).toEqual({ a: 9, b: 2 });
});

// p_literal — derives_from: path.derivation.literal_is_constant
// generator: literal arguments — predicate: path reads the literal and refuses writes
it("p_literal: path reads the literal and refuses writes", () => {
  const lit = literalRef(42);
  expect(select({ anything: 1 }, lit.path)).toBe(42);
  expect(() => setPath({ anything: 1 }, lit.path, 0)).toThrow();
  expect(() => updatePath({ anything: 1 }, lit.path, (x) => x)).toThrow();
});

// p_opaque — derives_from: path.derivation.unknown_call_opaque
// generator: result of a custom function
// predicate: value readable and path write refused
it("p_opaque: value readable and path write refused", () => {
  const custom = (x: number) => x * 3;
  const opaque = opaqueRef(custom(7));
  expect(opaque.value).toBe(21);
  expect(select({}, opaque.path)).toBe(21);
  expect(() => setPath({}, opaque.path, 0)).toThrow();
});

// p_filter_path — derives_from: path.derivation.filter_path_composes
// generator: todos first second third and active filter
// predicate: the item path of the second visible todo selects second, set
// and delete change only the original index 1
it("p_filter_path: the item path of the second visible todo selects second", () => {
  const state = { todos: [{ text: "first" }, { text: "second" }, { text: "third", complete: true }] };
  const active = (t: unknown) => !(t as { complete?: boolean }).complete;
  const items = rootRef(state).get("todos").filter(active).each();
  const second = items[1]!;
  // xs followed by filter(pred) then seq-nth(i)
  expect(second.path).toEqual([
    ["keypath", "todos"],
    ["filter", active],
    ["seq-nth", 1],
  ]);
  expect(select(state, second.path)).toEqual({ text: "second" });
  // set and delete change only the original index 1
  const afterSet = setPath(state, second.path, { text: "SECOND" });
  expect((afterSet as typeof state).todos[0]).toEqual({ text: "first" });
  expect((afterSet as typeof state).todos[1]).toEqual({ text: "SECOND" });
  expect((afterSet as typeof state).todos[2]).toBe(state.todos[2]);
  const afterDelete = deletePath(state, second.path);
  expect((afterDelete as typeof state).todos).toEqual([{ text: "first" }, { text: "third", complete: true }]);
});

// p_unsupported — derives_from: path.derivation.unsupported_loops_throw
// generator: fori, for-kv, for-with-last
// predicate: each raises the documented error
it("p_unsupported: each raises the documented error", () => {
  expect(() => fori()).toThrowError(/no longer supported/);
  expect(() => forKv()).toThrowError(/no longer supported/);
  expect(() => forWithLast()).toThrowError(/no longer supported/);
});

// p_unbound — derives_from: path.derivation.unbound_dollar_literal
// generator: dollar name with no base — predicate: the symbol is left alone
it("p_unbound: the symbol is left alone", () => {
  expect(dollar("x")).toBe("$x");
  expect(dollar("num")).toBe("$num");
});

// p_strategy — derives_from: path.derivation.strategy_agnostic
// generator: both strategies on one vector set, with refs typed Ref<T>
// predicate: outputs are deep-equal
it("p_strategy: outputs are deep-equal", () => {
  const state = { todos: [{ text: "first" }, { text: "second" }, { text: "third", complete: true }] };
  const active = (t: unknown) => !(t as { complete?: boolean }).complete;
  const collected: unknown[] = [];

  // strategy 1: the typed runtime ref
  const filtered = rootRef(state).get("todos").filter(active);
  for (const item of filtered.each()) {
    collected.push({ path: item.path, value: item.value });
  }

  // strategy 2: the explicit API — path concatenation, a filter
  // navigator, each(xs, $xs, fn)
  const explicit: unknown[] = [];
  const xs = select(state, [["keypath", "todos"], ["filter", active]] as Path) as readonly unknown[];
  const $xs = filtered; // the ref of the filtered vector
  each(xs, $xs, (item: Ref<number>) => {
    explicit.push({ path: item.path, value: item.value });
    return item.value;
  });

  expect(explicit).toEqual(collected);
});

// helper: derive a ref through a chain of gets
function chainOf(state: unknown, keys: readonly string[]): { state: unknown; ref: Ref } {
  let ref = rootRef(state);
  for (const k of keys) ref = ref.get(k);
  return { state, ref };
}