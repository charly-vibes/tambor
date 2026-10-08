// Purpose: executable contract tests for the component-model spec's
//   call-site rows — defaults, contextual sources, the as binding across
//   the child/parent pair, and non-literal call fill.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property,
//   porting the defui_test child/parent and non-literal call pairs.
// Rationale: specs/component-model.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text)
//   and cites the defui_test.clj scenario it ports. tambor-272 splits the
//   former monolithic tests/component-model.test.ts into topic files;
//   shared helpers live in tests/helpers/component-model.ts.

import { expect, it } from "vitest";

import {
  call,
  defineComponent,
  render,
  type CallSite,
  type Props,
} from "../src/model/component.ts";
import { select, type Path } from "../src/effects/paths.ts";
import { on, spacer } from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import type { EventElem } from "../src/events/bubble.ts";
import { propsBody, renderOf } from "./helpers/component-model.ts";

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