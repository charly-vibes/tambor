// Purpose: executable contract tests for the ui-mobile spec's gesture
//   row — the scripted gesture set (tap, long-press, drag, flick,
//   pinch) recognized from touch moments.
// Responsibilities: encode the converted row's generator and predicate
//   as vitest + fast-check properties, one block per gesture.
// Rationale: openspec/specs/ui-mobile/spec.md is the design authority; the predicate
//   here mirrors the Properties row (generator + predicate text).
//   tambor-272: redistributed from the former monolithic
//   tests/ui-mobile.test.ts — test names are byte-identical contract
//   bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

import type { Vec2 } from "../src/views/model.ts";
import {
  classifyTap,
  TAP_SLOP_PX,
  TAP_TIMEOUT_MS,
} from "../src/events/event.ts";
import {
  recognize,
  LONG_PRESS_MS,
  FLICK_MIN_VELOCITY,
} from "../src/ui/gestures.ts";

// ---------------------------------------------------------------------------
// p_gestures — gesture_set
// ---------------------------------------------------------------------------

// p_gestures — derives_from: ui.mobile.gesture_set
// generator: scripted gestures
// predicate: each gesture emits its named intent
it("p_gestures: each gesture emits its named intent", () => {
  // tap: up within 10 px and 300 ms of down (tap_vs_drag thresholds).
  fc.assert(
    fc.property(
      fc.nat(1000),
      fc.nat(1000),
      fc.integer({ min: 10, max: TAP_TIMEOUT_MS - 10 }),
      (dx, dy, dt) => {
        const p: Vec2 = [dx, dy];
        const q: Vec2 = [dx + 3, dy + 3];
        const intent = recognize({ down: { pos: p, time: 0 }, up: { pos: q, time: dt } });
        expect(intent[0]).toBe("tap");
        expect(intent[1]).toEqual(q);
      },
    ),
  );
  // long-press: held past the threshold with no up and no movement.
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: LONG_PRESS_MS, max: LONG_PRESS_MS + 2000 }),
      (seed, hold) => {
        const p: Vec2 = [seed % 100, seed % 60];
        const intent = recognize({ down: { pos: p, time: 0 }, up: null, now: hold });
        expect(intent[0]).toBe("long-press");
        expect(intent[1]).toEqual(p);
      },
    ),
  );
  // drag: beyond the tap slop and slower than the flick threshold.
  fc.assert(
    fc.property(fc.integer({ min: 12, max: 150 }), fc.integer({ min: 600, max: 2000 }), (dist, dt) => {
      const from: Vec2 = [0, 0];
      const to: Vec2 = [dist, 0];
      expect(dist / dt).toBeLessThan(FLICK_MIN_VELOCITY);
      const intent = recognize({ down: { pos: from, time: 0 }, up: { pos: to, time: dt } });
      expect(intent[0]).toBe("drag");
      expect(intent[1]).toEqual(from);
      expect(intent[2]).toEqual(to);
    }),
  );
  // flick: beyond the tap slop and at or above the flick threshold.
  fc.assert(
    fc.property(fc.integer({ min: 50, max: 300 }), fc.integer({ min: 10, max: 400 }), (dist, dt) => {
      // speed = dist/dt must reach the flick threshold.
      fc.pre(dt <= dist / FLICK_MIN_VELOCITY - 1);
      const intent = recognize({
        down: { pos: [0, 0], time: 0 },
        up: { pos: [dist, 0], time: dt },
      });
      expect(intent[0]).toBe("flick");
      expect(intent[1]).toBeGreaterThan(0);
    }),
  );
  // pinch: two pointers, the intent carries the scale and centre.
  fc.assert(
    fc.property(fc.integer({ min: 40, max: 100 }), fc.constantFrom(1.5, 2, 0.5), (d0, f) => {
      const a: Vec2 = [100, 100];
      const b0: Vec2 = [100 + d0, 100];
      const b1: Vec2 = [100 + d0 * f, 100];
      const intent = recognize({
        down: { pos: a, time: 0 },
        up: null,
        second: { down: { pos: b0, time: 10 }, up: { pos: b1, time: 200 } },
      });
      expect(intent[0]).toBe("pinch");
      expect(intent[1]).toBeCloseTo(f, 5);
      expect(intent[2]).toEqual([100 + (d0 * f) / 2, 100]);
    }),
  );
  // The tap classifier the recognizer builds on keeps its thresholds.
  expect(
    classifyTap({ pos: [0, 0], time: 0 }, { pos: [TAP_SLOP_PX, 0], time: TAP_TIMEOUT_MS }),
  ).toBe("tap");
});
