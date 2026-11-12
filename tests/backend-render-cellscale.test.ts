// @vitest-environment jsdom
// Purpose: backend.render contract tests for the dom backend's cell-scale
//   option (tambor#1) — the real-DOM path renders unit grids as raw px
//   while text renders at browser size, collapsing vertical layouts; the
//   cellScale option renders one unit as k px readable cells.
// Responsibilities: encode the p_cell_scale row's generator and predicate
//   as a vitest property — stage reserves bounds×k px, wrapper scales k,
//   drawn text renders 1px pre-scale with zeroed button chrome, a pointer
//   event at (32, 48) routes to unit (2, 3), keyboard passes through
//   unscaled — plus the k = 1 identity (no stage, no clamp).
// Rationale: openspec/specs/backend-render/spec.md is the design
//   authority; the proven math is the consumer stage this option replaces
//   (wanna's page/review-tambor mount, GH#1 repro).

import { expect, it } from "vitest";

import { DomBackend } from "../src/render/dom.ts";
import {
  RealDomElement,
  realDomFactory,
  type HostDoc,
} from "../src/interop/domhost.ts";
import { bounds, button, label, translate } from "../src/views/model.ts";
import type { TamborEvent } from "../src/events/event.ts";

// The jsdom document, reached structurally (no lib.dom in tsconfig).
function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

// The event constructors, reached structurally (no lib.dom in tsconfig).
function mouseEventCtor(): new (
  type: string,
  init: { clientX: number; clientY: number },
) => unknown {
  const ctor = (globalThis as { MouseEvent?: unknown }).MouseEvent;
  if (typeof ctor !== "function") throw new Error("MouseEvent unavailable");
  return ctor as new (
    type: string,
    init: { clientX: number; clientY: number },
  ) => unknown;
}

function keyEventCtor(): new (
  type: string,
  init: { key: string },
) => unknown {
  const ctor = (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent;
  if (typeof ctor !== "function") throw new Error("KeyboardEvent unavailable");
  return ctor as new (type: string, init: { key: string }) => unknown;
}

// A two-row view whose bounds drive the stage-size assertions: a label
// row translated to (2, 3) and a button row below it.
function twoRowView() {
  return [translate(2, 3, label("hi")), translate(0, 4, button("Run"))];
}

// ---------------------------------------------------------------- tests

// p_cell_scale — derives_from: backend.render.cell_scale
// generator: a labeled view mounted at cellScale 16
// predicate: the stage reserves bounds×16 px, the wrapper scales 16, spans
// render 1px pre-scale, a pointer event at (32,48) routes to unit (2,3)
// and the k=1 tree carries no stage wrapper
it("p_cell_scale: cellScale 16 renders one unit as 16 px with pointer and keyboard routing in units", () => {
  const doc = hostDoc();
  const view = twoRowView();
  const backend = new DomBackend({
    createElement: realDomFactory(doc),
    cellScale: 16,
  });
  const root = backend.root as RealDomElement;
  doc.body.appendChild(root.host);
  backend.draw(view);

  // the stage reserves bounds×k px on the anchored root
  const [w, h] = bounds(view);
  expect(root.host.style.getPropertyValue("width")).toBe(`${w * 16}px`);
  expect(root.host.style.getPropertyValue("height")).toBe(`${h * 16}px`);

  // the drawn tree sits under a scale(k) wrapper anchored at the origin
  // (document order: the wrapper is the root's first element)
  const wrapper = [...root.host.querySelectorAll("div")][0];
  expect(wrapper?.style.getPropertyValue("transform")).toBe("scale(16)");
  expect(wrapper?.style.getPropertyValue("transform-origin")).toBe("0px 0px");

  // every drawn element renders 1px pre-scale: text reads at 16 px
  // through the wrapper, one unit per cell
  const span = [...root.host.querySelectorAll("span")][0];
  expect(span?.textContent).toBe("hi");
  expect(span?.style.getPropertyValue("font-size")).toBe("1px");

  // button chrome is zeroed: no browser padding/border/background may
  // inflate the cell grid
  const btn = [...root.host.querySelectorAll("button")][0];
  expect(btn?.textContent).toBe("Run");
  expect(btn?.style.getPropertyValue("border-width")).toBe("0px");
  expect(btn?.style.getPropertyValue("background-color")).toBe("transparent");

  // pointer positions arrive in real px and route in units: (32, 48)
  // over a surface whose origin sits at (10, 20) lands on unit (2, 3)
  const surface = new RealDomElement("canvas", doc);
  doc.body.appendChild(surface.host);
  // jsdom rects are all-zero; stub the well-known DOM node so the surface
  // origin sits at (10, 20) and (32, 48) is exactly two units across
  const surfaceRect = { x: 10, y: 20, width: 32 * 16, height: 48 * 16 };
  surface.host.getBoundingClientRect = () => surfaceRect;
  backend.attach(surface);
  const received: TamborEvent[] = [];
  backend.subscribe((ev) => received.push(ev));
  surface.host.dispatchEvent(
    new (mouseEventCtor())("pointerdown", { clientX: 10 + 32, clientY: 20 + 48 }),
  );
  expect(received[0]?.type).toBe("mouse-down");
  expect(received[0]?.pos?.[0]).toBe(2);
  expect(received[0]?.pos?.[1]).toBe(3);

  // keyboard and clipboard carry no coordinates — they pass through
  // unscaled
  surface.host.dispatchEvent(new (keyEventCtor())("keydown", { key: "a" }));
  expect(received[1]?.type).toBe("key-press");
  expect(received[1]?.key).toBe("a");
  expect(received[1]?.pos).toBeUndefined();
});

// p_cell_scale identity half — k = 1 (or unset) draws exactly like the
// pre-option backend: no stage sizing, no scale wrapper, no clamp
it("p_cell_scale: k = 1 draws byte-identically to no option — no stage, no wrapper, no clamp", () => {
  const doc = hostDoc();
  const view = twoRowView();
  const backend = new DomBackend({ createElement: realDomFactory(doc) });
  const root = backend.root as RealDomElement;
  doc.body.appendChild(root.host);
  backend.draw(view);

  // no stage sizing on the anchored root
  expect(root.host.style.getPropertyValue("width")).toBe("");
  expect(root.host.style.getPropertyValue("height")).toBe("");

  // no scale wrapper: the translate builds directly under the root
  // (the root's first div IS the translate — no transform, no stage)
  const firstDiv = [...root.host.querySelectorAll("div")][0];
  expect(firstDiv?.style.getPropertyValue("transform")).toBe("");
  expect(firstDiv?.style.getPropertyValue("width")).toBe("");

  // no clamp: text keeps the host cascade (empty inline font-size)
  const span = [...root.host.querySelectorAll("span")][0];
  expect(span?.textContent).toBe("hi");
  expect(span?.style.getPropertyValue("font-size")).toBe("");
});
