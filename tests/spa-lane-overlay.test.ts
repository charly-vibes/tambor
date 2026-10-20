// @vitest-environment jsdom
// Purpose: the drag overlay seam (tambor-54j.3 Phase 4) — while a lane
//   entry carries an overlay renderer, every wire draw renders the
//   overlay's Elem on top of the lane-transformed tree; the drag
//   streams ride the cached tree (zero re-derivations) with the dragged
//   shape re-drawn at the lane position, a mid-drag state change
//   re-derives but keeps the overlay, and the commit (drag cleared)
//   draws the tree alone.
// Responsibilities: verify lane_overlay_drawn in
//   openspec/specs/interaction-lane/spec.md — one contract per VERIFIES
//   link, derived by ah sync. The overlay is a lane-carried renderer
//   `(entry) => Elem`; the wire calls it with its lane entry at draw
//   time and appends the result AFTER the tree (DOM order = on top).
// Rationale: the design note's Phase 4 — overlay lane (dragged shape
//   re-drawn from lane position). Single-drag scope v1: one "drag"
//   entry, its renderer drawn once; the overlay is draw-only, so
//   routing semantics (the pointer stream hits the tree's own
//   handlers) are untouched.

import { describe, expect, it } from "vitest";

import { mountDemo, type SpaHandle } from "../src/spa/mount.ts";
import { makeApp, type App } from "../src/effects/dispatch.ts";
import { mouseDown, mouseMove, mouseUp } from "../src/events/event.ts";
import { rectangle, translate, on, type Elem, type Vec2 } from "../src/views/model.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";

function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

function containerIn(doc: HostDoc): HostElement {
  const c = doc.createElement("div");
  doc.body.appendChild(c);
  return c;
}

interface DragEntry {
  grab: Vec2;
  at: Vec2 | null;
  overlay?: (entry: unknown) => Elem;
}

// The dragged shape re-drawn from the lane position: the shape's
// committed Elem translated by (at - grab). The renderer receives its
// lane entry (the app closures know their own shape).
function dragOverlay(entry: unknown): Elem {
  const e = entry as DragEntry;
  const dx = e.at === null ? 0 : e.at[0] - e.grab[0];
  const dy = e.at === null ? 0 : e.at[1] - e.grab[1];
  return translate(dx, dy, rectangle(100, 50));
}

// A draggable shape at the state position; the drag streams through
// the lane and commits on mouse-up (the lane-replay shape, mounted).
// A second button sits at a fixed spot away from the shape so a
// mid-drag state change can be routed without ending the drag.
function dragApp(): { app: App; derives: () => number } {
  let n = 0;
  const app = makeApp({
    state: { x: 0, y: 0 },
    view: (state, context) => {
      void context;
      n++;
      const shape = on(
        "mouse-down",
        () => [["lane", "drag", () => ({ grab: [0, 0], at: null, overlay: dragOverlay })]],
        on(
          "mouse-move",
          (pos: unknown) => [
            ["lane", "drag", (old: unknown) => {
              const o = old as DragEntry;
              return { grab: o.grab, at: pos as Vec2, overlay: o.overlay };
            }],
          ],
          on(
            "mouse-up",
            (pos: unknown) => [
              ["set", [["keypath", "x"]], (pos as Vec2)[0]],
              ["set", [["keypath", "y"]], (pos as Vec2)[1]],
              ["lane", "drag", () => null],
            ],
            rectangle(100, 50),
          ),
        ),
      );
      return [
        translate((state as { x: number; y: number }).x, (state as { y: number }).y, shape),
        translate(0, 200, on("mouse-down", () => [["set", [["keypath", "n"]], n + 1]], rectangle(40, 20))),
      ];
    },
  });
  return { app, derives: () => n };
}

function captureDraws(spa: SpaHandle): { last: () => Elem } {
  let drawn: Elem = null as unknown as Elem;
  const raw = spa.backend.draw.bind(spa.backend);
  (spa.backend as unknown as { draw: (view: Elem) => void }).draw = (view) => {
    drawn = view;
    raw(view);
  };
  return { last: () => drawn };
}

