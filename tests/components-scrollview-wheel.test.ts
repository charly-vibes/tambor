// Purpose: executable contract tests for the components-scrollview spec —
//   wheel scrolling (wheel_defers_to_children, wheel_updates_offset).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/components-scrollview/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text).
//   No vacuous predicates: every check encodes its row's stated behavior,
//   with the contrasting in-range case asserted where the row implies it.
//   Shared harness helpers live in tests/helpers/scrollview.ts
//   (tambor-272 redistributed the former monolithic
//   tests/components-scrollview.test.ts into topic files).

import { expect, it } from "vitest";
import fc from "fast-check";

import { wheelIntents } from "../src/components/scrollview/scrollview.ts";
import { clampScalar } from "../src/components/scrollview/geometry.ts";
import { on, rectangle, type Vec2 } from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { scroll } from "../src/events/event.ts";
import { OFFSET_PATH, applyUpdate, svView } from "./helpers/scrollview.ts";

// p_wheel_child — derives_from: components.scrollview.wheel_defers_to_children
// generator: a child that handles scroll
// predicate: the child's intents are returned
it("p_wheel_child: a child that handles scroll → the child's intents are returned", () => {
  const body = on("scroll", () => [["child-scroll"]], rectangle(300, 300));
  const view = svView({ viewport: [200, 200], body });
  expect(dispatch(view, scroll([10, 10]))).toEqual([["child-scroll"]]);
});

// p_wheel — derives_from: components.scrollview.wheel_updates_offset
// generator: offset 0 and delta 50, offset at max and delta 50
// predicate: first updates to 50, second returns nothing
it("p_wheel: offset 0 and delta 50 updates to 50, offset at max and delta 50 returns nothing", () => {
  const total: Vec2 = [500, 100];
  const viewport: Vec2 = [200, 200];
  const first = wheelIntents([0, 0], [50, 0], total, viewport, OFFSET_PATH);
  expect(first.length).toBe(1);
  expect(applyUpdate(first, { offset: [0, 0] })).toEqual({ offset: [50, 0] });
  // offset at max: the clamped new offset is unchanged → nothing
  expect(wheelIntents([300, 0], [50, 0], total, viewport, OFFSET_PATH)).toEqual([]);
  // generalized: the update always sets both axes to clamp(old + delta)
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 100 })),
      fc.tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 })),
      (offset, delta) => {
        const intents = wheelIntents(offset, delta, total, viewport, OFFSET_PATH);
        const next: Vec2 = [
          clampScalar(offset[0] + delta[0], 300),
          clampScalar(offset[1] + delta[1], 0),
        ];
        if (next[0] === offset[0] && next[1] === offset[1]) {
          expect(intents).toEqual([]);
        } else {
          expect(intents.length).toBe(1);
          expect(applyUpdate(intents, { offset })).toEqual({ offset: next });
        }
      },
    ),
  );
});
