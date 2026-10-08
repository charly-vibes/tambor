// Purpose: executable contract tests for the scrollytelling-pin spec's
//   lifecycle rows — nested pin stacking order and focus (tab)
//   release of an active Pin.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/scrollytelling-pin.md is the design authority; the
//   pin composes with the ambient scrollview (the offset source).
//   tambor-272: redistributed from the former monolithic
//   tests/ui-mobile.test.ts — test names are byte-identical contract
//   bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

import { isGroup, rectangle, type Elem, type Vec2 } from "../src/views/model.ts";
import { call, render } from "../src/model/component.ts";
import { keyPress } from "../src/events/event.ts";
import { scrollview } from "../src/components/scrollview/scrollview.ts";
import { pin } from "../src/scrollytelling/pin.ts";
import { select, type Path } from "../src/effects/paths.ts";
import { findTarget, pinApp, screenPos } from "./helpers/pin.ts";

// ---------------------------------------------------------------------------
// nested_priority_resolved — nested_pin_priority
// ---------------------------------------------------------------------------

// nested_priority_resolved — derives_from: scrollytelling.pin.nested_pin_priority
// generator: `two_nested_pins(priority: unset)`
// predicate: `stacking_order == document_order`
it("nested_priority_resolved: stacking_order == document_order", () => {
  fc.assert(
    fc.property(
      fc.nat(199).map((n) => n + 1), // outer pin's authored duration
      fc.nat(199).map((n) => n + 1), // inner pin's authored duration
      fc.nat(60), fc.nat(40), // marker widths
      fc.nat(80), fc.nat(90), fc.nat(140),
      (outerD, innerD, wOuter, wInner, ox, vw, vh) => {
        const outerMarker = wOuter + 2000;
        const innerMarker = wInner + 3000;
        // both pins simultaneously active: the shared Boundary encloses
        // the sampled offset for both
        const oy = Math.max(outerD, innerD);
        // the inner pin is nested inside the outer pin's body, after the
        // outer's own target; priority is unset on both (no z prop)
        const inner = call(
          pin,
          { duration: innerD, body: rectangle(innerMarker, 25), start: 0 },
          { context: { scroll: [ox, oy] } },
        );
        const innerTree = render(inner) as Elem;
        const outerTree = render(
          call(
            pin,
            { duration: outerD, body: [rectangle(outerMarker, 40), innerTree], start: 0 },
            { context: { scroll: [ox, oy] } },
          ),
        ) as Elem;
        const frame = render(
          call(scrollview, {
            offset: [ox, oy],
            "scroll-bounds": [vw, vh],
            body: [outerTree],
          }),
        ) as Elem;
        const flat = screenPos(frame);
        const index = (marker: number): number => {
          const i = flat.findIndex(
            ({ node }) =>
              !isGroup(node) &&
              (node as { type?: string }).type === "rectangle" &&
              (node as { width: number }).width === marker,
          );
          if (i < 0) throw new Error(`marker ${marker} not painted`);
          return i;
        };
        // priority unset: painting order is document order — the nested
        // (later in the document) pin paints on top of the outer's target
        expect(index(innerMarker)).toBeGreaterThan(index(outerMarker));
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// tab_out_releases_focus — focus_releases_pin
// ---------------------------------------------------------------------------

// tab_out_releases_focus — derives_from: scrollytelling.pin.focus_releases_pin
// generator: `tab_past_last_interactive_element_in_pin()`
// predicate: `check(pin_state) == released`
it("tab_out_releases_focus: check(pin_state) == released", () => {
  fc.assert(
    fc.property(
      fc.nat(150),
      fc.nat(199).map((n) => n + 1),
      fc.nat(60),
      fc.nat(90), fc.nat(140),
      (start, duration, w, vw, vh) => {
        const oy = start; // inside the Boundary: the Pin is active
        const { app, $pin, marker } = pinApp({
          start,
          duration,
          oy,
          ox: 0,
          vw,
          vh,
          slot: [0, start],
          w,
        });
        // before: the target is pinned at the boundary screen position
        const pinnedPos = findTarget(app.render(), marker);
        // focus would move past the last interactive element inside the
        // active Pin: the tab key-press reaches the pin's boundary
        app.send(keyPress("tab"));
        // check(pin_state) == released
        expect(select(app.getState(), $pin)).toBe("released");
        // and the release is real: the body is back in native flow at its
        // own document slot (not trapped at the pinned position)
        expect(findTarget(app.render(), marker)).toEqual([
          pinnedPos[0],
          pinnedPos[1] + duration,
        ]);
        // the release is sticky while the scroll stays inside the Boundary
        app.send(keyPress("tab"));
        expect(select(app.getState(), $pin)).toBe("released");
      },
    ),
  );
  // a non-tab key does not release the pin
  const steady = pinApp({
    start: 5,
    duration: 10,
    oy: 5,
    ox: 0,
    vw: 90,
    vh: 140,
    slot: [0, 5],
    w: 20,
  });
  steady.app.send(keyPress("q"));
  expect(select(steady.app.getState(), steady.$pin)).toBe("unpinned");
  // and a tab on an inactive Pin (offset past the Boundary end) neither
  // releases nor pins
  const inactive = pinApp({
    start: 5,
    duration: 10,
    oy: 16,
    ox: 0,
    vw: 90,
    vh: 140,
    slot: [0, 5],
    w: 20,
  });
  inactive.app.send(keyPress("tab"));
  expect(select(inactive.app.getState(), inactive.$pin)).toBe("unpinned");
});
