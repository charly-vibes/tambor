// @vitest-environment jsdom
// Purpose: the runtime-invalidation render-contract tests (add-runtime-
//   invalidation tasks 3.0/3.2/3.4/3.6 and 4.0) — the painter identity
//   short-circuit, the per-child identity reuse observable, and the
//   opt-in counters.
// Responsibilities: pin (3.0) the backend distinguishes draw() from
//   rebuilds — an identity-equal derive performs ZERO rebuilds and a
//   new view identity rebuilds exactly once; (3.2) an unknown ChangeSet
//   defeats the short-circuit; (3.4) streaming appends into a
//   memo-stable 1,000-row history mutate only the changed tail rows
//   while every unchanged row keeps the same element references, with
//   derive count still equal to dispatch count; (3.6) the conservative
//   fallbacks — fresh-but-equal children, reorder, mid-list
//   insert/remove, unknown ChangeSet — rebuild instead of splicing;
//   (4.0) the opt-in counters on the phase-timers seam.
// Rationale: openspec/changes/add-runtime-invalidation/spec.md is the
//   contract authority (requirement + scenario headings are mirrored in
//   .espectacular/). The rebuild/draw split is observable because
//   DomBackend.build is the single rebuild path inside draw()
//   (drawCount counts every draw, build counts every rebuild), and row
//   identity is observable through the real-DOM host adapter's live
//   elements. Split from tests/runtime-invalidation.test.ts (the
//   400-line test-file gate); the commit and subscription halves live
//   in runtime-invalidation-commits.test.ts, the composed-offsets pin
//   in runtime-invalidation-layout.test.ts, and the shared mount rig
//   in tests/helpers/runtime-invalidation-rig.ts.

import { describe, expect, it, vi } from "vitest";

import { makeApp } from "../src/effects/dispatch.ts";
import { label, type Elem } from "../src/views/model.ts";
import type { HostElement } from "../src/interop/domhost.ts";
import { mounted } from "./helpers/runtime-invalidation-rig.ts";

// jsdom DOES ship an async rAF (pretendToBeVisual), so every test stubs
// rAF explicitly; the makeApp repaint callback only re-derives the
// view, so nothing draws behind the test's back: the draws under test
// are synchronous wire draws, and the coalesced-paint test pumps the
// returned queue exactly once to fire the frame.
function stubFrames(): (() => void)[] {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
    frames.push(cb);
    return frames.length;
  });
  return frames;
}

