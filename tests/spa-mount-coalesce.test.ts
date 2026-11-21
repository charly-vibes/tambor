// @vitest-environment jsdom
// Purpose: the frame-coalescing red tests (add-frame-coalescing tasks
//   1.1, 1.3, 1.4) — the SPA mount paints once per animation frame by
//   default, the "immediate" mode opt-out restores per-dispatch
//   repaint, and the handle's flush() drains a pending draw
//   synchronously (including the no-rAF fallback, D2).
// Responsibilities: pin (1.1) two dispatches inside one frame → exactly
//   one backend draw with state applied in dispatch order, (1.3) the
//   opt-out shape, (1.4) flush forces exactly one pending draw and
//   no-rAF environments flush synchronously instead of never painting.
// Rationale: openspec/changes/add-frame-coalescing/design.md D1–D3 —
//   apply-immediate, paint-deferred; the coalescer lives at the mount
//   boundary, so the spy is the DomBackend draw (drawCount is the
//   single draw path every actual draw goes through).
// GREEN-phase correction: the suite initially failed on rig plumbing,
// not missing behavior — the pastes never routed because the rig never
// focused the new-todo textarea, and the textarea's clipboard rules are
// focus-gated (empty intents → no state, no draw). mounted() now
// dispatches request-focus before the spy install, exactly like the
// working paste rig in tests/spa-mount-input.test.ts. Note jsdom here
// DOES ship an async rAF (pretendToBeVisual), which is why every test
// stubs rAF explicitly; see the no-rAF test's comment below.

import { describe, expect, it, vi } from "vitest";

import { mountSpa } from "../src/spa/todo-spa.ts";
import { mountDemo } from "../src/spa/mount.ts";
import { makeApp, defeffect } from "../src/effects/dispatch.ts";
import { mouseMove } from "../src/events/event.ts";
import { label, on, type Elem, type Vec2 } from "../src/views/model.ts";
import {
  NEXT_TEXT_PATH,
  todoApp,
  todoState,
  type TodoState,
} from "../src/examples/todo/todo.ts";
import { centreOf, toggleOptionOf } from "./helpers/appview.ts";
import type { SpaHandle } from "../src/spa/mount.ts";
import type { HostDoc } from "../src/interop/domhost.ts";
import type { Path } from "../src/effects/paths.ts";

// The rig's textarea-effect seam: the todo demo's bare makeApp carries
// no textarea edit bridge — insert-text is wired per-demo (the editor
// example routes EDIT_INTENTS through its own makeApp handler), so an
// unregistered paste drops silently at the global registry (tap>), and
// the surface→intent→state→paint pipeline the coalescer wraps never
// runs. Register the minimal membrane-profile shape (["insert-text",
// text, textPath, extraPath] → set textPath) so pastes exercise the
// live dispatch path this file's subject depends on.
defeffect("insert-text", (dispatch, ...raw: unknown[]) => {
  dispatch(["set", raw[1] as Path, raw[0]]);
});

// The mounted test rig: the SPA handle plus the draw spy installed
// after the initial draw, so every assertion counts only post-mount
// draws.
interface Mounted {
  spa: SpaHandle;
  drawSpy: ReturnType<typeof vi.spyOn>;
}

function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

// The fake frame pump: rAF callbacks queue instead of scheduling, and
// the test pumps exactly one frame between dispatch and assertion.
function stubFrames(): (() => void)[] {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
    frames.push(cb);
    return frames.length;
  });
  return frames;
}

function pump(frames: (() => void)[]): void {
  frames.splice(0).forEach((cb) => cb());
}

// A dispatched paste (the routed text-insert path): every paste is a
// corpus wire round trip whose (focused) textarea clipboard rule
// returns an insert-text intent, the rig's registry seam above applies
// it to next-todo-text, and the paint schedules deferred — the
// dispatch shape the burst scenarios coalesce. Returns the routed
// event the surface forwards.
function paste(text: string): unknown {
  // The Event constructor, reached structurally (no lib.dom in tsconfig).
  const ctor = (globalThis as unknown as { Event?: unknown }).Event;
  if (typeof ctor !== "function") throw new Error("Event unavailable");
  const ev = new (ctor as new (
    type: string,
    init?: { cancelable?: boolean },
  ) => object)("paste", { cancelable: true });
  Object.defineProperty(ev, "clipboardData", {
    value: { getData: () => text },
  });
  return ev;
}

