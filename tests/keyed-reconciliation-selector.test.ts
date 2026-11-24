// @vitest-environment jsdom
// Purpose: the createSelector × keyed rows composition test (add-
//   keyed-dom-reconciliation §4.2) — its own file because the render
//   suite sits at the 400-line test-file gate.
// Responsibilities: pin the row-selection pattern — a 1,000-row keyed
//   list re-derived with one selection change runs build exactly once
//   for the frame (the selector is consulted per row at O(1)), and
//   only the rows whose selection state flipped rebuild while every
//   unchanged row keeps its element reference (§2 composes).
// Rationale: openspec/changes/add-keyed-dom-reconciliation/specs/
//   components-memo/spec.md is the contract authority; the mounted-rig
//   rAF protocol (stub + pump once per dispatch) is the render tests'.
//   Static test titles only.
import { describe, expect, it, vi } from "vitest";

import { makeApp } from "../src/effects/dispatch.ts";
import { keyed, label, type Elem } from "../src/views/model.ts";
import { createSelector } from "../src/components/memo/memo.ts";
import { mounted } from "./helpers/runtime-invalidation-rig.ts";
import type { HostElement } from "../src/interop/domhost.ts";

// row spans are the row elements (label rows paint one span each).
function rowElements(host: HostElement): HostElement[] {
  return Array.from(host.querySelectorAll("span"));
}

// jsdom DOES ship an async rAF (pretendToBeVisual): stub and pump the
// queue exactly once per dispatch (the mount coalesces hinted draws).
function stubFrames(): (() => void)[] {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
    frames.push(cb);
    return frames.length;
  });
  return frames;
}

describe("keyed-dom-reconciliation — selector composition (add-keyed-dom-reconciliation §4.2)", () => {
  it("4.2 a 1,000-row selection change runs build once and keeps unchanged keyed rows' element identity", () => {
    const frames = stubFrames();
    try {
      interface Row {
        readonly id: number;
      }
      const rows: Row[] = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      // memo-stable row Elems keyed by (id, selected-ness): rows whose
      // selection state didn't change keep the SAME Elem across the
      // frame (the keyed-table demo's memo-row pattern).
      const cache = new Map<string, Elem>();
      const rowOf = (r: Row, selected: boolean): Elem => {
        const k = `${r.id}:${selected}`;
        let el = cache.get(k);
        if (el === undefined) {
          el = label(selected ? `! row ${r.id}` : `row ${r.id}`);
          cache.set(k, el);
        }
        return el;
      };
      // the picked slice: the selected row id wrapped in an object (the
      // memo contract keys objects); build derives the answer once per
      // slice change
      let builds = 0;
      const selection = createSelector(
        (state: { selected: { id: number } }) => state.selected,
        (picked: { id: number }) => {
          builds++;
          return picked.id;
        },
      );
      const app = makeApp({
        view: (state: unknown) => {
          const s = state as { rows: Row[]; selected: { id: number } };
          const selectedId = selection(s);
          return s.rows.map((r) =>
            keyed(String(r.id), rowOf(r, selectedId === r.id)),
          );
        },
        state: { rows, selected: { id: 500 } },
      });
      const { spa } = mounted(app);
      const before = rowElements(spa.root.host);
      expect(before.length).toBe(1000);

      // one selection change: the slice identity changes → exactly one
      // build for the frame; every row consults the answer at O(1)
      const buildsBefore = builds;
      app.dispatch([
        "update",
        [["keypath", "selected"]],
        () => ({ id: 501 }),
      ]);
      frames.splice(0).forEach((fire) => fire());
      expect(builds).toBe(buildsBefore + 1);

      const after = rowElements(spa.root.host);
      expect(after.length).toBe(1000);
      // rows whose selection state didn't change keep their element
      // references (keyed splice, §2 composes with the selector); only
      // the deselected (500) and newly selected (501) rows rebuild
      expect(after[0]).toBe(before[0]);
      expect(after[999]).toBe(before[999]);
      expect(after[499]).toBe(before[499]);
      expect(after[500]).not.toBe(before[500]);
      expect(after[501]).not.toBe(before[501]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
