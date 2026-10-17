// Purpose: executable contract tests for the bounds() WeakMap memoisation
//   on immutable view nodes (tambor-54j.2).
// Responsibilities: (a) identical bounds() outputs on the memo-hit path
//   versus the fresh-compute path over random trees; (b) the hit path
//   returns the cached value (reference equality) for the same node
//   object, leaves and groups alike; (c) the freshness guard — an
//   unfrozen (mutable) node is never memoised, so in-place mutation is
//   reflected; plus the named meter: re-render passes over a static
//   10k-sibling subtree.
// Rationale: immutable_nodes freezes every node at construction, so a
//   WeakMap keyed on frozen nodes is safe; mutable surfaces (unfrozen
//   copies) must bypass the cache or in-place mutation would read stale
//   bounds. Memoisation is invisible to semantics — outputs identical
//   (bounds_total, container_bounds_max) — and invisible to the public
//   API (no new exports).

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  bounds,
  button,
  checkbox,
  label,
  makeNode,
  on,
  path,
  rectangle,
  spacer,
  translate,
  withColor,
  type Elem,
  type MeasureFn,
  type Vec2,
} from "../src/views/model.ts";

// Deterministic headless text measure (stub) — text_measure_injected
// says label size comes from an injected measure function.
const stubMeasure: MeasureFn = (text) => [text.length, 1];

const noopHandler = (): null => null;

// performance sits outside tsconfig's ES2022 lib (no @types/node in the
// repo); declare the now() surface the meter needs (house pattern).
declare const performance: { now(): number };

// Representative static subtree: wrappers, leaves, and a frozen group —
// every node type the memo touches on the hit path.
function representativeTree(): Elem {
  return withColor(
    [0.1, 0.2, 0.3],
    translate(
      5,
      7,
      on(
        "click",
        noopHandler,
        label("hello", stubMeasure),
        rectangle(3, 4),
        spacer(2, 3),
        path([0, 0], [2, 3]),
        button("ok"),
        checkbox(true),
        [rectangle(1, 1), label("grouped", stubMeasure), spacer(1, 2)],
      ),
    ),
  );
}

// Random tree over leaf, wrapper, and group shapes (freshness probe
// for (a)). Groups are forced non-empty so bounds is well-defined.
const nodeArb: fc.Arbitrary<Elem> = fc.letrec((tie) => {
  const node = tie("node") as fc.Arbitrary<Elem>;
  return {
    leaf: fc.oneof(
      fc.constant(label("hi", stubMeasure)),
      fc.constant(rectangle(3, 4)),
      fc.constant(path([0, 0], [2, 3])),
      fc.constant(spacer(2, 3)),
      fc.constant(button("ok")),
      fc.constant(checkbox(true)),
    ),
    wrap: fc.oneof(
      node.map((c) => withColor([0.1, 0.2, 0.3], c)),
      node.map((c) => translate(1, 2, c)),
      node.map((c) => on("click", noopHandler, c)),
      fc.array(node, { minLength: 1, maxLength: 4 }),
    ),
    node: fc.oneof(tie("leaf"), tie("wrap")),
  };
}).node as fc.Arbitrary<Elem>;

// (a) identical outputs before/after memoisation: the FIRST bounds()
// call computes fresh (cache miss); every later call on the same node
// object is a memo hit — outputs must be deep-equal every time.
it("memo contract (a): bounds outputs identical across fresh compute and memo hits", () => {
  const tree = representativeTree();
  const fresh = bounds(tree);
  for (let i = 0; i < 5; i++) {
    expect(bounds(tree)).toEqual(fresh);
  }
  fc.assert(
    fc.property(nodeArb, (n) => {
      const first = bounds(n);
      const again = bounds(n);
      expect(again).toEqual(first);
    }),
  );
});

// (b) the WeakMap hit path returns the cached value for the same node
// object — reference equality on frozen leaves and frozen groups.
it("memo contract (b): same frozen node object returns the cached array", () => {
  const leaf = label("cached", stubMeasure);
  expect(Object.isFrozen(leaf)).toBe(true);
  expect(bounds(leaf)).toBe(bounds(leaf));

  const tree = representativeTree();
  expect(bounds(tree)).toBe(bounds(tree));

  // Groups reach the cache only when immutable: built through the
  // corpus constructor makeNode, which deep-freezes the child array.
  const group = makeNode(
    [rectangle(1, 1)],
    [rectangle(1, 1), label("g", stubMeasure), spacer(1, 2)],
  );
  expect(Object.isFrozen(group)).toBe(true);
  expect(bounds(group)).toBe(bounds(group));
});

// (c) freshness guard: an unfrozen (mutable) node is NOT memoised —
// in-place mutation is reflected, and no cached array is returned.
it("memo contract (c): unfrozen nodes bypass the cache (mutation is visible)", () => {
  const unfrozenLeaf = { ...rectangle(3, 4) };
  expect(Object.isFrozen(unfrozenLeaf)).toBe(false);
  const first = bounds(unfrozenLeaf);
  expect(bounds(unfrozenLeaf)).not.toBe(first);
  unfrozenLeaf.width = 10;
  expect(bounds(unfrozenLeaf)).toEqual([10, 4]);

  const unfrozenGroup = [...[rectangle(1, 1), rectangle(2, 2)]];
  expect(Object.isFrozen(unfrozenGroup)).toBe(false);
  const g1 = bounds(unfrozenGroup);
  expect(bounds(unfrozenGroup)).not.toBe(g1);
  (unfrozenGroup as Elem[])[0] = rectangle(9, 9);
  expect(bounds(unfrozenGroup)).toEqual([9, 9]);
});

// Named meter (tambor-54j.2): bounds() calls on a re-render of a static
// subtree — repeated passes over the same tree; with the WeakMap hit
// path only the first pass computes, the rest are cache reads. Timing
// is recorded (before/after delta lands in the ticket report); the
// assertion is a generous ceiling so the meter stays deterministic.
it("meter bounds-static-subtree-rerender: 10k flat siblings, 100 re-render passes", () => {
  const kids: Elem[] = [];
  for (let i = 0; i < 10_000; i++) kids.push(label(`item ${i}`, stubMeasure));
  const tree = withColor([0.1, 0.2, 0.3], ...kids);

  const first = bounds(tree);
  const passes = 100;
  const t0 = performance.now();
  let last: Vec2 = first;
  for (let p = 0; p < passes; p++) last = bounds(tree);
  const ms = performance.now() - t0;

  expect(last).toEqual(first);
  console.log(
    `[meter bounds-static-subtree-rerender] ${passes} passes over a 10k-sibling static subtree: ${ms.toFixed(2)} ms total, ${(ms / passes).toFixed(4)} ms/pass`,
  );
  expect(ms).toBeLessThan(10_000);
});
