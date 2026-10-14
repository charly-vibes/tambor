// @vitest-environment jsdom
// Purpose: the real-DOM host adapter (tambor-2v8) — the bridge that lets
//   DomBackend build its element tree in a live document instead of the
//   domsim recording shim.
// Responsibilities: verify that (1) the createElement factory option
//   makes DomBackend produce RealDomElements that mirror into a live
//   host document (label → real span with text, rectangle → styled div,
//   button → real <button>), (2) the tree nests under an attached host
//   root, and (3) a real pointer event on an attached surface forwards
//   through normalizeDOMEvent as a TamborEvent to subscribers.
// Rationale: openspec/specs/backend-render/spec.md stays the design
//   authority — draw semantics are untouched, only where elements come
//   from changes (factory injection, default still SimElement). The
//   adapter is structural: no lib.dom in core, jsdom satisfies the
//   HostDoc/HostElement interfaces in tests.

import { describe, expect, it } from "vitest";

import { DomBackend } from "../src/render/dom.ts";
import {
  RealDomElement,
  realDomFactory,
  type HostDoc,
} from "../src/interop/domhost.ts";
import { label, button, rectangle, withColor } from "../src/views/model.ts";
import type { TamborEvent } from "../src/events/event.ts";

// The jsdom document, reached structurally (no lib.dom in tsconfig).
function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

// The event constructor, reached structurally (no lib.dom in tsconfig).
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

describe("domhost — real-DOM element adapter", () => {
  it("draws a label as a real span carrying its text under the attached host root", () => {
    const doc = hostDoc();
    const backend = new DomBackend({ createElement: realDomFactory(doc) });
    const root = backend.root as RealDomElement;
    doc.body.appendChild(root.host);
    backend.draw(label("hello tambor"));

    const spans = [...root.host.querySelectorAll("span")];
    expect(spans.length).toBe(1);
    expect(spans[0]?.textContent).toBe("hello tambor");
  });

  it("draws a rectangle as a styled div with size and fill", () => {
    const doc = hostDoc();
    const backend = new DomBackend({ createElement: realDomFactory(doc) });
    const root = backend.root as RealDomElement;
    doc.body.appendChild(root.host);
    backend.draw(withColor([0, 0, 0, 1], rectangle(40, 20)));

    const divs = [...root.host.querySelectorAll("div")];
    expect(divs.length).toBe(2);
    expect(divs[0]?.style.getPropertyValue("background")).toBe(
      "rgb(0, 0, 0)",
    );
    expect(divs[1]?.style.getPropertyValue("width")).toBe("40px");
    expect(divs[1]?.style.getPropertyValue("height")).toBe("20px");
  });

  it("draws a button as a real button element", () => {
    const doc = hostDoc();
    const backend = new DomBackend({ createElement: realDomFactory(doc) });
    const root = backend.root as RealDomElement;
    doc.body.appendChild(root.host);
    backend.draw(button("tap me"));

    const buttons = [...root.host.querySelectorAll("button")];
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent).toBe("tap me");
  });

  it("forwards a real pointer event on an attached surface as a TamborEvent", () => {
    const doc = hostDoc();
    const backend = new DomBackend({ createElement: realDomFactory(doc) });
    const surface = new RealDomElement("canvas", doc);
    doc.body.appendChild(surface.host);
    backend.attach(surface);

    let received: TamborEvent | undefined;
    backend.subscribe((ev) => {
      received = ev;
    });

    surface.host.dispatchEvent(
      new (mouseEventCtor())("pointerdown", { clientX: 12, clientY: 7 }),
    );

    expect(received?.type).toBe("mouse-down");
    const pos = received?.pos;
    expect(pos?.[0]).toBe(12);
    expect(pos?.[1]).toBe(7);
  });
});