function isTranslate(view: Elem): view is { type: "translate"; x: number; y: number; drawable: Elem } {
  return (view as { type?: string }).type === "translate";
}

describe("spa lane overlay (tambor-54j.3 Phase 4)", () => {
  it("p_lane_overlay_drawn: the drag stream draws the overlay on top, deriving nothing", () => {
    const doc = hostDoc();
    const { app, derives } = dragApp();
    const spa = mountDemo(doc, containerIn(doc), () => app);
    const draws = captureDraws(spa);
    const d0 = derives();

    // start the drag and stream moves (all inside the shape's bounds:
    // half-open, positioned strictly inside [0,100)x[0,50))
    spa.backend.deliver(mouseDown([5, 5]));
    spa.backend.deliver(mouseMove([6, 5]));
    spa.backend.deliver(mouseMove([9, 8]));

    // the stream is lane-only: zero re-derivations, one draw per event
    expect(derives() - d0).toBe(0);
    const last = draws.last();
    // the overlay rides ON TOP of the tree: a group [tree, overlay]
    expect(Array.isArray(last)).toBe(true);
    const group = last as readonly Elem[];
    expect(group.length).toBe(2);
    // the bottom layer is the tree (an array: the shape at its
    // committed spot [0,0] plus the second button) — the layer is the
    // SAME derived tree the route cached, not a re-derivation
    expect(Array.isArray(group[0])).toBe(true);
    const shapeLayer = (group[0] as readonly Elem[])[0]!;
    expect(isTranslate(shapeLayer) && [shapeLayer.x, shapeLayer.y]).toEqual([0, 0]);
    // the top layer is the overlay at the lane position: at - grab
    expect(isTranslate(group[1]!) && [group[1]!.x, group[1]!.y]).toEqual([9, 8]);
    expect(app.getLane()).toEqual({ drag: { grab: [0, 0], at: [9, 8], overlay: dragOverlay } });
  });

  it("p_lane_overlay_drawn: a mid-drag state change re-derives but keeps the overlay", () => {
    const doc = hostDoc();
    const { app, derives } = dragApp();
    const spa = mountDemo(doc, containerIn(doc), () => app);
    const draws = captureDraws(spa);
    const d0 = derives();

    // hold the drag, then commit a state change elsewhere (the button
    // at [0,200)) — lane wins on position, state wins on structure
    spa.backend.deliver(mouseDown([5, 5]));
    spa.backend.deliver(mouseDown([2, 210]));

    // the state batch re-derived exactly once for the routed apply
    expect(derives() - d0).toBeGreaterThan(0);
    const last = draws.last();
    expect(Array.isArray(last)).toBe(true);
    const group = last as readonly Elem[];
    // the fresh tree below (an array: shape + button now updated in
    // it), the overlay on top (at is still null → zero delta)
    expect(Array.isArray(group[0])).toBe(true);
    expect(isTranslate(group[1]!) && [group[1]!.x, group[1]!.y]).toEqual([0, 0]);
  });

  it("p_lane_overlay_drawn: the commit draw carries no overlay", () => {
    const doc = hostDoc();
    const { app, derives } = dragApp();
    const spa = mountDemo(doc, containerIn(doc), () => app);
    const draws = captureDraws(spa);

    // drag, then commit: mouse-up writes the state and clears the lane
    spa.backend.deliver(mouseDown([5, 5]));
    spa.backend.deliver(mouseUp([30, 20]));

    const last = draws.last();
    // no overlay layer: the committed output is the bare tree (an
    // array — shape first, at its committed spot [30,20]) drawn from
    // state alone, NOT a [tree, overlay] group
    expect(Array.isArray(last)).toBe(true);
    const tree = last as readonly Elem[];
    expect(tree.length).toBe(2);
    expect(Array.isArray(tree[0])).toBe(false);
    expect(isTranslate(tree[0]!) && [tree[0]!.x, tree[0]!.y]).toEqual([30, 20]);
    expect(app.getLane()).toEqual({ drag: null });
    // the only history: the commit's state write
    expect((app.getState() as { x: number; y: number }).x).toBe(30);
  });
});
