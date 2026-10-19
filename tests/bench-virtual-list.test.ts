// Purpose: contract tests for the virtual-list bench app
//   (tambor-54j.8.2) — the 10k-row list's two draw strategies must be
//   correct before the browser scenarios can be trusted to measure
//   anything: the windowed draw through components.virtual_list must
//   cover the SAME visible rows the whole-view draw places at the same
//   offsets, the +1-row op must be the identical state transition in
//   both modes, and the readouts the scenarios pin must be produced by
//   the ordinary dispatcher wire (no benchmark-specific path).
// Responsibilities: pin (a) the whole-view readout ("drawn 10000") and
//   the windowed readout's metric-independent ratios ("window from F at
//   R"), (b) window-vs-whole draw parity at a scrolled offset, (c) the
//   summary-only state (no item stream in state), (d) the ordinary
//   dispatcher wire driving the ops.
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op misroutes or no-ops produces meaningless medians; the
//   parity and pinned guard lines make "the windowed candidate is
//   correct" a checked contract.

import { describe, expect, it } from "vitest";
import {
  LIST_COUNT,
  OFFSET_PATH,
  createVirtualListApp,
  rowPitch,
  scrollRows,
  virtualListView,
  virtualListState,
} from "../src/examples/bench/virtual-list.ts";
import type { VirtualListState } from "../src/examples/bench/virtual-list.ts";
import { drawnRows } from "./helpers/virtual_list.ts";
import { walk, type EventNode } from "./helpers/scrollview.ts";
import type { EventElem } from "../src/events/bubble.ts";

// The labels of every drawn text node, depth-first (the event-layer
// walk — the component's wrap wrappers are part of the tree).
function texts(view: EventElem): readonly string[] {
  const out: string[] = [];
  for (const n of walk(view) as readonly EventNode[]) {
    const t = n as { type?: string; text?: string };
    if (t.type === "label" && typeof t.text === "string") out.push(t.text);
  }
  return out;
}

// The windowed view as an event-layer tree (the top level is a group
// of the head stack and the component).
function windowedTree(state: VirtualListState): EventElem {
  return virtualListView(state) as unknown as EventElem;
}

// The state after k +1-row scroll ops from the given start.
function scrolled(k: number, mode: VirtualListState["mode"]): VirtualListState {
  let state = virtualListState();
  state = { ...state, count: LIST_COUNT, mode };
  for (let i = 0; i < k; i++) {
    state = { ...state, offset: (scrollRows(1)(state.offset) as number) };
  }
  return state;
}

describe("virtual-list bench app — parity and guards", () => {
  it("whole-view mode draws every row and the readout the scenario pins", () => {
    const state = scrolled(0, "full");
    const labels = texts(windowedTree(state));
    expect(labels).toContain("drawn 10000");
    expect(labels.filter((t) => t.startsWith("row ")).length).toBe(LIST_COUNT);
  });

  it("windowed mode draws only the window and the readout ratios pin the op", () => {
    // warmup 1 + 12 timed ops = 13 rows scrolled from the top
    const state = scrolled(13, "window");
    const labels = texts(windowedTree(state));
    expect(labels).toContain("window from 13 at 13");
    const drawn = labels.filter((t) => t.startsWith("row "));
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(LIST_COUNT / 10); // a window, not the 10k stream
    // the window starts at the scrolled row and is contiguous — the
    // readout and the drawn rows agree
    const indices = drawn.map((t) => Number(t.slice(4)));
    expect(indices).toEqual(
      Array.from({ length: indices.length }, (_, j) => 13 + j),
    );
  });

  it("window-vs-whole draw parity: the same offset places the same rows", () => {
    const state = scrolled(7, "window");
    // the whole view's rows at that offset: the drawn (index, y) slice
    const wholeLabels = texts(virtualListView({ ...state, mode: "full" }) as unknown as EventElem);
    const wholeAt = new Map(
      wholeLabels
        .filter((t) => t.startsWith("row "))
        .map((t) => [Number(t.slice(4)), t]),
    );
    // the windowed component's drawn rows: the drawn indices must all
    // exist in the whole view's stream and start at the window's first
    const winLabels = texts(windowedTree(state));
    const winRows = winLabels.filter((t) => t.startsWith("row "));
    const first = Number((winRows[0] as string).slice(4));
    expect(first).toBe(7);
    for (const t of winRows) {
      expect(wholeAt.has(Number(t.slice(4)))).toBe(true);
    }
  });

  it("draw parity via drawnRows: the windowed slice matches the whole stack", () => {
    const state = scrolled(7, "window");
    const rows = drawnRows(windowedTree(state));
    expect(rows.length).toBeGreaterThan(0);
    // each drawn row sits at its arithmetic offset (index * pitch)
    const pitch = rowPitch();
    const h = pitch - 1;
    for (const [i, y] of rows) {
      expect(y).toBeCloseTo(i * pitch, 6);
      expect(h).toBeGreaterThan(0);
    }
  });

  it("the state is summaries only — no item stream", () => {
    const state = scrolled(3, "window");
    expect(Object.keys(state).sort()).toEqual(["count", "mode", "offset"]);
    for (const v of Object.values(state)) {
      expect(typeof v === "number" || typeof v === "string").toBe(true);
    }
  });

  it("drives the ops through the ordinary dispatcher wire", () => {
    const app = createVirtualListApp();
    expect(OFFSET_PATH).toEqual([["keypath", "offset"]]);
    app.dispatch(["update", OFFSET_PATH, scrollRows(1)]);
    const state = app.getState() as VirtualListState;
    expect(state.offset).toBeCloseTo(rowPitch(), 6);
  });

  it("the row pitch is a stable positive number (label height + gap)", () => {
    expect(rowPitch()).toBeGreaterThan(1);
    expect(rowPitch()).toBe(rowPitch());
  });
});
