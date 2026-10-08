// Purpose: executable contract tests for the interop-model spec — the
//   plain-data tier: views, effect tags and the iterable boundary.
// Responsibilities: encode each converted row's generator and predicate as a
//   vitest + fast-check property, one test per converted property.
// Rationale: specs/interop-model.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text). No vacuous
//   predicates: every check encodes its row's stated behavior. Host
//   stand-ins (Keyword, cljsOps) live in tests/helpers — they are
//   host-language data the library never inspects.

import { expect, it } from "vitest";
import fc from "fast-check";

import { interDispatch, makeRegistry } from "../src/interop/seam.ts";
import { label, vstack } from "../src/interop/views.ts";
import { concatPath, filterNav } from "../src/interop/paths.ts";
import { cljsOps, hasFunction, isPlain, kw, not, type Keyword } from "./helpers/interop-standins.ts";

// The WHATWG structured clone, outside tsconfig's ES2022 lib (see the
// shared note in tests/helpers/interop-standins.ts).
declare const structuredClone: <T>(value: T) => T;

// ---------------------------------------------------------------------------
// p_plain_data — derives_from: interop.model.plain_data_api
// generator: build each node, effect and path
// predicate: structured clone succeeds and every value is a plain type or function
// ---------------------------------------------------------------------------

// every value is a plain type or function — no class instances, getters,
// TS enums or non-registered symbols in public data (plain_data_api);
// structured clone succeeds wherever no function argument is carried
function assertPlain(v: unknown): void {
  expect(isPlain(v)).toBe(true);
  if (!hasFunction(v)) expect(structuredClone(v)).toEqual(v);
}

it("p_plain_data: structured clone succeeds and every value is a plain type or function", () => {
  const path = concatPath([["keypath", "todos"]], [filterNav(not)], [["nth", 1]]);
  const nodes: unknown[] = [label("hello"), vstack(label("a"), label("b"))];
  const effects: unknown[] = [
    ["set", [["keypath", "n"]], 42],
    ["counter-increment", [["keypath", "num"]]],
    ["update", [["keypath", "todos"], ["nth", 0], ["keypath", "complete?"], not]],
  ];
  for (const v of [...nodes, ...effects, path]) assertPlain(v);
});

// ---------------------------------------------------------------------------
// p_string_tags — derives_from: interop.model.string_tags
// generator: the keyword form of ui select and the string ui slash select
// predicate: both resolve to the same registered handler
// ---------------------------------------------------------------------------

it("p_string_tags: the keyword form of ui select and the string ui slash select resolve to the same registered handler", () => {
  const registry = makeRegistry();
  const calls: string[] = [];
  registry.set("ui/select", (state, arg) => {
    calls.push(`ui/select ${String(arg)}`);
    return state;
  });
  // the string form with plain ops — the registry treats tags as opaque strings
  interDispatch(null, [["ui/select", 1]], { registry });
  // the keyword form through the seam's tag op — the same handler resolves
  interDispatch(null, [[kw("ui", "select"), 2]], { registry, ops: cljsOps });
  expect(calls).toEqual(["ui/select 1", "ui/select 2"]);
});

// ---------------------------------------------------------------------------
// p_tag_ns — derives_from: interop.model.tag_namespace_kept
// generator: two keywords with the same name in different namespaces
// predicate: the normalised tags differ and keep their namespaces
// ---------------------------------------------------------------------------

it("p_tag_ns: keywords with the same name in different namespaces normalise to different tags", () => {
  const select: Keyword = kw("ui", "select");
  const other: Keyword = kw("other", "select");
  // the normalised tags keep their namespaces
  expect(cljsOps.tag(select)).toBe("ui/select");
  expect(cljsOps.tag(other)).toBe("other/select");
  // a keyword with no namespace normalises to its bare name
  expect(cljsOps.tag(kw(null, "update"))).toBe("update");
  // and the normalised tags differ — the same name never collides
  expect(cljsOps.tag(select)).not.toBe(cljsOps.tag(other));
});

// ---------------------------------------------------------------------------
// p_iterables — derives_from: interop.model.iterable_inputs
// generator: children given as an array, a generator and a lazy map result
// predicate: all three produce the same view and the output children is an array
// ---------------------------------------------------------------------------

it("p_iterables: array, generator and lazy map children all produce the same view with array children", () => {
  const a = label("a");
  const b = label("b");
  function* gen(): Generator<unknown> {
    yield a;
    yield b;
  }
  // the lazy result of a squint map: an iterable that is not an array
  const lazyMap = (function* (): Generator<unknown> {
    for (const x of [a, b]) yield x;
  })();
  const expected = { type: "vstack", children: [a, b] };
  const views = [vstack([a, b]), vstack(gen()), vstack(lazyMap)];
  for (const v of views) {
    // all three produce the same view
    expect(v).toEqual(expected);
    // the output children is an array
    expect(Array.isArray(v["children"])).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// p_variadic — derives_from: interop.model.variadic_and_array
// generator: vstack with rest args and with one array
// predicate: the views deep-equal
// ---------------------------------------------------------------------------

it("p_variadic: vstack with rest args and with one array give deep-equal views", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 6 }), (n) => {
      const kids = Array.from({ length: n }, (_, i) => label(`k${i}`));
      expect(vstack(...kids)).toEqual(vstack(kids));
    }),
  );
});
