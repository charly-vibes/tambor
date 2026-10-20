// Purpose: the ephemeral interaction lane (tambor-54j.3) — the lane
//   store lives outside the persistent state, the ["lane", key, fn]
//   builtin applies to it, the ctx carries it per app, and lane-only
//   batches schedule no repaint.
// Responsibilities: verify lane_outside_state (state identity unchanged
//   across lane batches), lane_update_semantics (apply-in-order
//   lane[key] = fn(lane[key])), lane_ctx_reachable (per-app lane stores,
//   distinct across two concurrent apps, visible in ctx), and
//   lane_batch_no_repaint (lane-only batch → no repaint; a mixed batch
//   repaints exactly once and applies both effects).
// Rationale: openspec/specs/interaction-lane/spec.md is the design
//   authority — one contract per VERIFIES link, derived by ah sync.

import { describe, expect, it, vi } from "vitest";

import { makeApp, type App,} from "../src/effects/dispatch.ts";

// A repaint-counting app: every scheduled repaint is recorded instead
// of run (the same vi.stubGlobal shape example-counter's p_raw uses).
function repaintCountingApp(): { app: App; repaints: (() => void)[] } {
  const repaints: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
    repaints.push(cb);
    return repaints.length;
  });
  const app = makeApp({ view: () => null, state: { n: 0 } });
  return { app, repaints };
}

describe("interaction-lane", () => {
  it("p_lane_update: lane effects apply in batch order onto the lane store", () => {
    const { app } = repaintCountingApp();
    app.dispatch([
      ["lane", "pan", (old: unknown) => [(old as number[] | undefined)?.[0] ?? 0, 5]],
      [
        "lane",
        "pan",
        (old: unknown) => [((old as number[])[0] ?? 0) + 3, (old as number[])[1] ?? 0],
      ],
    ]);
    expect(app.getLane()).toEqual({ pan: [3, 5] });
  });

  it("p_state_identity: lane batches leave the state object identical", () => {
    const { app } = repaintCountingApp();
    const before = app.getState();
    app.dispatch([["lane", "drag", () => ({ from: [0, 0], to: [1, 1] })]]);
    app.dispatch([["lane", "pan", () => [9, 9]], ["lane", "scroll", () => [2, 2]]]);
    expect(app.getState()).toBe(before);
  });

  it("p_ctx_lane: each app holds its own lane store, visible in its ctx", () => {
    const seen: unknown[] = [];
    const view = (): null => null;
    const a = makeApp({
      view,
      state: 0,
      handler: (state, _effects, ctx) => {
        seen.push(ctx["lane"]);
        return state;
      },
    });
    const b = makeApp({
      view,
      state: 0,
      handler: (state, _effects, ctx) => {
        seen.push(ctx["lane"]);
        return state;
      },
    });
    // the lane write applies registry-style before the handler; a
    // following state effect runs the handler, whose ctx carries the
    // app's own lane (lane_ctx_reachable)
    a.dispatch([["lane", "k", () => 1]]);
    b.dispatch([["lane", "k", () => 2]]);
    a.dispatch([["get", [["keypath", "n"]]]]);
    b.dispatch([["get", [["keypath", "n"]]]]);
    expect(seen[0]).toBe(a.getLane());
    expect(seen[1]).toBe(b.getLane());
    expect(seen[0]).not.toBe(seen[1]);
    expect(a.getLane()).toEqual({ k: 1 });
    expect(b.getLane()).toEqual({ k: 2 });
  });

  it("p_no_repaint: a lane-only batch schedules no repaint", () => {
    const { app, repaints } = repaintCountingApp();
    app.dispatch([["lane", "pan", () => [1, 2]]]);
    app.dispatch([["lane", "pan", () => [3, 4]], ["lane", "drag", () => null]]);
    expect(repaints).toHaveLength(0);
  });

  it("p_mixed_batch: a mixed batch applies both effects and repaints exactly once", () => {
    const { app, repaints } = repaintCountingApp();
    const before = app.getState();
    app.dispatch([
      ["lane", "pan", () => [7, 7]],
      ["update", [["keypath", "n"]], (n: unknown) => (n as number) + 1],
    ]);
    expect(app.getLane()).toEqual({ pan: [7, 7] });
    expect(app.getState()).not.toBe(before);
    expect((app.getState() as { n: number }).n).toBe(1);
    expect(repaints).toHaveLength(1);
  });
});