// A mounted todo SPA with the draw spy installed after the initial
// draw, so every assertion counts only post-mount draws.
function mounted(opts?: Parameters<typeof mountSpa>[2]): Mounted {
  const doc = hostDoc();
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const spa = mountSpa(doc, container, opts);
  // The textarea clipboard rules are focus-gated (unfocused → empty
  // intents → no routed paint at all): focus the new-todo textarea the
  // same way the working sibling rig does
  // (tests/spa-mount-input.test.ts), so a paste routes the textarea's
  // insert-text intent. Dispatched before the spy install, so its
  // synchronous rerender draw stays out of every count.
  spa.app.dispatch(["request-focus", NEXT_TEXT_PATH]);
  const drawSpy = vi.spyOn(spa.backend, "draw");
  return { spa, drawSpy };
}

function dispatchPaste(spa: SpaHandle, text: string): void {
  spa.surface.host.dispatchEvent(paste(text));
}

// The Event constructor, reached structurally (no lib.dom in tsconfig).
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

// A routed click (pointerdown + pointerup, the same shape the
// spa-mount routed-click test uses) at a view-tree position. The
// routed round trip applies state and schedules the deferred paint —
// the dispatch shape that changes observable state.
function click(spa: SpaHandle, x: number, y: number): void {
  const ME = mouseEventCtor();
  spa.surface.host.dispatchEvent(new ME("pointerdown", { clientX: x, clientY: y }));
  spa.surface.host.dispatchEvent(new ME("pointerup", { clientX: x, clientY: y }));
}

// The centre of a filter-toggle option in the todo view (the same
// helpers the corpus toggle contracts use; the layout is independent
// of the focus context, so the bare tree's geometry matches the
// mounted one).
function filterCentre(option: string): readonly [number, number] {
  const toggle = toggleOptionOf(todoApp(todoState(), {}), option);
  return centreOf(toggle);
}

