// @vitest-environment jsdom
// Purpose: the opt-in derive/rebuild/draw counters (add-runtime-invalidation
//   §4.0) — the mount's counters option enables the phase-timers DispatchCounts
//   seam and the debug snapshot exposes counts() next to drawCount; split from
//   runtime-invalidation-render.test.ts for the 400-line test-file gate.
// Responsibilities: pin that an enabled mount records derive/draw with zero
//   rebuild on a short-circuited frame and one rebuild on a rebuilt frame, and
//   that a disabled mount leaves the counts at their defaults.
// Rationale: the counters ride the landed phase-timers enable/disable seam
//   (tambor-54j.1 pattern) with zero cost when off; identity semantics under
//   the counters live in runtime-invalidation-render.test.ts.

import { describe, expect, it, vi } from "vitest";

import { makeApp, type App, type Effect } from "../src/effects/dispatch.ts";
import { mountDemo } from "../src/spa/mount.ts";
import { phaseTimers } from "../src/events/phase-timers.ts";
import { label, type Elem } from "../src/views/model.ts";
import { hostDoc } from "./helpers/runtime-invalidation-rig.ts";

// jsdom DOES ship an async rAF (pretendToBeVisual); stubbing it queues
// callbacks the tests never pump — the draws under test are synchronous
// wire draws (see runtime-invalidation-render.test.ts stubFrames note).
function stubFrames(): number[] {
  const frames: number[] = [];
  vi.stubGlobal("requestAnimationFrame", (_cb: () => void) => {
    frames.push(0);
    return frames.length;
  });
  return frames;
}

describe("runtime-invalidation — opt-in counters (add-runtime-invalidation §4.0)", () => {
  // The counters shape, declared red-side like the commit contracts
  // above: the mount handle exposes a counts() accessor next to
  // drawCount(), reading the phase-timers seam (phase-timers.ts).
  interface DispatchCountsShape {
    readonly derive: number;
    readonly rebuild: number;
    readonly draw: number;
  }
  interface CountingSnapshot {
    drawCount(): number;
    counts(): DispatchCountsShape;
  }

  // The mounted rig with the debug snapshot, opting the counters in or
  // out via the mount option that mirrors the phase-timers enable
  // seam. mode "immediate": dispatch draw tails run synchronously, no
  // frame pumping needed. The `counters` option is GREEN-phase work,
  // reached structurally like the commit contracts above.
  function countingMount(app: App, counters: boolean): CountingSnapshot {
    stubFrames();
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const options = { debug: true, counters, mode: "immediate" };
    mountDemo(
      doc,
      container,
      () => app,
      options as unknown as Parameters<typeof mountDemo>[3],
    );
    // The snapshot is a published test seam — a named read with a
    // one-line reason, not an inline member access.
    const host = globalThis as { __tambor?: CountingSnapshot };
    return host.__tambor!;
  }

  function memoApp(): App {
    let drawn: Elem | null = null;
    let from: unknown = null;
    return makeApp({
      view: (state) => {
        const current = (state as { rows: string[] }).rows;
        if (drawn !== null && from === current) return drawn;
        from = current;
        drawn = current.map((t) => label(t));
        return drawn;
      },
      state: { rows: ["a", "b", "c"], tick: 0 },
    });
  }

  // state-changing dispatch whose derive is identity-equal (memo hit):
  // the update touches `tick` only — the rows slice keeps its reference,
  // so the memo-stable view returns the SAME Elem identity. An update
  // that copied rows ([...r]) would break identity and rebuild (that is
  // `append`'s job).
  const tick = (): Effect => [
    "update",
    [["keypath", "tick"]],
    (t: unknown) => (t as number) + 1,
  ];
  // state-changing dispatch with a new view identity
  const append = (): Effect => [
    "update",
    [["keypath", "rows"]],
    (r: unknown) => [...(r as string[]), "d"],
  ];

  // RED documented: against the pre-edit code there is no `counters`
  // mount option, no counts() on the snapshot handle and no counter
  // seam in phase-timers — the test fails on the first `snapshot.counts()`
  // read returning undefined, never on rig plumbing.
  it("with counters on, a dispatch records derive/draw with rebuild 0 on a short-circuited frame and 1 on a rebuild", () => {
    phaseTimers.disable();
    try {
      const app = memoApp();
      const snapshot = countingMount(app, true);
      // baseline right after the initial draw
      const before = snapshot.counts();

      // short-circuited frame: one derive, one draw, ZERO rebuilds
      app.dispatch(tick());
      const afterSkip = snapshot.counts();
      expect(afterSkip.draw - before.draw).toBe(1);
      expect(afterSkip.rebuild - before.rebuild).toBe(0);
      expect(afterSkip.derive - before.derive).toBe(1);

      // rebuilt frame: one derive, one draw, ONE rebuild
      app.dispatch(append());
      const afterRebuild = snapshot.counts();
      expect(afterRebuild.draw - afterSkip.draw).toBe(1);
      expect(afterRebuild.rebuild - afterSkip.rebuild).toBe(1);
      expect(afterRebuild.derive - afterSkip.derive).toBe(1);
    } finally {
      phaseTimers.disable();
      vi.unstubAllGlobals();
    }
  });

  // RED documented: pre-edit there is nothing to opt out of — the
  // assertion pins the seam's own contract (zero cost when off): the
  // reads never throw and stay at their defaults while draws still
  // happen.
  it("with counters off the reads stay at their defaults and never throw, while draws still happen", () => {
    phaseTimers.disable();
    try {
      const app = memoApp();
      const snapshot = countingMount(app, false);
      expect(snapshot.counts()).toEqual({ derive: 0, rebuild: 0, draw: 0 });

      app.dispatch(tick());
      app.dispatch(append());

      expect(snapshot.drawCount()).toBeGreaterThan(0);
      expect(snapshot.counts()).toEqual({ derive: 0, rebuild: 0, draw: 0 });
    } finally {
      phaseTimers.disable();
      vi.unstubAllGlobals();
    }
  });
});