// Purpose: executable contract tests for the components-scrollview spec —
//   rendering and range geometry (default_offset, content_translated,
//   range_formula, stale_offset_snaps).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-scrollview.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text).
//   No vacuous predicates: every check encodes its row's stated behavior,
//   with the contrasting in-range case asserted where the row implies it.
//   Shared harness helpers live in tests/helpers/scrollview.ts
//   (tambor-272 redistributed the former monolithic
//   tests/components-scrollview.test.ts into topic files).

import { expect, it } from "vitest";
import fc from "fast-check";

import { scrollview, wheelIntents } from "../src/components/scrollview/scrollview.ts";
import { clampScalar, scrollMax } from "../src/components/scrollview/geometry.ts";
import { call } from "../src/model/component.ts";
import { label, rectangle, type Elem, type TranslateNode, type Vec2 } from "../src/views/model.ts";
import type { EventElem } from "../src/events/bubble.ts";
import { OFFSET_PATH, applyUpdate, svView, walk } from "./helpers/scrollview.ts";

const viewportArb = fc.tuple(fc.nat(400), fc.nat(400));
const bodyArb = fc.tuple(fc.nat(400), fc.nat(400)).map(([w, h]) => rectangle(w, h));
const offsetArb = fc.tuple(fc.integer({ min: -200, max: 200 }), fc.integer({ min: -200, max: 200 }));

// The translate node that carries the body (content_translated).
function findTranslate(view: EventElem, body: Elem): TranslateNode | undefined {
  return walk(view).find(
    (n) => n != null && "drawable" in n && n.drawable === body,
  ) as TranslateNode | undefined;
}

// p_default — derives_from: components.scrollview.default_offset
// generator: no offset prop
// predicate: offset equals [0, 0]
it("p_default: no offset prop → offset equals [0, 0]", () => {
  expect(
    call(scrollview, { "scroll-bounds": [200, 200], body: label("hi") }).props.offset,
  ).toEqual([0, 0]);
  fc.assert(
    fc.property(viewportArb, bodyArb, (viewport, body) => {
      expect(
        call(scrollview, { "scroll-bounds": viewport, body }).props.offset,
      ).toEqual([0, 0]);
    }),
  );
});

// p_translate — derives_from: components.scrollview.content_translated
// generator: random offsets
// predicate: body origin equals the negated offset
it("p_translate: random offsets → body origin equals the negated offset", () => {
  fc.assert(
    fc.property(offsetArb, viewportArb, bodyArb, (offset, viewport, body) => {
      const t = findTranslate(svView({ offset, viewport, body }), body);
      expect(t).toBeDefined();
      expect(t!.x).toBe(-offset[0]);
      expect(t!.y).toBe(-offset[1]);
    }),
  );
});

// p_range — derives_from: components.scrollview.range_formula
// generator: viewport 200 over content 500 and 100
// predicate: max offset is 300 and 0
it("p_range: viewport 200 over content 500 and 100 → max offset is 300 and 0", () => {
  expect(scrollMax([500, 100], [200, 200])).toEqual([300, 0]);
  // the range_formula law holds for every total and viewport
  fc.assert(
    fc.property(fc.tuple(fc.nat(600), fc.nat(600)), viewportArb, (total, viewport) => {
      expect(scrollMax(total, viewport)).toEqual([
        Math.max(0, total[0] - viewport[0]),
        Math.max(0, total[1] - viewport[1]),
      ]);
    }),
  );
  // clamp(v) is max(0, min(max, v))
  fc.assert(
    fc.property(fc.integer({ min: -10, max: 500 }), fc.nat(500), (v, max) => {
      expect(clampScalar(v, max)).toBe(Math.max(0, Math.min(max, v)));
    }),
  );
});

// p_stale — derives_from: components.scrollview.stale_offset_snaps
// generator: stored offset above max then a small scroll
// predicate: render keeps it, the update clamps it
it("p_stale: stored offset above max → render keeps it, the update clamps it", () => {
  const body = rectangle(500, 500);
  const viewport: Vec2 = [200, 200];
  const t = findTranslate(svView({ offset: [1000, 5], viewport, body }), body);
  expect(t).toBeDefined();
  expect(t!.x).toBe(-1000); // render keeps the stale offset
  expect(t!.y).toBe(-5);
  const intents = wheelIntents([1000, 5], [0, 10], [500, 500], viewport, OFFSET_PATH);
  expect(intents.length).toBe(1);
  // the update clamps against the stored value: x snaps back to max,
  // y moves by the delta
  expect(applyUpdate(intents, { offset: [1000, 5] })).toEqual({ offset: [300, 15] });
});
