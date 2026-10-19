// @vitest-environment jsdom
// Purpose: the lane-aware draw boundary (tambor-54j.3 Phase 2) — the
//   mount wire re-draws the already-derived cached tree under the lane
//   pan/scroll transform for lane-only batches, and never re-derives.
// Responsibilities: verify lane_draw_no_derive (a routed lane-only
//   batch costs zero derivations and exactly one draw of the cached
//   tree) and lane_transform_drawn (every wire draw applies the lane
//   pan/scroll translate — lane wins on position when a state change
//   re-derives mid-interaction; no lane offset leaves the drawn tree
//   unwrapped; the async re-render path draws the cached tree under
//   the transform too).
// Rationale: openspec/specs/interaction-lane/spec.md is the design
//   authority — one contract per VERIFIES link, derived by ah sync.
//   The BZ2 pan-as-transform verdict promoted to a corpus seam: the
//   60 Hz stream must not scale with tree size on the derive side
//   (Phase 1 removed the repaint scheduling; this removes the wire's
//   full re-draw re-derivation).

import { describe, expect, it } from "vitest";

import { mountDemo, type SpaHandle } from "../src/spa/mount.ts";
import { makeApp, type App, type ViewFn } from "../src/effects/dispatch.ts";
import { mouseDown, mouseMove } from "../src/events/event.ts";
import { button, label, on, type Elem, type Vec2 } from "../src/views/model.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";

function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

function containerIn(doc: HostDoc): HostElement {
  const c = doc.createElement("div");
  doc.body.appendChild(c);
  return c;
}

// An app whose view counts its derivations (the wire-floor meter).
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

// Capture every drawn tree (and count draws) by shadowing the
// instance method — the same property-lookup shape wire-floor uses.
function captureDraws(spa: SpaHandle): { count: () => number; last: () => Elem } {
  let d = 0;
  let drawn: Elem = null as unknown as Elem;
  const raw = spa.backend.draw.bind(spa.backend);
  (spa.backend as unknown as { draw: (view: Elem) => void }).draw = (view) => {
    d++;
    drawn = view;
    raw(view);
  };
  return { count: () => d, last: () => drawn };
}

function isTranslate(view: Elem): view is { type: "translate"; x: number; y: number; drawable: Elem } {
  return (view as { type?: string }).type === "translate";
}

describe("spa lane draw boundary (tambor-54j.3 Phase 2)", () => {
  it("p_lane_draw_no_derive: a routed lane-only batch draws the cached tree, deriving nothing", () => {
    const doc = hostDoc();
    const container = containerIn(doc);
    const { app, derives } = countingApp((state) =>
      on("mouse-move", () => [
        ["lane", "pan", (old: unknown) => [((old as Vec2 | undefined)?.[0] ?? 0) + 5, 0]],
      ], label(`n=${(state as { n: number }).n}`)));
    const spa = mountDemo(doc, container, () => app);
    const draws = captureDraws(spa);
    const d0 = derives();
    const w0 = draws.count();

    // the 60 Hz shape: consecutive move events, each a lane-only batch
    // (positions inside the label's small bounds — unit measure,
    // half-open hit-testing)
    spa.backend.deliver(mouseMove([0, 0]));
    spa.backend.deliver(mouseMove([1, 0]));
    spa.backend.deliver(mouseMove([2, 0]));

    // zero re-derivations across the whole stream — the view the route
    // cached is still valid (lane_outside_state: state identity)
    expect(derives() - d0).toBe(0);
    // one transform draw per event, of the cached tree
    expect(draws.count() - w0).toBe(3);
    const last = draws.last();
    expect(isTranslate(last)).toBe(true);
    expect(isTranslate(last) && [last.x, last.y]).toEqual([15, 0]);
    expect(app.getLane()).toEqual({ pan: [15, 0] });
  });

  it("p_lane_transform_drawn: a state change mid-interaction keeps the lane position", () => {
    const doc = hostDoc();
    const container = containerIn(doc);
    const { app, derives } = countingApp((state) =>
      on("mouse-move", () => [
        ["lane", "pan", () => [12, 34]],
      ], button("add", () => [["set", [["keypath", "n"]], (state as { n: number }).n + 1]])));
    const spa = mountDemo(doc, container, () => app);
    const draws = captureDraws(spa);

    // pan first (lane-only), then a real state change
    spa.backend.deliver(mouseMove([5, 5]));
    const derivesBeforeState = derives();
    spa.backend.deliver(mouseDown([1, 1]));

    // the state draw re-derives once (state wins on structure) but the
    // drawn tree still carries the lane's pan (lane wins on position)
    expect(derives() - derivesBeforeState).toBe(1);
    const last = draws.last();
    expect(isTranslate(last)).toBe(true);
    expect(isTranslate(last) && [last.x, last.y]).toEqual([12, 34]);
    expect(isTranslate(last) && (last.drawable as { type: string }).type).toBe("handler");
  });

  it("p_lane_transform_drawn: no lane offset leaves the drawn tree unwrapped", () => {
    const doc = hostDoc();
    const container = containerIn(doc);
    const { app } = countingApp((state) =>
      button("add", () => [["set", [["keypath", "n"]], (state as { n: number }).n + 1]]));
    const spa = mountDemo(doc, container, () => app);
    const draws = captureDraws(spa);

    spa.backend.deliver(mouseDown([1, 1]));

    // a lane that never held pan/scroll adds no translate wrapper
    expect(isTranslate(draws.last())).toBe(false);
  });

  it("p_lane_draw_no_derive: the async re-render path draws the cached tree under the transform", () => {
    const doc = hostDoc();
    const container = containerIn(doc);
    const { app, derives } = countingApp((state) => label(`n=${(state as { n: number }).n}`));
    const spa = mountDemo(doc, container, () => app);
    const draws = captureDraws(spa);
    const d0 = derives();
    const w0 = draws.count();

    // a lane-only dispatch OUTSIDE the event wire (the async apply
    // shape, tambor-a45): the rerender wrapper draws — but from the
    // cache, never a re-derivation
    app.dispatch([["lane", "pan", () => [7, 9]]]);

    expect(derives() - d0).toBe(0);
    expect(draws.count() - w0).toBe(1);
    const last = draws.last();
    expect(isTranslate(last)).toBe(true);
    expect(isTranslate(last) && [last.x, last.y]).toEqual([7, 9]);
  });
});
