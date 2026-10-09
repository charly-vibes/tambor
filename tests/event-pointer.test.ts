// Purpose: executable contract tests for event-model pointer rows.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: openspec/specs/event-model/spec.md is the design authority; each
//   predicate here mirrors a Properties row of that spec — mouse,
//   touch and pen inputs unify into one shape, and taps are
//   distinguished from drags by slop and time thresholds.

import { expect, it } from "vitest";
import fc from "fast-check";

import type { Vec2 } from "../src/views/model.ts";
import { classifyTap, normalizePointer, tapEvents, type PointerMoment } from "../src/events/event.ts";

// p_pointer — derives_from: event.model.pointer_unified
// generator: mouse, touch and pen inputs
// predicate: all produce the same normalised shape
it("p_pointer: all produce the same normalised shape", () => {
  const raw = { pos: [3, 4] as Vec2, button: 1, down: true, mods: ["shift"] };
  const m = normalizePointer({ ...raw, source: "mouse" });
  const t = normalizePointer({ ...raw, source: "touch" });
  const p = normalizePointer({ ...raw, source: "pen" });
  expect(m).toEqual(t);
  expect(t).toEqual(p);
  // the unified shape carries position, button, down flag, modifiers
  // and pointerType
  expect(m).toEqual({ pos: [3, 4], button: 1, down: true, mods: ["shift"], pointerType: "mouse" });

  // Generalized property: equivalent inputs from the three devices
  // normalise to one identical shape.
  fc.assert(
    fc.property(
      fc.tuple(fc.nat(500), fc.nat(500)),
      fc.nat(4),
      fc.boolean(),
      fc.array(fc.constantFrom("shift", "control", "alt", "meta"), { maxLength: 3 }),
      (pos, button, down, mods) => {
        const base = { pos: pos as Vec2, button, down, mods };
        const shapes = (["mouse", "touch", "pen"] as const).map((source) =>
          normalizePointer({ ...base, source }));
        expect(shapes[0]).toEqual(shapes[1]);
        expect(shapes[1]).toEqual(shapes[2]);
        expect(shapes[0]).toEqual({ ...base, pointerType: "mouse" });
      },
    ),
  );
});

// p_tap — derives_from: event.model.tap_vs_drag
// generator: random down-up pairs
// predicate: classification matches the slop and time thresholds
it("p_tap: classification matches the slop and time thresholds", () => {
  const down: PointerMoment = { pos: [0, 0], time: 0 };
  // exactly on both thresholds is a tap; beyond either is a drag
  expect(classifyTap(down, { pos: [10, 0], time: 300 })).toBe("tap");
  expect(classifyTap(down, { pos: [10.5, 0], time: 300 })).toBe("drag");
  expect(classifyTap(down, { pos: [0, 0], time: 301 })).toBe("drag");
  expect(classifyTap(down, { pos: [6, 8], time: 299 })).toBe("tap");

  // a tap emits mouse-down then mouse-up
  const events = tapEvents(down, { pos: [4, 3], time: 100 });
  expect(events.map((e) => e.type)).toEqual(["mouse-down", "mouse-up"]);
  expect(events[0]).toMatchObject({ pos: [4, 3], down: true });
  expect(events[1]).toMatchObject({ pos: [4, 3], down: false });
  expect(tapEvents(down, { pos: [50, 0], time: 10 })).toEqual([]);

  // Generalized property: classification follows the 10 px slop and
  // 300 ms time thresholds.
  fc.assert(
    fc.property(
      fc.tuple(fc.nat(100), fc.nat(100)),
      fc.tuple(fc.nat(100), fc.nat(100)),
      fc.nat(1000),
      fc.nat(1000),
      (dp, up_, dTime, extra) => {
        const d: PointerMoment = { pos: dp as Vec2, time: dTime };
        const u: PointerMoment = { pos: up_ as Vec2, time: dTime + extra };
        const dx = up_[0] - dp[0];
        const dy = up_[1] - dp[1];
        const withinSlop = dx * dx + dy * dy <= 100;
        const expected = withinSlop && extra <= 300 ? "tap" : "drag";
        expect(classifyTap(d, u)).toBe(expected);
      },
    ),
  );
});
