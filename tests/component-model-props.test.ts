// Purpose: executable contract tests for the component-model spec's
//   prop-derivation rows — declaration arity, prop/path counterparts,
//   implicit keys, path resolution, the as binding and literal calls.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/component-model.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text)
//   and cites the defui_test.clj scenario it ports. No vacuous
//   predicates: every check encodes its row's stated behavior.
//   tambor-272 splits the former monolithic tests/component-model.test.ts
//   into topic files; shared helpers live in tests/helpers/component-model.ts.

import { expect, it } from "vitest";
import fc from "fast-check";

import { call, defineComponent, type Props } from "../src/model/component.ts";
import { select, type Path } from "../src/effects/paths.ts";
import { propsBody, renderOf } from "./helpers/component-model.ts";

// prop keys that never collide with the implicit keys
const keyArb = fc
  .string({ minLength: 1, maxLength: 8 })
  .filter((s) => /^[A-Za-z][A-Za-z0-9]*$/.test(s) && s !== "extra" && s !== "context");

// p_single_arg — derives_from: component.model.single_map_arg
// generator: two-parameter and zero-parameter declarations
// predicate: both are rejected
it("p_single_arg: both are rejected", () => {
  // zero parameters
  expect(() => defineComponent("zero", [], propsBody)).toThrow();
  // two parameters
  expect(() =>
    defineComponent("two", [{ keys: ["a"] }, { keys: ["b"] }], propsBody),
  ).toThrow();
  // anything else (neither a symbol nor a map pattern) is rejected too
  expect(() => defineComponent("junk", [42 as never], propsBody)).toThrow();

  // the accepted forms: exactly one parameter, a symbol or a map pattern
  expect(() => defineComponent("sym-ok", ["m"], propsBody)).not.toThrow();
  expect(() => defineComponent("map-ok", [{ keys: ["a"] }], propsBody)).not.toThrow();
});

// p_prop_path — derives_from: component.model.prop_has_path
// generator: random prop sets
// predicate: every prop has a path counterpart
it("p_prop_path: every prop has a path counterpart", () => {
  fc.assert(
    fc.property(fc.uniqueArray(keyArb, { maxLength: 5 }), (keys) => {
      const comp = defineComponent("prop-path", [{ keys }], propsBody);
      const props = renderOf(call(comp, {}));
      for (const k of keys) {
        // the component receives both p and dollar p
        expect(k in props).toBe(true);
        expect(("$" + k) in props).toBe(true);
        // the dollar counterpart is a path (an array of steps)
        expect(Array.isArray(props["$"+k])).toBe(true);
      }
    }),
  );
});

// p_implicit — derives_from: component.model.implicit_extra_context
// generator: a component that declares neither
// predicate: extra, context and their paths are present
it("p_implicit: extra, context and their paths are present", () => {
  const comp = defineComponent("implicit", [{ keys: ["a"] }], propsBody);
  const props = renderOf(call(comp, { a: 1 }));
  expect("extra" in props).toBe(true);
  expect("$extra" in props).toBe(true);
  expect("context" in props).toBe(true);
  expect("$context" in props).toBe(true);
  // the implicit keys carry paths too (an array of steps)
  expect(Array.isArray(props.$extra)).toBe(true);
  expect(Array.isArray(props.$context)).toBe(true);
});

// p_path_get — derives_from: component.model.path_resolves
// generator: random state and paths
// predicate: select equals the prop value
it("p_path_get: select equals the prop value", () => {
  const comp = defineComponent("path-get", [{ keys: ["v"] }], propsBody);
  fc.assert(
    fc.property(
      fc.dictionary(keyArb, fc.dictionary(keyArb, fc.oneof(fc.integer(), fc.string()), {
        minKeys: 1,
        maxKeys: 3,
      }), { minKeys: 1, maxKeys: 3 }),
      (state) => {
        const outerKeys = Object.keys(state);
        const k1 = outerKeys[0] as string;
        const inner = state[k1] as Record<string, unknown>;
        const k2 = Object.keys(inner)[0] as string;
        const value = inner[k2];
        const path: Path = [
          ["keypath", k1],
          ["keypath", k2],
        ];
        const props = renderOf(call(comp, { v: value, $v: path }));
        // select(state, dollar p) deep-equals p at render time
        expect(select(state, props.$v as Path)).toEqual(value);
        expect(props.v).toEqual(value);
      },
    ),
  );
});

// p_as_map — derives_from: component.model.as_binding_whole_map
// generator: child called with b 42
// predicate: the as map contains a 42, b 42 and extra
it("p_as_map: the as map contains a 42, b 42 and extra", () => {
  const asChild = defineComponent(
    "as-child",
    [{ keys: ["a", "b"], defaults: { a: 42 }, as: "m" }],
    propsBody,
  );
  const props = renderOf(call(asChild, { b: 42 }));
  const m = props.m as Props;
  // the as name is bound to the complete props map including the
  // filled-in default
  expect(m.a).toBe(42);
  expect(m.b).toBe(42);
  expect("extra" in m).toBe(true);
});

// p_literal_call — derives_from: component.model.literal_call_paths
// generator: literal map with explicit dollar key
// predicate: the explicit path wins
it("p_literal_call: the explicit path wins", () => {
  const litComp = defineComponent("lit-comp", [{ keys: ["a", "b"] }], propsBody);
  const written: Path = [
    ["keypath", "x"],
    ["keypath", "a"],
  ];
  const explicit = renderOf(call(litComp, { a: 12, $a: written }));
  // the explicit dollar key is the path the component receives
  expect(explicit.$a).toEqual(written);
  expect(explicit.a).toBe(12);
  // without the explicit key the path falls back to the scratch, so the
  // explicit one is what wins
  const implicit = renderOf(call(litComp, { a: 12 }));
  expect(implicit.$a).not.toEqual(written);
});