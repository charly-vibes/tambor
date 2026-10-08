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
  type CallSite,
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

// The non-literal call pair from defui_test: non-literal-target declares
// a, b, has-default (defaulting to 42) and a contextual is-context;
// non-literal-origin calls it with a non-literal map.
const nlTarget = defineComponent(
  "non-literal-target",
  [
    {
      keys: ["a", "b", "has-default", { key: "is-context", contextual: true }],
      defaults: { "has-default": 42 },
      as: "arg",
    },
  ],
  propsBody,
);

// The callsite of a non-literal call inside a component body: the map's
// own path marks the call non-literal, extra and context flow down.
const nonLiteralCallsite: CallSite = {
  $m: [["keypath", "m"]],
  extra: {},
  $extra: [["keypath", "::extra"]],
  context: {},
  $context: [["keypath", "::context"]],
};

// p_nonliteral — derives_from: component.model.nonliteral_call_fill
// generator: m a 12 and has-default 4
// predicate: a has path m then a and b falls back to extra
it("p_nonliteral: a has path m then a and b falls back to extra", () => {
  const props = renderOf(
    call(nlTarget, { a: 12, "has-default": 4 }, nonLiteralCallsite),
  ) as Props;
  // a: the map contains the key, so the dollar key is filled from the
  // map value's path — m then a
  expect(props.$a).toEqual([
    ["keypath", "m"],
    ["keypath", "a"],
  ]);
  // b: the map does not contain the key, so the dollar key falls back
  // to the call site's extra
  expect(props.$b).toEqual([
    ["keypath", "::extra"],
    ["keypath", expect.any(String)],
    ["keypath", "b"],
  ]);
  expect(props.a).toBe(12);
});

// p_nonliteral_vals — derives_from: component.model.nonliteral_missing_vals
// generator: m with missing keys and context is-context 13
// predicate: has-default is 42 when absent, is-context is 13, all from
//   the right source
it("p_nonliteral_vals: has-default is 42 when absent, is-context is 13, from the right source", () => {
  const callsite = {
    $m: [["keypath", "m"]] as Path,
    extra: {},
    $extra: [["keypath", "::extra"]] as Path,
    context: { "is-context": 13 },
    $context: [["keypath", "::context"]] as Path,
  };
  const props = renderOf(call(nlTarget, {}, callsite)) as Props;
  // has-default is absent from the map and the scratch, so the default
  // is the value
  expect(props["has-default"]).toBe(42);
  // the contextual value comes from context
  expect(props["is-context"]).toBe(13);
  // a missing non-defaulted key is filled from the extra scratch: the
  // scratch is the call site's extra under the call-site key, so a
  // seeded scratch is read back through the very same path
  const extraKey = ((props.$extra as readonly unknown[]).at(-1) as readonly unknown[])[1] as string;
  const seeded = renderOf(
    call(nlTarget, {}, { ...callsite, extra: { [extraKey]: { b: 99 } } }),
  ) as Props;
  expect(seeded.b).toBe(99);
  expect(seeded["has-default"]).toBe(42);
});

// p_identity — derives_from: component.model.call_site_identity
// generator: two call sites with different args
// predicate: extra keys differ and are stable across renders
it("p_identity: extra keys differ and are stable across renders", () => {
  const idChild = defineComponent("id-child", [{ keys: ["v"] }], propsBody);
  // two call sites with different args inside one parent
  const body = (props: Props): unknown => [
    call(idChild, { v: 1 }, {
      extra: props.extra,
      $extra: props.$extra as Path,
      context: props.context,
      $context: props.$context as Path,
    }),
    call(idChild, { v: 2 }, {
      extra: props.extra,
      $extra: props.$extra as Path,
      context: props.context,
      $context: props.$context as Path,
    }),
  ];
  const first = defineComponent("id-parent-1", [{ keys: [] }], body);
  const rendered = render(call(first, {})) as readonly Props[];
  // different call sites get different extra
  expect(rendered[0] as Props).toBeDefined();
  expect((rendered[0] as Props).$extra).not.toEqual((rendered[1] as Props).$extra);

  // the same call site keeps the same extra across renders: a second,
  // identically-argged parent (a different component, so the render
  // cache cannot mask the derivation) yields the same child extra paths
  const second = defineComponent("id-parent-2", [{ keys: [] }], body);
  const rerendered = render(call(second, {})) as readonly Props[];
  expect((rerendered[0] as Props).$extra).toEqual((rendered[0] as Props).$extra);
  expect((rerendered[1] as Props).$extra).toEqual((rendered[1] as Props).$extra);
});

// A body whose render output is fresh on every run: a nonce object
// makes identity observable while the marker stays deep-equal.
const cacheBody = (props: Props): unknown => ({ marker: props.v, nonce: {} });

// p_render_pure — derives_from: component.model.render_pure
// generator: same inputs twice
// predicate: outputs deep-equal
it("p_render_pure: outputs deep-equal", () => {
  fc.assert(
    fc.property(fc.integer(), (v) => {
      const pureA = defineComponent("pure-a", [{ keys: ["v"] }], cacheBody);
      const pureB = defineComponent("pure-b", [{ keys: ["v"] }], cacheBody);
      const r1 = render(call(pureA, { v })) as { marker: unknown };
      const r2 = render(call(pureB, { v })) as { marker: unknown };
      // render depends only on props, path values, extra and context:
      // two same-input renders deep-equal even across distinct components
      expect(r2).toEqual(r1);

      // and a re-render of the very same call (the cache cleared in
      // between by a redefinition) deep-equals the first output
      const same = call(pureA, { v });
      const before = render(same) as { marker: unknown };
      defineComponent("pure-a", [{ keys: ["v"] }], cacheBody); // clears the cache
      const after = render(same) as { marker: unknown };
      expect(after).toEqual(before);
    }),
  );
});

// p_cache — derives_from: component.model.render_cached
// generator: repeat render then redefine
// predicate: second render reuses the first, and redefinition clears
//   the cache
it("p_cache: second render reuses the first, and redefinition clears the cache", () => {
  const comp = defineComponent("cache-comp", [{ keys: ["v"] }], cacheBody);
  const c1 = call(comp, { v: 1 });
  const r1 = render(c1);
  // an equal props map yields a cached render
  const r2 = render(call(comp, { v: 1 }));
  expect(r2).toBe(r1);
  // different props render fresh
  expect(render(call(comp, { v: 2 }))).not.toBe(r1);
  // the cache is reset when any component is redefined
  defineComponent("cache-comp", [{ keys: ["v"] }], cacheBody);
  expect(render(call(comp, { v: 1 }))).not.toBe(r1);
});