describe("runtime-invalidation — painter identity short-circuit (add-runtime-invalidation §3)", () => {
  // Task 3.0 — derives_from: unchanged view skips rebuild
  it("an identity-equal derive records the draw with zero rebuilds; a new view identity rebuilds exactly once", () => {
    stubFrames();
    try {
      // Memo-stable view: the view derives from the rows slice only, so
      // a tick-only dispatch re-derives to the identity-equal view.
      let drawn: { from: unknown; view: Elem } | null = null;
      const app = makeApp({
        view: (state) => {
          const current = (state as { rows: string[] }).rows;
          if (drawn !== null && drawn.from === current) return drawn.view;
          const view = current.map((t) => label(t));
          drawn = { from: current, view };
          return view;
        },
        state: { rows: ["a", "b", "c"], tick: 0 },
      });
      const { spa } = mounted(app);
      // draw() is the single draw path; build() is the single rebuild
      // path inside it — the spy pair separates "a draw was recorded"
      // from "the element tree was rebuilt".
      const drawSpy = vi.spyOn(spa.backend, "draw");
      const buildSpy = vi.spyOn(spa.backend, "build");

      // a state-changing dispatch whose derive is identity-equal:
      // the draw is recorded, the rebuild must not happen
      app.dispatch(["update", [["keypath", "tick"]], (t: unknown) => (t as number) + 1]);
      expect(drawSpy).toHaveBeenCalledTimes(1);
      expect(buildSpy).toHaveBeenCalledTimes(0);

      // a dispatch with a new view identity rebuilds exactly once
      app.dispatch([
        "update",
        [["keypath", "rows"]],
        (r: unknown) => [...(r as string[]), "d"],
      ]);
      expect(drawSpy).toHaveBeenCalledTimes(2);
      expect(buildSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 3.2 — derives_from: any unknown ChangeSet frame forces a full
  // rebuild even when the view identity matches (the conservative rule;
  // stale output impossible). The vehicle is an unregistered custom
  // effect: no path annotations exist, so the commit's ChangeSet
  // degrades to unknown while the default handler leaves the state
  // object itself unchanged — the derive is a cache hit returning the
  // SAME view identity.
  it("an unknown ChangeSet frame forces a rebuild even when the view is identity-equal", () => {
    stubFrames();
    try {
      let drawn: { from: unknown; view: Elem } | null = null;
      const app = makeApp({
        view: (state) => {
          const current = (state as { rows: string[] }).rows;
          if (drawn !== null && drawn.from === current) return drawn.view;
          const view = current.map((t) => label(t));
          drawn = { from: current, view };
          return view;
        },
        state: { rows: ["a", "b", "c"], tick: 0 },
      });
      const { spa } = mounted(app);
      const drawSpy = vi.spyOn(spa.backend, "draw");
      const buildSpy = vi.spyOn(spa.backend, "build");

      app.dispatch(["custom-noop", 1]);

      // conservative rule: the draw is recorded AND the rebuild happens
      // — the short-circuit never fires on unknown changes
      expect(drawSpy).toHaveBeenCalledTimes(1);
      expect(buildSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("runtime-invalidation — per-child identity reuse (add-runtime-invalidation §4)", () => {
  // Task 3.4 — derives_from: streaming append mutates only the tail
  it("streaming appends into a memo-stable 1,000-row history mutate only the tail rows and derive once per dispatch", () => {
    stubFrames();
    try {
      const seed = Array.from({ length: 1000 }, (_, i) => `row ${i}`);
      // memo-stable row Elems: identity per history entry, so an append
      // produces a new tail Elem and keeps every prior Elem identical
      const rowCache = new Map<string, Elem>();
      const rowOf = (t: string): Elem => {
        let row = rowCache.get(t);
        if (row === undefined) {
          row = label(t);
          rowCache.set(t, row);
        }
        return row;
      };
      const app = makeApp({
        view: (state) =>
          (state as { history: string[] }).history.map(rowOf),
        state: { history: seed },
      });
      const { spa } = mounted(app);
      const deriveSpy = vi.spyOn(app, "view");

      // every row paints one span, in DOM order = row order
      const rowElements = (): HostElement[] =>
        Array.from(spa.root.host.querySelectorAll("span"));
      const before = rowElements();
      expect(before.length).toBe(1000);
      expect(before[0]?.textContent).toBe("row 0");

      const appended = ["row 1000", "row 1001", "row 1002"];
      for (const t of appended) {
        app.dispatch([
          "update",
          [["keypath", "history"]],
          (h: unknown) => [...(h as string[]), t],
        ]);
      }

      const after = rowElements();
      expect(after.length).toBe(before.length + appended.length);
      // every unchanged row keeps the SAME element reference across
      // frames (the reuse observable) — RED today: each draw rebuilds
      // the whole tree, so every reference differs
      for (let i = 0; i < before.length; i++) {
        expect(after[i]).toBe(before[i]);
      }
      // only the changed tail rows are new elements
      for (const el of after.slice(before.length)) {
        expect(before.includes(el)).toBe(false);
      }
      expect(after[1000]?.textContent).toBe("row 1000");
      expect(after[1002]?.textContent).toBe("row 1002");

      // derive count still equals dispatch count: one derivation per
      // state-changing dispatch after the initial mount derive
      expect(deriveSpy).toHaveBeenCalledTimes(appended.length);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 3.6 — derives_from: the conservative fallbacks never splice.
  // Same rig shape as the streaming test above; each phase asserts the
  // rebuilt rows carry NEW element references while the splice-eligible
  // neighbours keep theirs (identity at the same position is the only
  // reuse key — no keyed matching). Direct dispatches draw synchronously
  // through the rerender path, so no frames are needed.
  it("fresh-but-equal children, reorder, mid-list insert/remove and an unknown ChangeSet rebuild instead of splicing", () => {
    const seed = Array.from({ length: 1000 }, (_, i) => `row ${i}`);
    const rowCache = new Map<string, Elem>();
    const rowOf = (t: string): Elem => {
      let row = rowCache.get(t);
      if (row === undefined) {
        row = label(t);
        rowCache.set(t, row);
      }
      return row;
    };
    const app = makeApp({
      view: (state) => (state as { history: string[] }).history.map(rowOf),
      state: { history: seed },
    });
    const { spa } = mounted(app);
    const rowElements = (): HostElement[] =>
      Array.from(spa.root.host.querySelectorAll("span"));
    let before = rowElements();
    expect(before.length).toBe(1000);

    // fresh-but-equal: drop one row's memo entry and append an
    // unrelated row — the dropped row re-derives to a structurally
    // equal but FRESH Elem at its position and must rebuild, while
    // every memo-stable neighbour splices whole
    rowCache.delete("row 7");
    app.dispatch([
      "update",
      [["keypath", "history"]],
      (h: unknown) => [...(h as string[]), "row 1000"],
    ]);
    let after = rowElements();
    expect(after.length).toBe(1001);
    expect(after[7]).not.toBe(before[7]);
    expect(after[7]?.textContent).toBe("row 7");
    for (const i of [0, 6, 8, 500, 999]) {
      expect(after[i]).toBe(before[i]);
    }
    before = after;

    // reorder: reversing shifts every position — identity at the SAME
    // position is the only reuse key, so every row rebuilds. The odd
    // length's middle index maps onto itself (same Elem, same index),
    // so exactly that row splices: positional reuse, not keyed matching.
    app.dispatch([
      "update",
      [["keypath", "history"]],
      (h: unknown) => [...(h as string[])].reverse(),
    ]);
    after = rowElements();
    expect(after.length).toBe(1001);
    expect(after[0]?.textContent).toBe("row 1000");
    expect(after[1000]?.textContent).toBe("row 0");
    for (let i = 0; i < after.length; i++) {
      if (i === 500) {
        expect(after[i]).toBe(before[i]);
      } else {
        expect(after[i]).not.toBe(before[i]);
      }
    }
    before = after;

    // mid-list insert at 500: positions below splice, positions at and
    // above the insert rebuild
    app.dispatch([
      "update",
      [["keypath", "history"]],
      (h: unknown) => {
        const next = [...(h as string[])];
        next.splice(500, 0, "row inserted");
        return next;
      },
    ]);
    after = rowElements();
    expect(after.length).toBe(1002);
    expect(after[500]?.textContent).toBe("row inserted");
    for (let i = 0; i < 500; i++) {
      expect(after[i]).toBe(before[i]);
    }
    for (let i = 501; i < after.length; i++) {
      expect(after[i]).not.toBe(before[i - 1]);
    }
    before = after;

    // mid-list remove at 500: same shape — the shifted suffix rebuilds
    app.dispatch([
      "update",
      [["keypath", "history"]],
      (h: unknown) => {
        const next = [...(h as string[])];
        next.splice(500, 1);
        return next;
      },
    ]);
    after = rowElements();
    expect(after.length).toBe(1001);
    expect(after[500]?.textContent).toBe("row 500");
    for (let i = 0; i < 500; i++) {
      expect(after[i]).toBe(before[i]);
    }
    for (let i = 500; i < after.length; i++) {
      expect(after[i]).not.toBe(before[i + 1]);
    }
    before = after;

    // unknown ChangeSet: the unregistered custom effect leaves the
    // state (and view identity) untouched but disables reuse for the
    // frame — every subtree rebuilds
    app.dispatch(["custom-noop", 1]);
    after = rowElements();
    expect(after.length).toBe(1001);
    for (let i = 0; i < after.length; i++) {
      expect(after[i]).not.toBe(before[i]);
    }
  });
});

