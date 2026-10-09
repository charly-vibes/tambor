// Purpose: executable contract tests for the ui-mobile spec's
//   reduced-motion row — momentum scrolling under
//   prefers-reduced-motion.
// Responsibilities: encode the converted row's generator and predicate
//   as a vitest contract with contrasting cases.
// Rationale: openspec/specs/ui-mobile/spec.md is the design authority; the predicate
//   here mirrors the Properties row (generator + predicate text).
//   tambor-272: redistributed from the former monolithic
//   tests/ui-mobile.test.ts — test names are byte-identical contract
//   bindings.

import { expect, it, vi } from "vitest";

import {
  momentumSchedule,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
} from "../src/ui/motion.ts";

// ---------------------------------------------------------------------------
// p_motion — reduced_motion
// ---------------------------------------------------------------------------

// p_motion — derives_from: ui.mobile.reduced_motion
// generator: the media query on
// predicate: no momentum frames are scheduled
it("p_motion: no momentum frames are scheduled", () => {
  expect(REDUCED_MOTION_QUERY).toBe("prefers-reduced-motion");
  // The media query on: no momentum frames are scheduled.
  const raf = vi.fn();
  const frames = momentumSchedule([0, 0], [5, 0], [1000, 100], [320, 100], {
    matchMedia: (q) => (q === REDUCED_MOTION_QUERY ? { matches: true } : undefined),
    raf,
    apply: () => {},
  });
  expect(frames).toEqual([]);
  expect(raf).not.toHaveBeenCalled();
  expect(
    prefersReducedMotion((q) => (q === REDUCED_MOTION_QUERY ? { matches: true } : undefined)),
  ).toBe(true);

  // Contrasting case: without the query the flick does schedule
  // decaying momentum frames.
  const raf2 = vi.fn();
  const frames2 = momentumSchedule([0, 0], [5, 0], [1000, 100], [320, 100], {
    matchMedia: () => ({ matches: false }),
    raf: raf2,
    apply: () => {},
  });
  expect(frames2.length).toBeGreaterThan(0);
  expect(raf2).toHaveBeenCalledTimes(frames2.length);
});
