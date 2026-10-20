// Purpose: the drag-replay proof (tambor-54j.3 Phase 3, ticket
//   acceptance) — a drag's routed intent log with the lane-typed
//   effects removed reproduces the committed state exactly, and the
//   lane holds no history: the replay runs with an empty lane.
// Responsibilities: drive a scripted drag (mouse-down starts the
//   lane drag, mouse-move streams lane updates, mouse-up commits the
//   final position as a state update) through the same routing shape
//   the mounted wire uses (route against the current view, apply the
//   routed intents), record every routed intent, then replay the log
//   minus ["lane", ...] effects on a fresh app — the replayed state
//   equals the original state and the replay's lane is empty while the
//   original lane held the interaction values.
// Rationale: openspec/specs/interaction-lane/spec.md lane_replay_history
//   is the design authority — one contract per VERIFIES link, derived
//   by ah sync. This is the ticket's "drag does not enter the
//   persistent history" acceptance criterion: the lane effects are the
//   ONLY thing the replay drops, so anything else the drag wrote to
//   state would survive and break the equality.

import { describe, expect, it } from "vitest";

import { makeApp, type App, type Effect, type EffectContext, type ViewFn } from "../src/effects/dispatch.ts";
import { mouseDown, mouseMove, mouseUp, type TamborEvent } from "../src/events/event.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { on, rectangle, translate, type Elem, type Vec2 } from "../src/views/model.ts";
import type { IntentList } from "../src/core.ts";

// A draggable shape: the position lives in state; a drag streams the
// pointer through the lane and commits the final spot on mouse-up.
interface DragState {
  x: number;
  y: number;
}

type DragView = (state: DragState, context: EffectContext) => Elem;

function dragView(): DragView {
  return (state) =>
    // the shape's committed position is drawn from state (the translate
    // of the committed x/y); the sized rectangle gives the drag real
    // bounds (setSize's closed set: rectangles, not labels)
    translate(
      (state as DragState).x,
      (state as DragState).y,
      on("mouse-down", () => [
          // start the drag: the lane records the grab offset
          ["lane", "drag", () => ({ grab: [0, 0] })],
        ],
        on("mouse-move", (pos: unknown) => [
          // the 60 Hz stream: the lane wins on position, never state
          ["lane", "drag", (old: unknown) => ({
            grab: (old as { grab: Vec2 }).grab,
            at: pos as Vec2,
          })],
        ],
        on("mouse-up", (pos: unknown) => [
          // the ONLY event entering history: the commit intent
          ["set", [["keypath", "x"]], (pos as Vec2)[0]],
          ["set", [["keypath", "y"]], (pos as Vec2)[1]],
          ["lane", "drag", () => null],
        ],
        rectangle(100, 50)))),
    ) as Elem;
}

// The wire's routing shape (mount.ts route): route against the current
// view, hand the intents to app.dispatch. The harness returns the
// routed intents so the caller can record them.
function routeEvents(
  app: App,
  view: ViewFn,
  events: readonly TamborEvent[],
): IntentList[] {
  const log: IntentList[] = [];
  for (const ev of events) {
    const intents = dispatch(view(app.getState() as DragState, {}), ev);
    log.push(intents);
    if (intents.length > 0) app.dispatch(intents);
  }
  return log;
}

// positions stay inside the shape's bounds (half-open: 0 <= x < 100,
// 0 <= y < 50 — the hit-testing edge is exclusive, the wave-2 lesson)
const DRAG_SCRIPT = [
  mouseDown([12, 18]),
  mouseMove([15, 20]),
  mouseMove([40, 44]),
  mouseMove([63, 49]),
  mouseUp([70, 49]),
] as const;

describe("lane replay (tambor-54j.3 Phase 3)", () => {
  it("p_lane_replay: the drag log minus lane effects reproduces the committed state with an empty lane", () => {
    // the original drag: lane effects stream, the commit enters history
    const original = makeApp({
      view: dragView() as unknown as ViewFn,
      state: { x: 0, y: 0 },
    });
    const down = routeEvents(original, dragView() as unknown as ViewFn, DRAG_SCRIPT.slice(0, 4));
    // the drag really used the lane: the grab offset and the stream
    // positions live in the lane mid-drag, never in state
    const midLane = original.getLane();
    expect(midLane["drag"]).toEqual({ grab: [0, 0], at: [63, 49] });
    expect(original.getState()).toEqual({ x: 0, y: 0 });
    const up = routeEvents(original, dragView() as unknown as ViewFn, DRAG_SCRIPT.slice(4));
    const log = [...down, ...up];

    // the recorded log carries lane-typed effects to drop
    const laneEffects = log.flat().filter((e) => (e as Effect)[0] === "lane");
    expect(laneEffects.length).toBeGreaterThan(0);

    // the replay: the same log, lane effects removed, a fresh app —
    // the fresh lane starts untouched (null/absent) and STAYS untouched
    const replay = makeApp({
      view: dragView() as unknown as ViewFn,
      state: { x: 0, y: 0 },
    });
    for (const batch of log) {
      const committed = batch.filter((e) => (e as Effect)[0] !== "lane");
      if (committed.length > 0) replay.dispatch(committed as Effect[]);
    }

    expect(replay.getState()).toEqual(original.getState());
    expect((original.getState() as DragState).x).toBe(70); // the commit applied
    expect(replay.getLane()).toEqual({});

    // the committed output is drawn from state alone: the shape's
    // translate carries the committed x/y — the lane contributes nothing
    const view = original.view() as { type: string; x?: number; y?: number };
    expect(view.type).toBe("translate");
    expect(view.x).toBe(70);
    expect(view.y).toBe(49);
  });
});
