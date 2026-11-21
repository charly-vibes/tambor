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
//   context carries that focus state (focus_ctx), and (add-spa-test-seams)
//   (4) the opt-in debug handle is published after the first draw, counts
//   real draws only, exposes no write surface and is cleared on unmount.
// Rationale: openspec/specs/example-todo/spec.md stays the design
//   authority — the SPA changes no app semantics; it is the mounting
//   plumbing the demo runs through (backend_portable, dom backend).
//   The request-focus pin is synthetic on purpose: native click focus
//   (a real <textarea> focusing itself) already passes and proves
//   nothing about the programmatic restoration path.

import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { mountDemo, type DebugSnapshot } from "../src/spa/mount.ts";
import { mountSpa } from "../src/spa/todo-spa.ts";
import { spaFocusView } from "../src/spa/focus.ts";
import { makeApp, lookupEffect } from "../src/effects/dispatch.ts";
import { select, type Path } from "../src/effects/paths.ts";
import { FOCUS_PATH } from "../src/app/top.ts";
import { label, rectangle, type Elem } from "../src/views/model.ts";
import { verticalLayout } from "../src/views/layout.ts";
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

    const text = container.textContent;
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

    // add-frame-coalescing: the routed repaint is paint-deferred (D2),
    // so force the pending frame before reading the drawn DOM
    spa.flush();

    const text = container.textContent;
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

describe("spa-mount — root sized to the drawn extent (tambor-8yn)", () => {
  it("the drawn root grows when an apply extends the view", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    // the view is n stacked labels over plain state: the extent grows
    // with the count, so an async apply (the worker-reply shape) must
    // grow the root's inline height, not let rows draw outside it
    const app = makeApp({
      view: (state) => {
        const rows: Elem[] = [];
        for (let i = 0; i < (state as { n: number }).n; i++) {
          rows.push(label(`row ${i}`));
        }
        // stacked like the demos draw them: translated rows, one per
        // measured line (verticalLayout) — the extent grows with n
        return verticalLayout(rows);
      },
      state: { n: 1 },
    });
    const spa = mountDemo(doc, container, () => app);
    const h = () =>
      Number(
        spa.root.host.style
          .getPropertyValue("height")
          .replace("px", ""),
      );
    // short view: the root stays at the viewport floor
    expect(h()).toBe(300);

    // grown view: the root tracks the drawn extent (450 unit-height
    // rows + gaps ≈ 899 — anything above 300 proves the sizing ran)
    app.dispatch([["set", [["keypath", "n"]], 450]]);
    expect(h()).toBeGreaterThan(300);
  });
});

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

// The opt-in debug global (add-spa-test-seams), reached structurally:
// tsconfig carries no DOM lib, and the mount publishes it on globalThis.
interface DebugGlobalLike {
  __tambor?: DebugSnapshot;
}

function debugGlobal(): DebugGlobalLike {
  return globalThis as DebugGlobalLike;
}

describe("spa-mount — opt-in debug snapshot (add-spa-test-seams)", () => {
  beforeEach(() => {
    delete debugGlobal().__tambor;
  });

  afterEach(() => {
    delete debugGlobal().__tambor;
  });

  it("publishes the demo, live state, raw view and draw count after the initial draw", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    // a stable view object makes the identity pin exact: app.view()
    // returns this same tree, so the handle must return app.view()'s
    // result — never a copy and never the cached/lane-wrapped tree
    const tree = label("debug");
    const app = makeApp({ view: () => tree, state: { n: 0 } });
    const spa = mountDemo(doc, container, () => app, {
      debug: true,
      demo: "counter",
    });

    const handle = debugGlobal().__tambor;
    if (handle === undefined) throw new Error("debug handle not published");
    expect(handle.demo).toBe("counter");
    expect(handle.state()).toBe(app.getState());
    expect(handle.view()).toBe(app.view());
    expect(handle.view()).toBe(tree);
    expect(handle.drawCount()).toBeGreaterThanOrEqual(1);

    // read-only-by-API: the exact surface is four reads — no setter, no
    // dispatch, no mutation path (any added key fails this key set)
    expect(Object.keys(handle).sort()).toEqual([
      "demo",
      "drawCount",
      "state",
      "view",
    ]);
    expect("dispatch" in handle).toBe(false);

    spa.unmount();
  });

  it("counts actual draws: a state-changing dispatch advances, a no-intent event does not", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const app = makeApp({
      view: (state) => label(`n=${(state as { n: number }).n}`),
      state: { n: 0 },
    });
    const spa = mountDemo(doc, container, () => app, {
      debug: true,
      demo: "counter",
    });
    const handle = debugGlobal().__tambor;
    if (handle === undefined) throw new Error("debug handle not published");
    const mounted = handle.drawCount();
    expect(mounted).toBeGreaterThanOrEqual(1);

    // a forwarded event over the bare label: the router finds no
    // handler, the intent list is empty, and the wire draws nothing
    // (event_pure / empty_batch_noop), so the count must not move
    const ME = mouseEventCtor();
    spa.surface.host.dispatchEvent(
      new ME("pointerdown", { clientX: 1, clientY: 1 }),
    );
    spa.surface.host.dispatchEvent(
      new ME("pointerup", { clientX: 1, clientY: 1 }),
    );
    expect(handle.drawCount()).toBe(mounted);

    // an async apply outside the wire (tambor-a45) re-draws once
    app.dispatch([["set", [["keypath", "n"]], 3]]);
    expect(handle.drawCount()).toBe(mounted + 1);
    expect(container.textContent).toContain("n=3");

    spa.unmount();
  });

  it("unmount deletes the handle; a mount without opts leaves the global alone", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const tree = label("x");

    const debugMount = mountDemo(
      doc,
      container,
      () => makeApp({ view: () => tree, state: {} }),
      { debug: true, demo: "todo" },
    );
    expect(debugGlobal().__tambor).toBeDefined();
    debugMount.unmount();
    expect(debugGlobal().__tambor).toBeUndefined();

    // no flag: the mount never creates the handle
    const plain = mountDemo(doc, container, () =>
      makeApp({ view: () => tree, state: {} }),
    );
    expect(debugGlobal().__tambor).toBeUndefined();
    plain.unmount();
    expect(debugGlobal().__tambor).toBeUndefined();

    // a stale global belongs to nobody here: a non-debug mount neither
    // overwrites nor clears it on unmount
    const stale: DebugSnapshot = {
      demo: "stale",
      state: () => ({ stale: true }),
      view: () => tree,
      drawCount: () => 0,
    };
    debugGlobal().__tambor = stale;
    const other = mountDemo(doc, container, () =>
      makeApp({ view: () => tree, state: {} }),
    );
    expect(debugGlobal().__tambor).toBe(stale);
    other.unmount();
    expect(debugGlobal().__tambor).toBe(stale);
  });
});

