// @vitest-environment jsdom
// Purpose: the standalone 60 Hz pointer-stream microbench (tambor-54j.3
//   Phase 3, ticket acceptance) — a 60-move drag stream over the
//   mounted wire shows a FLAT derive count (primary, machine
//   independent) and the paired per-event cost meter against the
//   state-committing baseline (recorded, unasserted — findings-8xm:
//   never compare across machine states, paired same-machine only).
// Responsibilities: the deterministic tripwires — (a) a 60-event move
//   stream through the wire costs ZERO view derivations (Phase 1+2:
//   no repaint scheduling, no re-derive) and exactly one draw per
//   event; (b) every draw re-uses the SAME cached tree object (a fresh
//   derivation would produce a fresh Elem) under a fresh translate
//   wrapper; (c) the state object is identical after the whole stream
//   (lane_outside_state); (d) the paired meter prints per-event
//   medians for the lane arm vs the state arm (each move commits
//   state — the pre-lane membrane shape, BZ2/BZ3) and their ratio.
// Rationale: the ticket's "60 Hz benchmark shows no per-event full
//   re-derivation" acceptance criterion. The derive-count tripwire is
//   the machine-independent evidence; the wall-clock meter rides on
//   machine state (the findings-kit J8 lesson) so it is printed for
//   the record, never asserted against a ratio. Standalone per the
//   ticket note — NOT the 54j.4 Playwright harness. The 30s budget is
//   the wave-3 pattern (compute-heavy bench tests trip the 5s default
//   under parallel load).

import { expect, test } from "vitest";
// @ts-expect-error node:perf_hooks has no type declarations here
import { performance } from "node:perf_hooks";

import { mountDemo, type SpaHandle } from "../src/spa/mount.ts";
import { makeApp, type App, type ViewFn } from "../src/effects/dispatch.ts";
import { mouseMove, type TamborEvent } from "../src/events/event.ts";
import { on, rectangle, translate, label, type Elem, type Vec2 } from "../src/views/model.ts";

// the filler subtree: enough nodes that the state arm's per-event
// derivation is measurable against the draw walk both arms pay
const FILLER = 400;
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";

const OPS = 60; // one simulated second of 60 Hz pointer moves
const SAMPLES = 3;
const TIMEOUT = 30_000;

function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

function containerIn(doc: HostDoc): HostElement {
  const c = doc.createElement("div");
  doc.body.appendChild(c);
  return c;
}

// A draggable shape whose handler either streams the lane (the
// Phase-2 arm) or commits state per move (the pre-lane baseline).
// The sized rectangle gives the drag real bounds (half-open hit
// testing: 0 <= x < 100, 0 <= y < 50).
function dragApp(arm: "lane" | "state"): { app: App; derives: () => number } {
  let n = 0;
  const view: ViewFn = (_state) =>
    translate(
      0,
      0,
      on("mouse-move", (pos: unknown) =>
        arm === "lane"
          ? [["lane", "pan", (old: unknown) => [
              ((old as Vec2 | undefined)?.[0] ?? 0) + 1,
              (old as Vec2 | undefined)?.[1] ?? 0,
            ]]]
          : [["set", [["keypath", "x"]], (pos as Vec2)[0]]],
        rectangle(100, 50),
        ...Array.from({ length: FILLER }, (_, i) => label(`row-${i}`)),
      ) as Elem,
    );
  const app = makeApp({
    view: (state, context) => {
      n++;
      return view(state, context);
    },
    state: { x: 0, y: 0 },
  });
  return { app, derives: () => n };
}

// Shadow the backend draw to count draws and capture every drawn tree.
function drawSpy(spa: SpaHandle): { draws: () => number; trees: () => Elem[] } {
  const trees: Elem[] = [];
  const raw = spa.backend.draw.bind(spa.backend);
  (spa.backend as unknown as { draw: (view: Elem) => void }).draw = (view) => {
    trees.push(view);
    raw(view);
  };
  return { draws: () => trees.length, trees: () => trees };
}

function stream(spa: SpaHandle): void {
  for (let i = 0; i < OPS; i++) {
    const ev: TamborEvent = mouseMove([i % 100, (i * 7) % 50]);
    spa.backend.deliver(ev);
  }
}

test("60 Hz stream over the wire: zero derivations, one draw per event, one cached tree", { timeout: TIMEOUT }, () => {
  const doc = hostDoc();
  const container = containerIn(doc);
  const { app, derives } = dragApp("lane");
  const spa = mountDemo(doc, container, () => app);
  const { draws, trees } = drawSpy(spa);
  const d0 = derives();
  const w0 = draws();
  const stateBefore = app.getState();

  stream(spa);

  // the primary metric, machine-independent: the derive count is FLAT
  // across the whole 60 Hz stream — no per-event full re-derivation
  expect(derives() - d0).toBe(0);
  // exactly one draw per event (the Phase-2 transform draw)
  expect(draws() - w0).toBe(OPS);
  // every draw wraps the SAME cached tree object — a fresh derivation
  // would produce a fresh Elem under the translate wrapper
  const inner = trees().map((t) => (t as { drawable?: Elem }).drawable);
  expect(new Set(inner).size).toBe(1);
  // and the state never moved (lane_outside_state)
  expect(app.getState()).toBe(stateBefore);
  spa.unmount();
});

test(
  "paired meter: lane arm vs state arm per-event medians (recorded, unasserted)",
  { timeout: TIMEOUT },
  () => {
    const doc = hostDoc();
    const medians: { lane: number[]; state: number[] } = { lane: [], state: [] };
    for (let s = 0; s < SAMPLES; s++) {
      const order = s % 2 === 0 ? (["lane", "state"] as const) : (["state", "lane"] as const);
      for (const arm of order) {
        const container = containerIn(doc);
        const { app } = dragApp(arm);
        const spa = mountDemo(doc, container, () => app);
        // warmup (untimed): pays the first-draw costs
        spa.backend.deliver(mouseMove([1, 1]));
        spa.backend.deliver(mouseMove([2, 1]));
        const times: number[] = [];
        for (let i = 0; i < OPS; i++) {
          const ev = mouseMove([(i + 3) % 100, (i * 7) % 50]);
          const t0 = performance.now();
          spa.backend.deliver(ev);
          times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        medians[arm].push(times[Math.floor(OPS / 2)]!);
        spa.unmount(); // the surface IS the root — unmount removes it
      }
    }
    const median = (xs: readonly number[]): number =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const lane = median(medians.lane);
    const state = median(medians.state);
     
    console.log(
      `[lane-60hz meter] lane median ${lane.toFixed(3)} ms/event, ` +
        `state median ${state.toFixed(3)} ms/event, ratio ` +
        `${(lane / state).toFixed(3)} (${OPS} moves, ${SAMPLES} interleaved samples)`,
    );
    // sanity only — the ratio rides on machine state (findings-8xm)
    expect(lane).toBeGreaterThan(0);
    expect(state).toBeGreaterThan(0);
  },
);
