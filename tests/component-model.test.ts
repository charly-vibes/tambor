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
import { select, type Path } from "../src/effects/paths.ts";
import { on, spacer } from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import type { EventElem } from "../src/events/bubble.ts";

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

// The defui_test child/parent pair, ported: child has props a, b, c
// with a defaulting to 42 and c contextual; parent calls (child m) with
// a non-literal map. The mouse-down handler reports [[:data a b c m]].
const child = defineComponent(
  "child",
  [{ keys: ["a", "b", { key: "c", contextual: true }], defaults: { a: 42 }, as: "m" }],
  (props) => {
    const m = props.m as Props;
    return on("mouse-down", () => [["data", props.a, props.b, props.c, m]], spacer(10, 10));
  },
);
const parent = defineComponent("parent", [{ keys: ["m"] }], (props) =>
  call(child, props.m as Record<string, unknown>, {
    $m: props.$m as Path,
    extra: props.extra,
    $extra: props.$extra as Path,
    context: props.context,
    $context: props.$context as Path,
  }),
);

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

// p_defaults — derives_from: component.model.defaults_applied
// generator: child with a defaulting to 42 and parent m empty
// predicate: mouse-down returns data with a equal 42 and b nil
it("p_defaults: mouse-down returns data with a equal 42 and b nil", () => {
  const top = call(parent, {
    m: {},
    context: { focus: 42 },
    $context: [["keypath", "foo"]],
  });
  const intents = dispatch(render(top) as EventElem, mouseDown([0, 0]));
  expect(intents.length).toBe(1);
  const intent = intents[0] as readonly unknown[];
  expect(intent[0]).toBe("data");
  // a equals 42 (the declared default), b and c are nil
  expect(intent[1]).toBe(42);
  expect(intent[2]).toBeUndefined();
  expect(intent[3]).toBeUndefined();

  // the defaulted prop's path carries a nil-to-val step, so a nil or
  // absent location reads as the default once the scratch container
  // exists (defaults_applied, path_resolves)
  const m = intent[4] as Props;
  const steps = m.$a as readonly unknown[];
  expect(steps.some((s) => Array.isArray(s) && s[0] === "nil-to-val")).toBe(true);
  // and b, with no default, stays nil while its own path has no such step
  expect((m.$b as readonly unknown[]).some((s) => Array.isArray(s) && s[0] === "nil-to-val")).toBe(
    false,
  );
});

// p_contextual — derives_from: component.model.contextual_source
// generator: context focus 42 with parent m empty
// predicate: c is nil because context has no c, and with context c 13
//   it reads 13 with path context then c
it("p_contextual: c is nil without context c, and reads 13 with path context then c", () => {
  // context focus 42: c is nil because context has no c
  const without = call(parent, {
    m: {},
    context: { focus: 42 },
    $context: [["keypath", "foo"]],
  });
  const intents = dispatch(render(without) as EventElem, mouseDown([0, 0]));
  const m1 = (intents[0] as readonly unknown[])[4] as Props;
  expect(m1.c).toBeUndefined();
  // the contextual path is the context path plus keypath c
  expect(m1.$c).toEqual([["keypath", "foo"], ["keypath", "c"]]);

  // with context c 13 it reads 13 with path context then c
  const state = { context: { c: 13 } };
  const withC = call(parent, {
    m: {},
    context: state.context,
    $context: [["keypath", "context"]],
  });
  const intents2 = dispatch(render(withC) as EventElem, mouseDown([0, 0]));
  const intent2 = intents2[0] as readonly unknown[];
  expect(intent2[3]).toBe(13);
  const m2 = intent2[4] as Props;
  expect(m2.$c).toEqual([
    ["keypath", "context"],
    ["keypath", "c"],
  ]);
  expect(select(state, m2.$c as Path)).toBe(13);

  // the call site cannot override a contextual prop
  const ctxComp = defineComponent(
    "ctx-comp",
    [{ keys: [{ key: "c", contextual: true }] }],
    propsBody,
  );
  const override = renderOf(
    call(ctxComp, { c: 99 }, {
      extra: {},
      $extra: [["keypath", "::extra"]],
      context: { c: 13 },
      $context: [["keypath", "::context"]],
    }),
  );
  expect(override.c).toBe(13);
  expect(override.$c).toEqual([
    ["keypath", "::context"],
    ["keypath", "c"],
  ]);
});
