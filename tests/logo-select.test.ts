// Purpose: the logo demo's selection contract tests (tambor-y9d.6) — the
//   Smalltalk-style select-path effect: any on-screen item (turtle, a
//   drawn segment, the pen state) is selected by naming its state path
//   in a plain effect vector, and the halo/inspector read that path
//   back as data.
// Responsibilities: verify (1) the select effect vector is plain data
//   (tag + path, no behavior); (2) the pure toggle handler selectLogo
//   stores the item path under sel and deselects on a second select of
//   the same item, never mutating the input state or anything outside
//   the sel path; (3) the per-app registry routes the effect (round
//   trip through makeOpsApp); (4) inspectItem projects the selected
//   item's fields as plain data from the derived world; (5) itemRect
//   bounds the item for the halo handles.
// Rationale: openspec/specs/state-paths/spec.md is the design authority
//   for paths-as-data and openspec/specs/interop-model/spec.md for the
//   per-app registry (ops_bound_to_app); selection is an effect the
//   demo routes, never imperative mutation (tambor-y9d.6).

import { describe, expect, it } from "vitest";

import {
  PEN_ITEM,
  TURTLE_ITEM,
  inspectItem,
  itemRect,
  itemTitle,
  segmentItem,
  selectEffect,
  selectLogo,
  type Selection,
} from "../src/examples/logo/select.ts";
import {
  createLogoApp,
  logoRegistry,
  logoState,
  runLogo,
  type LogoState,
} from "../src/examples/logo/logo.ts";
import { EXAMPLES, derive, type World } from "../src/examples/logo/interpreter.ts";

// A world with one known figure run: the square's four segments.
function squareWorld(): World {
  return derive([{ text: EXAMPLES["square"] as string }], false, "en");
}

function stateWithSquare(): LogoState {
  return runLogo({ ...logoState(), src: EXAMPLES["square"] as string });
}

describe("logo-select — the select-path effect is pure data", () => {
  it("the select effect vector is the plain data ['select', <item path>]", () => {
    expect(selectEffect(TURTLE_ITEM)).toEqual(["select", ["turtle"]]);
    expect(selectEffect(segmentItem(3))).toEqual(["select", ["trace", 3]]);
    expect(selectEffect(null)).toEqual(["select", null]);
    // no behavior smuggled in: every element is plain data
    for (const part of selectEffect(TURTLE_ITEM)) {
      expect(typeof part === "function").toBe(false);
    }
  });

  it("selectLogo stores the item path under sel", () => {
    const s1 = selectLogo(logoState(), TURTLE_ITEM);
    expect(s1.sel).toEqual(["turtle"]);
    const s2 = selectLogo(s1, segmentItem(0));
    expect(s2.sel).toEqual(["trace", 0]);
  });

  it("selecting the already-selected item deselects (toggle)", () => {
    const s1 = selectLogo(logoState(), TURTLE_ITEM);
    expect(selectLogo(s1, TURTLE_ITEM).sel).toBeNull();
    // a different path switches instead of toggling off
    expect(selectLogo(s1, PEN_ITEM).sel).toEqual(["pen"]);
  });

  it("selection never mutates: the handler is pure over its input state", () => {
    const s0 = Object.freeze(stateWithSquare());
    const sel: Selection = TURTLE_ITEM;
    const s1 = selectLogo(s0, sel); // frozen input: any mutation throws
    expect(s1.sel).toEqual(["turtle"]);
    // nothing outside the sel path changed: the fold is untouched
    expect(s1.entries).toBe(s0.entries);
    expect(s1.cursor).toBe(s0.cursor);
    expect(s1.src).toBe(s0.src);
    expect(s0.sel).toBeNull();
  });
});

