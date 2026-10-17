// @vitest-environment jsdom
// Purpose: the SPA mount (tambor-e2y) — the browser entry's testable
//   core: todoApp rendered through DomBackend onto the real-DOM host,
//   with input routed through the corpus event router.
// Responsibilities: verify that mounting (1) renders the todo example
//   as real, selectable text in the live document (labels → spans),
//   (2) a real pointer click on the "complete" filter toggle routes
//   through the corpus router (toggle_sets_filter) and re-renders the
//   filtered list into the document, and (tambor-e5n) (3) the SPA
//   registers the corpus request-focus effect — a synthetic dispatch
//   through the mounted app sets the focus state the textarea handlers
//   emit against and focuses the input surface, and the app's view
//   context carries that focus state (focus_ctx).
// Rationale: openspec/specs/example-todo/spec.md stays the design
//   authority — the SPA changes no app semantics; it is the mounting
//   plumbing the demo runs through (backend_portable, dom backend).
//   The request-focus pin is synthetic on purpose: native click focus
//   (a real <textarea> focusing itself) already passes and proves
//   nothing about the programmatic restoration path.

import { describe, expect, it } from "vitest";

import { mountDemo, mountSpa } from "../src/spa/mount.ts";
import { spaFocusView } from "../src/spa/focus.ts";
import { makeApp, lookupEffect } from "../src/effects/dispatch.ts";
import { select } from "../src/effects/paths.ts";
import { FOCUS_PATH } from "../src/app/top.ts";
import { label } from "../src/views/model.ts";
import { todoApp, todoState, NEXT_TEXT_PATH } from "../src/examples/todo/todo.ts";
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

describe("spa-mount — request-focus effect and focus context (tambor-e5n)", () => {
  it("registers request-focus; a synthetic dispatch sets focus state and focuses the surface", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const spa = mountSpa(doc, container);

    // the SPA registers the corpus effect the textarea handlers emit
    expect(lookupEffect("request-focus")).toBeTypeOf("function");

    // synthetic dispatch through the mounted app (not a native click):
    // the effect sets the focus state the handlers emit against ...
    spa.app.dispatch(["request-focus", NEXT_TEXT_PATH]);
    expect(select(spa.app.getState(), FOCUS_PATH)).toEqual(NEXT_TEXT_PATH);

    // ... and focuses the current surface so keydown/paste flow
    const documentRef = doc as unknown as { activeElement?: unknown };
    expect(documentRef.activeElement).toBe(spa.surface.host);
  });

  it("exposes the focus state in the app's view context", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    let seen: unknown = null;
    // the app is built the SPA way: makeApp + the mount's focus view
    // wrapper (createTodoApp's shape), mounted through mountDemo
    const app = makeApp({
      view: spaFocusView((_state, context) => {
        seen = context;
        return label("x");
      }),
      state: {},
      backend: { containerSize: [100, 100] as const },
    });
    mountDemo(doc, container, () => app);

    app.dispatch(["request-focus", NEXT_TEXT_PATH]);
    app.view();

    expect((seen as { focus?: unknown }).focus).toEqual(NEXT_TEXT_PATH);
  });
});
