// @vitest-environment jsdom
// Purpose: the SPA mount (tambor-e2y) — the browser entry's testable
//   core: todoApp rendered through DomBackend onto the real-DOM host,
//   with input routed through the corpus event router.
// Responsibilities: verify that mounting (1) renders the todo example
//   as real, selectable text in the live document (labels → spans), and
//   (2) a real pointer click on the "complete" filter toggle routes
//   through the corpus router (toggle_sets_filter) and re-renders the
//   filtered list into the document.
// Rationale: openspec/specs/example-todo/spec.md stays the design
//   authority — the SPA changes no app semantics; it is the mounting
//   plumbing the demo runs through (backend_portable, dom backend).

import { describe, expect, it } from "vitest";

import { mountSpa } from "../src/spa/mount.ts";
import { todoApp, todoState } from "../src/examples/todo/todo.ts";
import { toggleOptionOf, centreOf } from "./helpers/appview.ts";
import type { HostDoc } from "../src/interop/domhost.ts";

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

describe("spa-mount — todo example in a live document", () => {
  it("renders the todo list as real, selectable text", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);

    mountSpa(doc, container);

    const text = container.textContent ?? "";
    expect(text).toContain("first");
    expect(text).toContain("second");
    expect(text).toContain("third");
  });

  it("routes a real click on the 'complete' filter and re-renders filtered", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const spa = mountSpa(doc, container);

    // the click position comes from the same view tree the corpus
    // contracts use: the "complete" toggle option's centre
    const toggle = toggleOptionOf(todoApp(todoState(), {}), "complete");
    const [x, y] = centreOf(toggle);
    const ME = mouseEventCtor();
    spa.surface.host.dispatchEvent(new ME("pointerdown", { clientX: x, clientY: y }));
    spa.surface.host.dispatchEvent(new ME("pointerup", { clientX: x, clientY: y }));

    const text = container.textContent ?? "";
    expect(text).not.toContain("first");
    expect(text).not.toContain("second");
    expect(text).toContain("third");
  });
});