describe("logo-select — the effect routes through the per-app registry", () => {
  it("logoRegistry carries a select handler beside run and clear", () => {
    // the y9d.10 registry takes the hooks cell + worker flag (run/stop are
    // per-app entries of the killable Worker boundary)
    const hooks = { current: { launch: () => {}, stop: () => {} } };
    expect(logoRegistry(hooks, false).has("select")).toBe(true);
  });

  it("dispatching the select effect round-trips through the seam", () => {
    const app = createLogoApp();
    app.dispatch([["set", "src", EXAMPLES["square"] as string], ["run"]]);
    const before = app.getState() as LogoState;
    app.dispatch([selectEffect(TURTLE_ITEM)]);
    const selected = app.getState() as LogoState;
    expect(selected.sel).toEqual(["turtle"]);
    // the fold is untouched by selection
    expect(selected.entries).toBe(before.entries);
    expect(selected.cursor).toBe(before.cursor);
    // deselecting clears sel only
    app.dispatch([selectEffect(null)]);
    expect((app.getState() as LogoState).sel).toBeNull();
  });
});

describe("logo-select — the inspector reads the selection as data", () => {
  it("itemTitle names the selected item", () => {
    expect(itemTitle(TURTLE_ITEM)).toBe("turtle");
    expect(itemTitle(PEN_ITEM)).toBe("pen");
    expect(itemTitle(segmentItem(2))).toBe("segment 2");
    expect(itemTitle(null)).toBe("nothing");
  });

  it("the turtle selection projects its fields from the world", () => {
    const w = squareWorld();
    const fields = inspectItem(w, TURTLE_ITEM);
    expect(fields).toEqual({
      x: w.x,
      y: w.y,
      hd: w.hd,
      pen: true,
      color: w.color,
    });
  });

  it("a drawn segment selection projects its trace row", () => {
    const w = squareWorld();
    const fields = inspectItem(w, segmentItem(0));
    const seg = w.trace[0];
    expect(fields).not.toBeNull();
    expect(fields!["x1"]).toBe(seg![0]);
    expect(fields!["y1"]).toBe(seg![1]);
    expect(fields!["x2"]).toBe(seg![2]);
    expect(fields!["y2"]).toBe(seg![3]);
    // the segment's color: null means the current pen color
    expect(fields!["color"]).toBe(seg![4]);
  });

  it("the pen selection projects pen and color", () => {
    const w = squareWorld();
    expect(inspectItem(w, PEN_ITEM)).toEqual({ pen: w.pen, color: w.color });
  });

  it("an out-of-range segment path projects nothing", () => {
    const w = squareWorld();
    expect(inspectItem(w, segmentItem(99))).toBeNull();
    expect(inspectItem(w, ["bogus"])).toBeNull();
  });

  it("itemRect bounds the selected item for the halo handles", () => {
    const w = squareWorld();
    const R = 200;
    const turtle = itemRect(w, TURTLE_ITEM, R);
    expect(turtle).not.toBeNull();
    expect(turtle!.w).toBeGreaterThan(0);
    expect(turtle!.h).toBeGreaterThan(0);
    // the turtle's centre sits inside its halo rect
    const cx = w.x + R;
    const cy = R - w.y;
    expect(turtle!.x).toBeLessThanOrEqual(cx);
    expect(turtle!.x + turtle!.w).toBeGreaterThanOrEqual(cx);
    expect(turtle!.y).toBeLessThanOrEqual(cy);
    expect(turtle!.y + turtle!.h).toBeGreaterThanOrEqual(cy);
    // a segment's rect covers both of its endpoints
    const seg = w.trace[1]!;
    const rect = itemRect(w, segmentItem(1), R);
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeLessThanOrEqual(Math.min(seg[0], seg[2]) + R);
    expect(rect!.x + rect!.w).toBeGreaterThanOrEqual(Math.max(seg[0], seg[2]) + R);
    // nothing selected, nothing bounded; unknown paths too
    expect(itemRect(w, null, R)).toBeNull();
    expect(itemRect(w, ["bogus"], R)).toBeNull();
  });
});
