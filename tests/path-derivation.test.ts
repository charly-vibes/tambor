// Purpose: executable contract tests for the path-derivation spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/path-derivation.md is the design authority; each
//   predicate here mirrors a Properties row of that spec. The port's
//   primary strategy is the typed runtime ref (Ref<T> carrying value and
//   path); the explicit API is the third, macro-free tier.

// Purpose: path.derivation laws — the binding/extract/update/transform
//   round-trips over generated key chains.
// Responsibilities: p_every_binding, p_extract, p_update, p_transform,
//   p_compiles, p_rest, p_map_iter, p_key_ro, p_pairs, p_when_let,
//   p_if_let.
// Rationale: specs/path-derivation.md is the design authority. Split
//   from path-derivation.test.ts so no file exceeds the test-role
//   file-lines threshold (tambor-272); test names are byte-identical to
//   the originals (contract bindings are name-based).

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

// helper: derive a ref through a chain of gets
function chainOf(state: unknown, keys: readonly string[]): { state: unknown; ref: Ref } {
  let ref = rootRef(state);
  for (const k of keys) ref = ref.get(k);
  return { state, ref };
}

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

