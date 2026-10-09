// Purpose: executable contract tests for the scrollytelling-pin spec's
//   position and spacer rows — constant viewport position while
//   pinned, spacer height matching the authored duration, release
//   without visual jump, and spacer recomputation on resize.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/scrollytelling-pin/spec.md is the design authority; the
//   pin composes with the ambient scrollview (the offset source) — no
//   native document scroll. tambor-272: redistributed from the former
//   monolithic tests/ui-mobile.test.ts — test names are byte-identical
//   contract bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

import { rectangle, type Elem, type Vec2 } from "../src/views/model.ts";
import { call, render } from "../src/model/component.ts";
import { pin } from "../src/scrollytelling/pin.ts";
import { findTarget, pinFrame, pinSpacerHeight } from "./helpers/pin.ts";

// ---------------------------------------------------------------------------
// position_constant_while_pinned — fixed_during_active
// ---------------------------------------------------------------------------

// position_constant_while_pinned — derives_from: scrollytelling.pin.fixed_during_active
// generator: `scroll_sweep_within_pin_boundary()`
// predicate: `viewport_position(target) is constant across every sampled frame`
it("position_constant_while_pinned: viewport_position(target) is constant across every sampled frame", () => {
  fc.assert(
    fc.property(
      fc.nat(200), // the Boundary start (content-space y)
      fc.nat(199).map((n) => n + 1), // the authored scroll duration d
      fc.nat(80), // ambient offset.x
      fc.nat(60), fc.nat(80), // target width/height
      fc.nat(90), fc.nat(140), // viewport
      (start, duration, ox, w, h, vw, vh) => {
        const marker = w + 1000;
        const target = rectangle(marker, h);
        // the pin's document slot is the Boundary start: the pin
        // activates as its slot reaches the viewport top
        let first: Vec2 | undefined;
        for (let i = 0; i <= 4; i++) {
          const oy = start + (duration * i) / 4; // every sampled frame inside the Boundary
          const frame = pinFrame({
            start,
            duration,
            body: target,
            slot: [0, start],
            offset: [ox, oy],
            viewport: [vw, vh],
          });
          const pos = findTarget(frame, marker);
          if (first === undefined) {
            first = pos;
          } else {
            expect(pos).toEqual(first);
          }
        }
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// spacer_matches_duration — spacer_reserves_height
// ---------------------------------------------------------------------------

// spacer_matches_duration — derives_from: scrollytelling.pin.spacer_reserves_height
// generator: `pin_with(authored_duration: d)`
// predicate: `spacer_height == d`
it("spacer_matches_duration: spacer_height == d", () => {
  fc.assert(
    fc.property(
      fc.nat(300), // the authored duration d
      fc.nat(60), // target width
      fc.nat(100), // the Boundary start
      (d, w, start) => {
        const body = rectangle(w, 40);
        // the spacer reserves the authored height in every frame — active
        // (including both Boundary ends) and inactive alike
        for (const oy of [start, start + Math.floor(d / 2), start + d, start + d + 3]) {
          const tree = render(
            call(pin, { duration: d, body, start }, { context: { scroll: [0, oy] } }),
          ) as Elem;
          expect(pinSpacerHeight(tree)).toBe(d);
        }
        // and in the released lifecycle too — the Pin back in native flow
        // still reserves its slot with the same authored height
        const released = render(
          call(
            pin,
            { duration: d, body, start, "pin-state": "released" },
            { context: { scroll: [0, start] } },
          ),
        ) as Elem;
        expect(pinSpacerHeight(released)).toBe(d);
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// no_visual_jump_on_release — release_no_jump
// ---------------------------------------------------------------------------

// no_visual_jump_on_release — derives_from: scrollytelling.pin.release_no_jump
// generator: `scroll_past_pin_end_boundary()`
// predicate: `rendered_position(frame_before_release) == rendered_position(frame_after_release)`
it("no_visual_jump_on_release: rendered_position(frame_before_release) == rendered_position(frame_after_release)", () => {
  fc.assert(
    fc.property(
      fc.nat(200),
      fc.nat(199).map((n) => n + 1),
      fc.nat(80),
      fc.nat(60),
      fc.nat(90), fc.nat(140),
      (start, duration, ox, w, vw, vh) => {
        const end = start + duration;
        const marker = w + 1000;
        const target = rectangle(marker, 40);
        const slot: Vec2 = [0, start];
        // the last pinned frame before the boundary: the body fixed at the
        // release-boundary screen position
        const before = findTarget(
          pinFrame({ start, duration, body: target, slot, offset: [ox, end - 1], viewport: [vw, vh] }),
          marker,
        );
        // the release frame: at the Boundary end the pin releases and
        // control returns to native flow within the same frame — the
        // released lifecycle draws the body in its native document slot
        const after = findTarget(
          pinFrame({ start, duration, body: target, slot, offset: [ox, end], viewport: [vw, vh], pinState: "released" }),
          marker,
        );
        expect(after).toEqual(before);
        // past the Boundary the body scrolls with the content again —
        // native flow resumed, the pin no longer fixes the position
        const later = findTarget(
          pinFrame({ start, duration, body: target, slot, offset: [ox, end + 2], viewport: [vw, vh], pinState: "released" }),
          marker,
        );
        expect(later).toEqual([before[0], before[1] - 2]);
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// resize_recomputes_spacer — spacer_recomputed_on_resize
// ---------------------------------------------------------------------------

// resize_recomputes_spacer — derives_from: scrollytelling.pin.spacer_recomputed_on_resize
// generator: `resize_pinned_target_then_refresh()`
// predicate: `spacer_height == new authored duration`
it("resize_recomputes_spacer: spacer_height == new authored duration", () => {
  fc.assert(
    fc.property(
      fc.nat(150), // the authored duration before the resize
      fc.nat(60), fc.nat(60), // target widths before/after
      fc.nat(100), // the Boundary start
      fc.nat(80), // ambient offset.x
      (d1, w1, w2, start, ox) => {
        // the target is resized: the duration is re-authored (d2 ≠ d1)
        const d2 = 300 - d1;
        const oy = start; // the refresh happens while the Pin is active
        // before: the spacer reserves the originally authored duration
        const beforeTree = render(
          call(pin, { duration: d1, body: rectangle(w1, 40), start }, { context: { scroll: [ox, oy] } }),
        ) as Elem;
        expect(pinSpacerHeight(beforeTree)).toBe(d1);
        // after the resize the next refresh is a plain re-render — nothing
        // is cached (render_pure) — so the spacer is recomputed to the new
        // authored duration, not the stale one
        const afterTree = render(
          call(pin, { duration: d2, body: rectangle(w2, 90), start }, { context: { scroll: [ox, oy] } }),
        ) as Elem;
        expect(pinSpacerHeight(afterTree)).toBe(d2);
      },
    ),
  );
});
