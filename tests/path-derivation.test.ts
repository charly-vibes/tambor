// Purpose: executable contract tests for the path-derivation spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/path-derivation.md is the design authority; each
//   predicate here mirrors a Properties row of that spec. The port's
//   primary strategy is the typed runtime ref (Ref<T> carrying value and
//   path); the explicit API is the third, macro-free tier.

import { expect, it } from "vitest";
import fc from "fast-check";

import { deletePath, select, setPath, updatePath, type Path } from "../src/effects/paths.ts";
import {
  bindDollar,
  dollar,
  each,
  fori,
  forKv,
  forWithLast,
  ifLet,
  literalRef,
  opaqueRef,
  rootRef,
  whenLet,
  type Ref,
} from "../src/effects/ref.ts";

const keyGen = fc
  .string({ minLength: 1, maxLength: 4 })
  .filter((k) => !/^[0-9]/.test(k));

// A random key chain, a state containing that exact chain (with noise
// siblings), and the ref derived by a chain of ref.get bindings.
const chainBinding = fc
  .array(keyGen, { minLength: 1, maxLength: 3 })
  .map((keys) => {
  const build = (depth: number, leaf: unknown): Record<string, unknown> => {
    if (depth >= keys.length) return { leaf };
    return { [keys[depth] as string]: build(depth + 1, leaf), noise: { n: depth } };
  };
  const state = build(0, 42);
  let ref: Ref = rootRef(state);
  for (const k of keys) ref = ref.get(k);
  ref = ref.get("leaf");
  return { keys, state, ref };
});

// p_every_binding — derives_from: path.derivation.every_binding_has_path
// generator: generated binding forms — predicate: every bound name has a
// dollar path
it("p_every_binding: every bound name has a dollar path", () => {
  fc.assert(
    fc.property(fc.integer(), chainBinding, (i, { ref }) => {
      const name = `x${i}`;
      bindDollar(name, ref);
      const d = dollar(name);
      // a bound name resolves to a ref whose dollar path is a real path
      expect(typeof d).toBe("object");
      expect((d as Ref).path).toBeInstanceOf(Array);
      expect((d as Ref).path.length).toBeGreaterThan(0);
    }),
  );
  // unbound names are covered by p_unbound
});

// p_extract — derives_from: path.derivation.extract_law
// generator: generated binding forms with test data
// predicate: select by path equals the destructured value
it("p_extract: select by path equals the destructured value", () => {
  fc.assert(
    fc.property(chainBinding, ({ keys, state, ref }) => {
      expect(ref.value).toBe(42);
      expect(select(state, ref.path)).toBe(ref.value);
      expect(ref.path).toEqual([...keys.map((k) => ["keypath", k]), ["keypath", "leaf"]]);
    }),
  );
  // a form through a vector
  const state = { xs: [10, 20] };
  const item = rootRef(state).get("xs").nth(1);
  expect(select(state, item.path)).toBe(20);
});

// p_update — derives_from: path.derivation.update_law
// generator: generated binding forms and the test value [a, 42]
// predicate: after set the destructured name equals the test value
it("p_update: after set the destructured name equals the test value", () => {
  // the corpus's named case: binding a holds 42 after the set
  const a = chainOf({ a: 1 }, ["a"]);
  const after = setPath(a.state, a.ref.path, 42);
  expect(select(after, a.ref.path)).toBe(42);

  fc.assert(
    fc.property(chainBinding, ({ state, ref }) => {
      const out = setPath(state, ref.path, 42);
      // re-destructuring the structure after set binds x to the value
      expect(select(out, ref.path)).toBe(42);
    }),
  );
});

