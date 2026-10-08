// Purpose: executable contract tests for the component-model spec — the
//   component/prop model every component builds on (the defui port).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/component-model.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text)
//   and cites the defui_test.clj scenario it ports. No vacuous
//   predicates: every check encodes its row's stated behavior.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  call,
  defineComponent,
  render,
  type ComponentCall,
  type Props,
} from "../src/model/component.ts";

// A props-like body: returns the props map as its render output so the
// tests can observe exactly what the component received (the corpus
// scenarios read the props through a data intent, e.g. [:data a b c m]).
const propsBody = (props: Props): unknown => props;

// Render a call and read back the body output as the props map.
function renderOf(c: ComponentCall): Props {
  return render(c) as Props;
}

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
