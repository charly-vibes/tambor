// Purpose: executable contract tests for the component-model spec's
//   render rows — call-site identity, render purity and the render
//   cache.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/component-model/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text)
//   and cites the defui_test.clj scenario it ports. No vacuous
//   predicates: every check encodes its row's stated behavior.
//   tambor-272 splits the former monolithic tests/component-model.test.ts
//   into topic files.

import { expect, it } from "vitest";
import fc from "fast-check";

import { call, defineComponent, render, type Props } from "../src/model/component.ts";
import type { Path } from "../src/effects/paths.ts";
import { propsBody } from "./helpers/component-model.ts";

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