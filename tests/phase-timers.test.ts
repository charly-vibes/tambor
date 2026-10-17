// Purpose: contract tests for the opt-in phase timers of the dispatch
//   pipeline (tambor-54j.1) — the per-dispatch cost breakdown of the
//   chat-repo cold read §4.5/H1: handler · view derivation ·
//   reconcile/layout · paint · GC, exposed as buffered data.
// Responsibilities: encode the timer shape contract (record fields,
//   phase names, buffer behavior, opt-in/disable lifecycle, draw
//   attribution at the backend draw sites, wire attribution at the
//   route sites) plus the overhead meter — median per-dispatch cost
//   disabled vs enabled over a simple in-test workload.
// Rationale: docs/reference/chat-repo-cold-read §4.5 ("Phase split
//   (tambor-specific): handler · view derivation · reconcile/layout ·
//   paint · GC — needs phase timers in dispatch (not present)") is the
//   design authority; the actual phase boundaries are the code's wire
//   sites (Runtime.send, makeHeadlessApp.send, the SPA surface wire)
//   and the backend draw sites. Instrumentation is opt-in: with timers
//   disabled the seams are no-ops and the buffer stays empty.

import { expect, it, describe } from "vitest";

// The Web performance clock, outside tsconfig's ES2022 lib (see the
// house pattern in tests/interop-seam.test.ts).
declare const performance: { now(): number };

import { keyPress, mouseDown } from "../src/events/event.ts";
import { phaseTimers } from "../src/events/phase-timers.ts";
import { on, spacer, type Elem } from "../src/views/model.ts";
import { makeHeadlessApp } from "../src/app/app.ts";
import { CanvasBackend } from "../src/render/canvas.ts";
import { DomBackend } from "../src/render/dom.ts";
import { label, rectangle } from "../src/views/nodes.ts";

const PHASES = ["handler", "derive", "reconcile_layout", "paint", "gc"] as const;

// A routed-event workload over the real wire: 40 concat-kind handler
// nodes (key-press visits every child in order), each producing one
// state update, so a dispatch exercises routing, handler application
// and view re-derivation.
function handlerView(): readonly Elem[] {
  return Array.from({ length: 40 }, (_, i) =>
    on("key-press", () => [["update", [["keypath", "n"]], (n: unknown) => (n as number) + 1]],
      spacer(i, i)),
  );
}

function timedApp() {
  return makeHeadlessApp({
    view: () => handlerView(),
    state: { n: 0 },
  });
}

describe("phase-timers contract", () => {
  it("is disabled by default: routed events record nothing", () => {
    expect(phaseTimers.enabled()).toBe(false);
    const app = timedApp();
    app.send(keyPress("a"));
    app.send(keyPress("b"));
    expect(phaseTimers.drain()).toEqual([]);
  });

  it("a drained record has the §4.5 phase shape with finite non-negative numbers", () => {
    phaseTimers.enable();
    try {
      const app = timedApp();
      app.send(keyPress("a"));
      const records = phaseTimers.drain();
      expect(records.length).toBe(1);
      const record = records[0]!;
      expect(record.event).toBe("key-press");
      expect(Object.keys(record.phases).sort()).toEqual([...PHASES].sort());
      for (const phase of PHASES) {
        const ms = record.phases[phase];
        expect(Number.isFinite(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(0);
      }
      // GC is a documented non-goal in the module header: JS exposes no
      // per-dispatch GC attribution inside the dispatch path, so the
      // field exists in the shape but reads 0 until an external meter
      // populates it.
      expect(record.phases.gc).toBe(0);
    } finally {
      phaseTimers.disable();
    }
  });

  it("buffers one record per routed event, in order, with the event kind", () => {
    phaseTimers.enable();
    try {
      const app = timedApp();
      app.send(keyPress("a"));
      app.send(keyPress("b"));
      app.send(keyPress("c"));
      const records = phaseTimers.drain();
      expect(records.map((r) => r.event)).toEqual(["key-press", "key-press", "key-press"]);
      expect(phaseTimers.drain()).toEqual([]);
    } finally {
      phaseTimers.disable();
    }
  });

  it("disable stops recording and clears the buffer", () => {
    phaseTimers.enable();
    const app = timedApp();
    app.send(keyPress("a"));
    phaseTimers.disable();
    expect(phaseTimers.enabled()).toBe(false);
    expect(phaseTimers.drain()).toEqual([]);
    app.send(keyPress("b"));
    expect(phaseTimers.drain()).toEqual([]);
  });

  it("the backend wire (Runtime.send + draw) attributes the routed record and closes it at the dom draw", () => {
    phaseTimers.enable();
    try {
      // A runtime-backed backend routes deliver through Runtime.send
      // (handler + derive spans) and then drawView, whose element-tree
      // rebuild is the reconcile_layout span that closes the record.
      const backend = new DomBackend({
        view: () => handlerView(),
        state: { n: 0 },
      });
      backend.deliver(keyPress("a"));
      const records = phaseTimers.drain();
      expect(records.length).toBe(1);
      expect(records[0]!.event).toBe("key-press");
      expect(records[0]!.phases.gc).toBe(0);
    } finally {
      phaseTimers.disable();
    }
  });

  it("the canvas draw site attributes paint to the open record and a recordless draw records nothing", () => {
    phaseTimers.enable();
    try {
      const backend = new CanvasBackend({
        view: () => [label("hi"), rectangle(10, 10)] as Elem,
        state: { n: 0 },
      });
      // a draw with no open wire record (e.g. resize) drops its timing
      backend.draw([label("resize")] as Elem);
      expect(phaseTimers.drain()).toEqual([]);

      backend.runtime!.send(mouseDown([1, 1]));
      backend.drawView();
      const records = phaseTimers.drain();
      expect(records.length).toBe(1);
      expect(records[0]!.event).toBe("mouse-down");
      expect(records[0]!.phases.gc).toBe(0);
    } finally {
      phaseTimers.disable();
    }
  });
});

describe("phase-timers overhead meter", () => {
  it("median per-dispatch overhead of enabled vs disabled stays within the recorded bound", () => {
    const N = 300;
    const WARMUP = 30;
    const app = timedApp();

    const medianOf = (samples: number[]): number => {
      const sorted = [...samples].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)]!;
    };
    const run = (): number => {
      const samples: number[] = [];
      for (let i = 0; i < WARMUP; i++) app.send(keyPress("a"));
      for (let i = 0; i < N; i++) {
        const t0 = performance.now();
        app.send(keyPress("a"));
        samples.push(performance.now() - t0);
      }
      return medianOf(samples);
    };

    phaseTimers.disable();
    const disabled = run();
    phaseTimers.enable();
    phaseTimers.drain();
    const enabled = run();
    phaseTimers.disable();

    const overhead = enabled - disabled;
    // The recorded meter contract: enabling the timers must not multiply
    // the dispatch cost; the generous bound guards against accidental
    // always-on work, not against noise. The measured delta is logged
    // here and recorded in the ticket (tambor-54j.1).
    console.log(
      `[phase-timers meter] median disabled=${disabled.toFixed(4)}ms enabled=${enabled.toFixed(4)}ms delta=${overhead >= 0 ? "+" : ""}${overhead.toFixed(4)}ms over ${N} dispatches (40-handler key-press wire)`,
    );
    expect(enabled).toBeLessThan(disabled * 5 + 0.05);
    expect(
      overhead,
      `median disabled=${disabled.toFixed(4)}ms enabled=${enabled.toFixed(4)}ms delta=${overhead.toFixed(4)}ms`,
    ).toBeTypeOf("number");
  });
});
