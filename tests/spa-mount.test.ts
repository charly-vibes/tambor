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
import { select, type Path } from "../src/effects/paths.ts";
import { FOCUS_PATH } from "../src/app/top.ts";
import { label, rectangle, type Elem } from "../src/views/model.ts";
import { scrollview } from "../src/components/scrollview/scrollview.ts";
import { call, render } from "../src/model/component.ts";
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

// The Event constructor, reached structurally (no lib.dom in tsconfig).
function eventCtor(): new (type: string, init?: { cancelable?: boolean }) => unknown {
  const ctor = (globalThis as { Event?: unknown }).Event;
  if (typeof ctor !== "function") throw new Error("Event unavailable");
  return ctor as new (type: string, init?: { cancelable?: boolean }) => unknown;
}

describe("spa-mount — async applies re-render (tambor-a45)", () => {
  it("a dispatch outside the event wire re-draws the view", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    // a label whose text is the state count — async applies (the logo
    // worker reply) mutate the state outside any DOM event, and the
    // mount must re-render them the same way it renders routed intents
    const app = makeApp({
      view: (state) =>
        label(`count=${(state as { n: number }).n}`),
      state: { n: 0 },
    });
    const spa = mountDemo(doc, container, () => app);
    expect(container.textContent).toContain("count=0");

    // no DOM event involved: the async apply goes through the app's own
    // dispatch (the run-applied path), and the drawn DOM must follow
    app.dispatch([["set", [["keypath", "n"]], 7]]);
    expect(container.textContent).toContain("count=7");
    expect(spa.root).toBeDefined();
  });
});

describe("spa-mount — wheel forwarding (tambor-gov)", () => {
  it("a wheel event on the surface routes into the scrollview and updates the offset", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    // the offset path the scrollview call's updates address; the view
    // reads the stored offset through the same path (stale_offset_snaps)
    const OFFSET_PATH: Path = [["keypath", "offset"]];
    const app = makeApp({
      view: (state) =>
        render(
          call(scrollview, {
            "scroll-bounds": [200, 200],
            body: rectangle(500, 500),
            $offset: OFFSET_PATH,
            offset: (state as { offset: [number, number] }).offset,
          }),
        ) as Elem,
      state: { offset: [0, 0] },
      backend: { containerSize: [300, 300] as const },
    });
    const spa = mountDemo(doc, container, () => app);

    // a real wheel event on the drawn root (jsdom has no WheelEvent:
    // an Event carrying the wheel init fields stands in)
    const ev = new (eventCtor())("wheel", { cancelable: true }) as {
      defaultPrevented: boolean;
    } & Record<"clientX" | "clientY" | "deltaX" | "deltaY", number>;
    for (const [field, value] of [
      ["clientX", 10],
      ["clientY", 10],
      ["deltaX", 0],
      ["deltaY", 50],
    ] as const) {
      Object.defineProperty(ev, field, { value });
    }
    spa.surface.host.dispatchEvent(ev as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);

    // wheel_updates_offset: the delta clamps into the range and the
    // stored offset moves by it
    expect(select(app.getState(), OFFSET_PATH)).toEqual([0, 50]);
    // the page must not scroll: the surface preventDefaults the wheel
    expect(ev.defaultPrevented).toBe(true);
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

