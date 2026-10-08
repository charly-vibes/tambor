// Purpose: backend.render contract tests for the input seam — the
//   coordinates the router actually receives, key normalisation and the
//   clipboard service round-trip.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property,
//   plus the local probe-view fixture (records the local position the
//   router passed).
// Rationale: specs/backend-render.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: input checks the coordinates the
//   router actually receives. tambor-272 redistributes the former
//   monolithic tests/backend-render.test.ts into topic files; clipStub
//   is shared through tests/helpers/backend-render.ts.

import { expect, it } from "vitest";
import fc from "fast-check";

import { CanvasBackend } from "../src/render/canvas.ts";
import { createCanvas } from "../src/render/domsim.ts";
import { dispatch } from "../src/events/dispatch.ts";
import type { TamborEvent } from "../src/events/event.ts";
import { on, rectangle, type Elem, type Vec2 } from "../src/views/model.ts";
import { clipStub } from "./helpers/backend-render.ts";

// ---------------------------------------------------------------- helpers

// A view carrying a handler that records the local position the router
// passed (p_input: the router receives view-space coordinates).
function probeView(): { view: Elem; received: Vec2[] } {
  const received: Vec2[] = [];
  const view = on(
    "mouse-move",
    (...args: readonly unknown[]) => {
      const pos = args[0] as Vec2;
      received.push(pos);
      return [["probe", pos]];
    },
    rectangle(400, 400),
  );
  return { view, received };
}

// ---------------------------------------------------------------- tests

// p_input — derives_from: backend.render.input_forwarded
// generator: scripted pointer events
// predicate: the router receives view-space coordinates
it("p_input: the router receives view-space coordinates for scripted pointer events", () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.nat(300), fc.nat(200), fc.constantFrom(0, 17, 40)),
      ([dx, dy, originX]) => {
        const backend = new CanvasBackend({ containerSize: [400, 400] });
        const surface = createCanvas();
        surface.rect = { x: originX, y: originX, width: 400, height: 400 };
        backend.attach(surface);
        const { view, received } = probeView();
        const forwarded: Vec2[] = [];
        backend.subscribe((ev) => {
          forwarded.push(ev.pos ?? [0, 0]);
          dispatch(view, ev);
        });
        // the scripted pointer sequence: down, move, up at one raw
        // device position
        const clientX = originX + dx;
        const clientY = originX + dy;
        surface.dispatch({ type: "pointerdown", clientX, clientY });
        surface.dispatch({ type: "pointermove", clientX, clientY });
        surface.dispatch({ type: "pointerup", clientX, clientY });
        // every forwarded event carries the view-space position …
        expect(forwarded).toEqual([
          [dx, dy],
          [dx, dy],
          [dx, dy],
        ]);
        // … and the router (the view handler) received it once
        expect(received).toEqual([[dx, dy]]);
      },
    ),
  );
});

// p_keys — derives_from: backend.render.key_normalisation
// generator: a, A, Enter, Backspace, ArrowLeft, Shift
// predicate: a, A, enter, backspace, left and nothing
it("p_keys: a, A, Enter, Backspace, ArrowLeft, Shift forward a, A, enter, backspace, left and nothing", () => {
  const backend = new CanvasBackend({ containerSize: [120, 60] });
  const surface = createCanvas();
  surface.rect = { x: 0, y: 0, width: 120, height: 60 };
  backend.attach(surface);
  const keys: (string | undefined)[] = [];
  backend.subscribe((ev) => keys.push(ev.key));

  const script: readonly (readonly [string, string | undefined])[] = [
    ["a", "a"],
    ["A", "A"],
    ["Enter", "enter"],
    ["Backspace", "backspace"],
    ["ArrowLeft", "left"],
    ["Shift", undefined],
  ];
  for (const [raw] of script) {
    surface.dispatch({ type: "keydown", key: raw });
  }
  // the modifier alone produced nothing: five events, no sixth slot
  expect(keys).toEqual(script.slice(0, 5).map(([, expected]) => expected));
});

// p_clipboard — derives_from: backend.render.clipboard_service
// generator: copy hello and a paste event
// predicate: the clipboard gets hello and the paste arrives as a string
it("p_clipboard: the clipboard gets hello and the paste arrives as a string", () => {
  const clip = clipStub();
  const backend = new CanvasBackend({ containerSize: [120, 60], clipboard: clip });
  const surface = createCanvas();
  surface.rect = { x: 0, y: 0, width: 120, height: 60 };
  backend.attach(surface);
  const seen: TamborEvent[] = [];
  backend.subscribe((ev) => seen.push(ev));

  backend.copyToClipboard("hello");
  expect(clip.texts).toEqual(["hello"]);

  surface.dispatch({ type: "paste", text: "world" });
  expect(seen).toHaveLength(1);
  const ev = seen[0]!;
  expect(ev.type).toBe("clipboard");
  expect(typeof ev.data).toBe("string");
  expect(ev.data).toBe("world");
});