describe("spa-mount — frame coalescing (add-frame-coalescing)", () => {
  // Task 1.1 — derives_from: spa.mount.coalesced_default
  it("two dispatches inside one frame draw exactly once, state in dispatch order", () => {
    const frames = stubFrames();
    try {
      const { spa, drawSpy } = mounted();
      const baseline = spa.backend.drawCount;

      // The vehicle is two routed clicks on the filter toggle
      // ("complete", then "active"): both apply a `set` intent through
      // the corpus wire, so state application is observable. (The
      // red-side vehicle was pastes, but the todo app's default
      // handler drops insert-text as unknown — example.todo
      // other_keys_default only pins that the textarea RETURNS the
      // effect — so a paste paints without ever changing state.)
      const [cx, cy] = filterCentre("complete");
      click(spa, cx, cy);
      // state applies synchronously in dispatch order (D2
      // apply-immediate): the first click's filter is applied before
      // the second dispatch runs
      const state = spa.app.getState() as TodoState; // todo state is untyped at the App seam
      expect(state["selected-filter"]).toBe("complete");

      const [ax, ay] = filterCentre("active");
      click(spa, ax, ay);
      // the second dispatch applied on top of the first, in order
      const state2 = spa.app.getState() as TodoState;
      expect(state2["selected-filter"]).toBe("active");

      // nothing painted yet: the draws wait for the frame
      expect(spa.backend.drawCount).toBe(baseline);

      pump(frames);
      // one derive+draw for the whole burst — this is the assertion
      // that fails without the coalescer: per-dispatch draws would
      // already have moved the count before the pump
      expect(drawSpy).toHaveBeenCalledTimes(1);
      expect(spa.backend.drawCount).toBe(baseline + 1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 1.3 — opt-out guard, WRITTEN RED-SIDE: this passes trivially
  // today (per-dispatch synchronous draws are the current behavior) and
  // must stay green once the coalescer lands, pinning the opt-out.
  it("immediate mode restores per-dispatch repaint without a frame", () => {
    const frames = stubFrames();
    try {
      const { spa, drawSpy } = mounted({ mode: "immediate" });
      const baseline = spa.backend.drawCount;

      dispatchPaste(spa, "alpha");
      dispatchPaste(spa, "beta");

      // two dispatches → two draws, no frame pumped (observable D3
      // contract: per-dispatch repaint restored). makeApp's own
      // per-dispatch scheduleRepaint rAF still queues callbacks in
      // immediate mode (D1 keeps makeApp internals out of scope) and
      // its callback only rebuilds the view, never draws — frame-queue
      // emptiness is not the contract. The observable pin: the draws
      // already happened above, and pumping everything queued moves no
      // draw (the opt-out leaves nothing pending).
      expect(drawSpy).toHaveBeenCalledTimes(2);
      expect(spa.backend.drawCount).toBe(baseline + 2);
      pump(frames);
      expect(spa.backend.drawCount).toBe(baseline + 2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 1.4 — derives_from: spa.mount.flush_pending
  it("flush() forces exactly one pending draw synchronously", () => {
    const frames = stubFrames();
    try {
      const { spa, drawSpy } = mounted();
      const baseline = spa.backend.drawCount;

      dispatchPaste(spa, "alpha");
      dispatchPaste(spa, "beta");

      // the flush drains the whole pending burst as ONE draw
      spa.flush();
      expect(drawSpy).toHaveBeenCalledTimes(1);
      expect(spa.backend.drawCount).toBe(baseline + 1);

      // the frame was consumed: pumping afterwards draws nothing
      pump(frames);
      expect(spa.backend.drawCount).toBe(baseline + 1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 1.4 (no-rAF fallback, D2): the coalescer must not add a
  // never-flush state — without requestAnimationFrame a dispatch
  // flushes synchronously.
  it("without requestAnimationFrame a dispatch flushes synchronously", () => {
    // pin the absence explicitly: vitest's jsdom env boots jsdom with
    // pretendToBeVisual:true, so jsdom DOES ship an async rAF here —
    // the envs that genuinely lack rAF are the node-env files (why
    // effects-lane/example-counter stub it); stubbing undefined is the
    // right way to exercise the no-rAF fallback deterministically
    vi.stubGlobal("requestAnimationFrame", undefined);
    try {
      const { spa, drawSpy } = mounted();
      const baseline = spa.backend.drawCount;

      dispatchPaste(spa, "alpha");

      expect(drawSpy).toHaveBeenCalledTimes(1);
      expect(spa.backend.drawCount).toBe(baseline + 1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Lane-stream seam: the routed lane-only surface dispatches share the
  // same coalesced paint the paste path uses — the 60 Hz move stream
  // must not paint per event on the default mount.
  it("a lane mouse-move stream on the default mount draws once per frame at the final offset", () => {
    const frames = stubFrames();
    try {
      const doc = hostDoc();
      const container = doc.createElement("div");
      doc.body.appendChild(container);
      // the lane rig's mouse-move handler: each move pans +5 on x (the
      // same shape tests/spa-lane-draw.test.ts pins in immediate mode)
      const app = makeApp({
        view: (state) =>
          on("mouse-move", () => [
            ["lane", "pan", (old: unknown) => [
              ((old as Vec2 | undefined)?.[0] ?? 0) + 5,
              0,
            ]],
          ], label(`n=${(state as { n: number }).n}`)),
        state: { n: 0 },
      });
      // the DEFAULT mount (coalesced): the lane draw defers like any
      // routed paint — no "immediate" opt-out here
      const spa = mountDemo(doc, container, () => app);
      const drawSpy = vi.spyOn(spa.backend, "draw");
      const baseline = spa.backend.drawCount;

      // the 60 Hz shape: N routed lane-only moves inside one frame
      spa.backend.deliver(mouseMove([0, 0]));
      spa.backend.deliver(mouseMove([1, 0]));
      spa.backend.deliver(mouseMove([2, 0]));

      // effects applied synchronously; the paints stay pending
      expect(app.getLane()).toEqual({ pan: [15, 0] });
      expect(drawSpy).toHaveBeenCalledTimes(0);
      expect(spa.backend.drawCount).toBe(baseline);

      // one frame pump → exactly one draw, carrying the FINAL lane
      // offset (latest closure wins; earlier offsets never paint)
      pump(frames);
      expect(drawSpy).toHaveBeenCalledTimes(1);
      expect(spa.backend.drawCount).toBe(baseline + 1);
      const last = drawSpy.mock.calls[0]?.[0] as Elem;
      // the lane transform wrapper (the same shape spa-lane-draw
      // narrows): in-guard instead of an unchecked cast
      expect(last !== null && typeof last === "object" && "type" in last).toBe(true);
      const wrapper = last as unknown as { type: unknown; x: unknown; y: unknown };
      expect(wrapper.type).toBe("translate");
      expect([wrapper.x, wrapper.y]).toEqual([15, 0]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