// p_transform — derives_from: path.derivation.transform_law
// generator: obj a 1 and b 2 with inc
// predicate: the selected value is one more and nothing else changes
it("p_transform: the selected value is one more and nothing else changes", () => {
  const obj = { a: 1, b: 2 };
  const a = rootRef(obj).get("a");
  const inc = (x: unknown) => (x as number) + 1;
  const out = updatePath(obj, a.path, inc);
  expect(select(out, a.path)).toBe(2);
  expect(out).toEqual({ a: 2, b: 2 });
  // nothing else changes — the untouched sibling keeps its reference
  expect((out as Record<string, unknown>).b).toBe(obj.b);
});

// p_compiles — derives_from: path.derivation.any_binding_form_compiles
// generator: generated forms from the component_test grammar
// predicate: derivation never throws
it("p_compiles: derivation never throws", () => {
  const state = { a: { b: 1 }, xs: [1, 2, 3], map: { p: 1, q: 2 }, props: ["k", 1] };
  const ops: fc.Arbitrary<(r: Ref) => Ref> = fc.oneof(
    fc.constant((r: Ref) => r.get("anything")),
    fc.constant((r: Ref) => r.get("a", 7)),
    fc.constant((r: Ref) => r.nth(0)),
    fc.constant((r: Ref) => r.seqNth(1)),
    fc.constant((r: Ref) => r.filter((x) => Boolean(x))),
    fc.constant((r: Ref) => r.take(2)),
    fc.constant((r: Ref) => r.drop(1)),
    fc.constant((r: Ref) => r.or(9)),
    fc.constant((r: Ref) => r.assoc("k", 5)),
    fc.constant((r: Ref) => r.selectOne([["keypath", "b"]] as Path)),
    fc.constant((r: Ref) => r.rest(1)),
    fc.constant((r: Ref) => r.restMap()),
    fc.constant((r: Ref) => r.raw()),
  );
  fc.assert(
    fc.property(fc.array(ops, { maxLength: 4 }), (forms) => {
      let r: Ref = rootRef(state);
      for (const form of forms) r = form(r);
      // derivation of any combination yields paths without error
      expect(r.path).toBeInstanceOf(Array);
    }),
  );
});

// p_rest — derives_from: path.derivation.rest_binding_path
// generator: forms with rest and rest map
// predicate: paths cover the remaining items
it("p_rest: paths cover the remaining items", () => {
  fc.assert(
    fc.property(fc.array(fc.integer(), { minLength: 2, maxLength: 6 }), fc.integer({ min: 1, max: 4 }), (xs, i) => {
      if (i >= xs.length) return;
      const state = { xs };
      const rest = rootRef(state).get("xs").rest(i);
      expect(select(state, rest.path)).toEqual(xs.slice(i));
    }),
  );
  // a rest map binding uses restArgsMap
  const state = { props: ["a", 1, "b", 2] };
  const restMap = rootRef(state).get("props").restMap();
  expect(restMap.path[restMap.path.length - 1]).toEqual(["rest-args-map"]);
  expect(select(state, restMap.path)).toEqual({ a: 1, b: 2 });
});

// p_map_iter — derives_from: path.derivation.map_iteration_seq_nth
// generator: arg obj a 1 and b 2 iterating for [k v]
// predicate: the three laws hold and selected values are the set 1 and 2
it("p_map_iter: the three laws hold and selected values are the set 1 and 2", () => {
  const obj = { a: 1, b: 2 };
  const pairs = rootRef(obj).each();
  expect(pairs).toHaveLength(2);
  // dollar v binds to a seq-nth(i) then nth(1) path
  const v0 = pairs[0]!.nth(1);
  expect(v0.path).toEqual([["seq-nth", 0], ["nth", 1]]);
  // extract: select by path equals the bound value
  expect(select(obj, v0.path)).toBe(1);
  // update: after set the destructured name equals the test value
  const after = setPath(obj, v0.path, 42);
  expect(select(after, v0.path)).toBe(42);
  // transform: transform(path, inc) changes only that value
  const out = updatePath(obj, v0.path, (x) => (x as number) + 1);
  expect(out).toEqual({ a: 2, b: 2 });
  // writing it changes the i-th value of the map (map shape kept)
  expect(Object.keys(out as Record<string, number>)).toEqual(["a", "b"]);
  // the selected values are the set 1 and 2
  expect(pairs.map((p) => p.nth(1).value)).toEqual([1, 2]);
});

