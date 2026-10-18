// @vitest-environment jsdom
// Purpose: the wire floor bound (tambor-8xm) — the mount wire's cost on
//   events that change nothing must not scale with app state.
// Responsibilities: verify that (1) a no-op routed event (empty intent
//   list) re-derives nothing and draws nothing — the same
//   empty_batch_noop shape the headless wire pins (src/app/app.ts) —
//   and (2) a routed event that DOES change state re-derives exactly
//   once (the post-apply derivation) and draws exactly once, and (3)
//   the drawn tree is reused across consecutive no-ops (route-time
//   view cache over state identity — the state is only changed by
//   dispatch, so `app.getState()` identity is the invalidation signal).
// Rationale: openspec/specs/effect-dispatch/spec.md empty_batch_noop
//   ("an empty or nil batch calls no handler and triggers no repaint")
//   is the design authority; the mount wire used to re-derive and
//   re-draw unconditionally after every routed event, so a no-op click
//   on a large app cost two whole-tree derivations plus a full draw
//   (~250 ms on the 100k-cell spreadsheet vs 18-27 ms empty). The wire
//   is mounting plumbing: no app semantics change — a changed event
//   still derives and draws exactly as before, and async applies
//   outside the wire still re-render (tambor-a45, covered in
//   spa-mount.test.ts).

import { describe, expect, it } from "vitest";

import { mountDemo, type SpaHandle } from "../src/spa/mount.ts";
import { makeApp, type App, type ViewFn } from "../src/effects/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import { button, label, type Elem } from "../src/views/model.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";

function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

function containerIn(doc: HostDoc): HostElement {
  const c = doc.createElement("div");
  doc.body.appendChild(c);
  return c;
}

// An app whose view counts its derivations — the wire-floor meter.
function countingApp(view: ViewFn): { app: App; derives: () => number } {
  let n = 0;
  const app = makeApp({
    view: (state, context) => {
      n++;
      return view(state, context);
    },
    state: { n: 0 },
  });
  return { app, derives: () => n };
}

// Count the backend draws by shadowing the instance method (the draw
// calls all go through the same property lookup).
function countDraws(spa: SpaHandle): () => number {
  let d = 0;
  const raw = spa.backend.draw.bind(spa.backend);
  (spa.backend as unknown as { draw: (view: Elem) => void }).draw = (view) => {
    d++;
    raw(view);
  };
  return () => d;
}

describe("spa wire floor (tambor-8xm)", () => {
  it("a no-op event reuses the drawn tree: no re-derivation, no draw", () => {
    const doc = hostDoc();
    const container = containerIn(doc);
    const { app, derives } = countingApp((state) =>
      label(`n=${(state as { n: number }).n}`));
    const spa = mountDemo(doc, container, () => app);
    const draws = countDraws(spa);
    const d0 = derives();
    const w0 = draws();

    // a mouse-down no node handles: the router returns an empty intent
    // list, the state is untouched — the wire must do nothing further
    spa.backend.deliver(mouseDown([400, 400]));

    expect(derives() - d0).toBe(0);
    expect(draws() - w0).toBe(0);
    expect(container.textContent).toContain("n=0");
  });

  it("consecutive no-ops cost nothing beyond the first route", () => {
    const doc = hostDoc();
    const container = containerIn(doc);
    const { app, derives } = countingApp((state) =>
      label(`n=${(state as { n: number }).n}`));
    const spa = mountDemo(doc, container, () => app);
    const draws = countDraws(spa);
    spa.backend.deliver(mouseDown([400, 400]));
    const d0 = derives();
    const w0 = draws();

    spa.backend.deliver(mouseDown([400, 400]));
    spa.backend.deliver(mouseDown([400, 400]));

    expect(derives() - d0).toBe(0);
    expect(draws() - w0).toBe(0);
  });

  it("a state-changing event re-derives once and draws once", () => {
    const doc = hostDoc();
    const container = containerIn(doc);
    const { app, derives } = countingApp((state) =>
      button("add", () => [["set", [["keypath", "n"]], (state as { n: number }).n + 1]]));
    const spa = mountDemo(doc, container, () => app);
    const draws = countDraws(spa);
    const d0 = derives();
    const w0 = draws();

    // the button fires on mouse-down inside its bounds (bounds [1,1])
    spa.backend.deliver(mouseDown([1, 1]));

    expect(derives() - d0).toBe(1);
    expect(draws() - w0).toBe(1);
    expect(container.textContent).toContain("add");
  });

  it("the cache follows a state change: the next no-op still costs nothing", () => {
    const doc = hostDoc();
    const container = containerIn(doc);
    const { app, derives } = countingApp((state) =>
      button("add", () => [["set", [["keypath", "n"]], (state as { n: number }).n + 1]]));
    const spa = mountDemo(doc, container, () => app);
    const draws = countDraws(spa);
    spa.backend.deliver(mouseDown([1, 1]));
    const d0 = derives();
    const w0 = draws();

    spa.backend.deliver(mouseDown([400, 400]));

    expect(derives() - d0).toBe(0);
    expect(draws() - w0).toBe(0);
  });
});