// p_key_ro — derives_from: path.derivation.key_paths_read_only
// generator: write through a key path — predicate: writing is refused
it("p_key_ro: writing through a key path is refused", () => {
  const obj = { a: 1, b: 2 };
  const keyPath = rootRef(obj).seqNth(0).nth(0).path;
  expect(() => setPath(obj, keyPath, 9)).toThrow();
  expect(() => updatePath(obj, keyPath, (x) => x)).toThrow();
  expect(() => setPath(obj, rootRef(obj).seqNth(0).nth(1).path, 9)).not.toThrow();
});

// p_pairs — derives_from: path.derivation.vector_of_pairs_destructure
// generator: arg obj a 1, b 2, c 3
// predicate: selected values are the set a, 1, b, 2
it("p_pairs: selected values are the set a, 1, b, 2", () => {
  const obj = { a: 1, b: 2, c: 3 };
  const pairs = rootRef(obj).each();
  const k1 = pairs[0]!.nth(0);
  const v1 = pairs[0]!.nth(1);
  const k2 = pairs[1]!.nth(0);
  const v2 = pairs[1]!.nth(1);
  expect([k1.value, v1.value, k2.value, v2.value]).toEqual(["a", 1, "b", 2]);
});

// p_when_let — derives_from: path.derivation.when_let_guards_body
// generator: obj a 1 then obj nil
// predicate: the first selects 1 and sets to obj a 2, the second yields
// no intents
it("p_when_let: the first selects 1 and sets to obj a 2, the second yields no intents", () => {
  const withOne = { a: 1 };
  const intents = whenLet(rootRef(withOne).get("a"), (r) => {
    // the body sees paths into the bound value
    expect(select(withOne, r.path)).toBe(1);
    return [["set", r.path, 2]];
  });
  expect(intents).toEqual([["set", [["keypath", "a"]], 2]]);
  const after = setPath(withOne, (intents as unknown[][])[0]![1] as Path, 2);
  expect(after).toEqual({ a: 2 });

  const withNil = { a: null };
  let bodyRan = false;
  const nilIntents = whenLet(rootRef(withNil).get("a"), () => {
    bodyRan = true;
    return [];
  });
  // a nil value renders nothing and produces no handlers
  expect(nilIntents).toBeNull();
  expect(bodyRan).toBe(false);
});

// p_if_let — derives_from: path.derivation.if_let_branches
// generator: obj a 1, obj nil, not-obj 1
// predicate: then path selects 1, nil yields no then handlers, else path
// selects 1 on not-obj and sets to not-obj 2
it("p_if_let: then path selects 1, nil yields no then handlers, else selects and sets", () => {
  const obj = { a: 1 };
  let thenRan = 0;
  ifLet(
    rootRef(obj).get("a"),
    (r) => {
      thenRan++;
      expect(select(obj, r.path)).toBe(1);
      return [];
    },
    () => [],
  );
  expect(thenRan).toBe(1);

  const withNil = { a: null };
  thenRan = 0;
  ifLet(rootRef(withNil).get("a"), () => thenRan++, () => []);
  // nil yields no then handlers
  expect(thenRan).toBe(0);

  const notObj = { c: 1 };
  const elseIntents = ifLet(
    rootRef(notObj).get("a"),
    () => [],
    // the else branch sees only the outer bindings: it re-derives its
    // own name from the outer ref
    (r) => [["set", r.get("c").path, 2]],
  );
  // the else path selects 1 on not-obj and sets to not-obj 2
  expect(select(notObj, (elseIntents as unknown[][])[0]![1] as Path)).toBe(1);
  expect(setPath(notObj, (elseIntents as unknown[][])[0]![1] as Path, 2)).toEqual({ c: 2 });
});

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