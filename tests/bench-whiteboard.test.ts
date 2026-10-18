// Purpose: contract tests for the whiteboard bench app (tambor-54j.15
//   BZ3) — the seed, the three drag/resize op shapes and the cursor
//   pair must be correct reads/edits of plain state through the
//   ordinary update-intent wire before the browser scenario can be
//   trusted to measure anything.
// Responsibilities: pin (a) the deterministic 10k-shape seed and its
//   coverage invariant (every probe point lands on ≥1 shape, so a
//   drag op never silently misses), (b) hitLinear ≡ hitIndex — the
//   linear scan and the grid-bucket candidate return the SAME
//   topmost shape (highest id containing the probe) on the seeded
//   scene AND on a drifted post-drag scene, (c) drag naive ≡ log ≡
//   grid final state after 13 ops (deep equality + checksum — the
//   measured ops differ only in work shape), (d) the undo contract —
//   alternating drag+undo restores the seeded scene exactly, for both
//   history strategies, (e) the cursor dispatch-shape pair — folding
//   a burst in one update ≡ one update per message (the BZ1
//   applyBurst contract at cursor scale), (f) summaryLine's guard
//   strings, (g) the drawn surface: the seeded view really draws the
//   visible scene window (~700 rectangle nodes — checked, not
//   eyeballed).
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op is a no-op produces overhead-only medians; each op's
//   product is checked against independent recomputation, and the
//   naive ≡ candidate state contracts are what make the scenario
//   pairs measurements of work shape, not data divergence.

import { describe, it, expect } from "vitest";
import {
  CELL,
  CURSOR_BURST,
  PROBES,
  SHAPE_COUNT,
  buildIndex,
  checksum,
  dragGridOp,
  dragLogOp,
  dragNaiveOp,
  frameOp,
  hitIndex,
  hitLinear,
  naiveMsgOp,
  resizeLogOp,
  seedOp,
  seedShapes,
  summaryLine,
  undoOp,
  whiteboardState,
  type Shape,
  type WBState,
} from "../src/examples/bench/whiteboard-scene.ts";
import { whiteboardView } from "../src/examples/bench/whiteboard.ts";
import { scanOf } from "./helpers/scan.ts";

// Independent containment predicate (not the app's helper).
function covers(s: Shape, x: number, y: number): boolean {
  return s.x <= x && x < s.x + s.w && s.y <= y && y < s.y + s.h;
}

// Independent topmost rule: the highest-id shape containing the point.
function topmostIndependent(
  shapes: readonly Shape[],
  x: number,
  y: number,
): Shape | undefined {
  let best: Shape | undefined;
  for (const s of shapes) if (covers(s, x, y) && (best === undefined || s.id > best.id)) best = s;
  return best;
}

const seeded: WBState = seedOp(whiteboardState());

describe("bz3 seed", () => {
  it("seeds exactly 10k deterministic shapes", () => {
    const shapes = seedShapes();
    expect(shapes.length).toBe(SHAPE_COUNT);
    expect(seeded.shapes).toEqual(shapes);
    expect(seeded.index.length).toBeGreaterThan(0);
  });

  it("every probe point is covered by ≥1 shape (a drag never silently misses)", () => {
    for (const [vx, vy] of PROBES) {
      // probes are view-space; the scene window offset maps them into
      // the world the shapes tile
      const wx = vx + 500;
      const wy = vy + 500;
      expect(topmostIndependent(seeded.shapes, wx, wy)).toBeDefined();
    }
  });

  it("checksum is a deterministic fold over the seeded scene", () => {
    let acc = 0;
    for (const s of seeded.shapes) {
      acc = (acc + s.id * 31 + s.x * 7 + s.y * 3 + s.w * 11 + s.h * 5) % 1000000007;
    }
    expect(checksum(seeded.shapes)).toBe(acc);
    expect(checksum(seedShapes())).toBe(checksum(seeded.shapes));
  });
});

describe("bz3 hit-testing", () => {
  it("linear ≡ index on the seeded scene, all probes", () => {
    expect(seeded.index.length).toBe(24 * 24);
    for (const [vx, vy] of PROBES) {
      const wx = vx + 500;
      const wy = vy + 500;
      expect(hitIndex(seeded.index, wx, wy)).toEqual(
        hitLinear(seeded.shapes, wx, wy),
      );
      expect(hitLinear(seeded.shapes, wx, wy)).toEqual(
        topmostIndependent(seeded.shapes, wx, wy),
      );
    }
  });

  it("linear ≡ index on a drifted post-drag scene, all probes", () => {
    let state = seeded;
    for (let i = 0; i < 13; i++) state = dragGridOp(state);
    for (const [vx, vy] of PROBES) {
      const wx = vx + 500;
      const wy = vy + 500;
      expect(hitIndex(state.index, wx, wy)).toEqual(
        hitLinear(state.shapes, wx, wy),
      );
    }
  });

  it("grid cells stay bounded (the candidate's membership cost)", () => {
    const biggest = seeded.index.reduce((m, c) => Math.max(m, c.length), 0);
    expect(biggest).toBeLessThan(200); // linear scan touches 10k; a cell <200
  });
});

describe("bz3 drag/resize op shapes", () => {
  it("naive ≡ log ≡ grid final state after 13 drags", () => {
    let a = seeded;
    let b = seeded;
    let c = seeded;
    for (let i = 0; i < 13; i++) {
      a = dragNaiveOp(a);
      b = dragLogOp(b);
      c = dragGridOp(c);
    }
    expect(a.drags).toBe(13);
    expect(b.shapes).toEqual(a.shapes);
    expect(c.shapes).toEqual(a.shapes);
    expect(checksum(c.shapes)).toBe(checksum(a.shapes));
    // the naive mode's hazard is the history it carries: full scene
    // snapshots (deep-copied per op) vs the log's one-rect entries
    expect(a.history.length).toBe(13);
    expect(a.history[0]!.kind).toBe("snap");
    expect(b.history[0]!.kind).toBe("op");
  });

  it("resize grows the hit shape and records the old rect", () => {
    const before = seeded;
    const hit = topmostIndependent(before.shapes, 536, 536)!; // probe 0 world
    const after = resizeLogOp(before);
    expect(after.resizes).toBe(1);
    const grown = after.shapes.find((s) => s.id === hit.id)!;
    expect(grown.w).toBe(hit.w + 4);
    expect(grown.h).toBe(hit.h + 3);
  });
});

describe("bz3 undo", () => {
  it("alternating drag+undo restores the seeded scene exactly (op log)", () => {
    let state = seeded;
    state = dragLogOp(state); // the scenario's untimed warmup drag
    for (let i = 0; i < 12; i++) {
      state = i % 2 === 0 ? undoOp(state) : dragLogOp(state);
    }
    // the 12-op cycle (undo, drag ×6) ends ON a drag — the scenario's
    // deterministic guard carries that one displaced shape; undoing it
    // must restore the seeded scene bit-for-bit
    expect(state.drags).toBe(7);
    expect(state.undos).toBe(6);
    state = undoOp(state);
    expect(state.undos).toBe(7);
    expect(state.shapes).toEqual(seeded.shapes);
    expect(checksum(state.shapes)).toBe(checksum(seeded.shapes));
  });

  it("snapshot history restores exactly too", () => {
    let state = seeded;
    state = dragNaiveOp(state);
    state = dragNaiveOp(state);
    state = undoOp(state);
    state = undoOp(state);
    expect(state.shapes).toEqual(seeded.shapes);
    expect(state.history.length).toBe(0);
  });

  it("undo restores a resize (width/height, not only position)", () => {
    let state = resizeLogOp(seeded);
    state = undoOp(state);
    expect(state.shapes).toEqual(seeded.shapes);
  });
});

describe("bz3 remote cursors", () => {
  it("one update per message ≡ the folded burst (same final cursor state)", () => {
    let stepwise = whiteboardState();
    for (let i = 0; i < CURSOR_BURST; i++) stepwise = naiveMsgOp(stepwise);
    const folded = frameOp(whiteboardState());
    expect(folded.cursors.msgs).toBe(CURSOR_BURST);
    expect(folded.cursors).toEqual(stepwise.cursors);
    expect(folded.shapes).toEqual(stepwise.shapes);
  });
});

describe("bz3 summary + drawn surface", () => {
  it("summaryLine carries the full no-op guard", () => {
    expect(summaryLine(whiteboardState())).toBe(
      "shapes 0 drags 0 resizes 0 undos 0 msgs 0 sum 0",
    );
    expect(summaryLine(seeded)).toContain("shapes 10000");
    expect(summaryLine(seeded)).toContain("sum " + checksum(seeded.shapes));
  });

  it("the seeded view draws the visible scene window (~700 rects)", () => {
    const nodes = scanOf(
      whiteboardView(seedOp(whiteboardState()), () => {
        throw new Error("no app in a pure view scan");
      }),
    );
    const rects = nodes.filter((f) => f.node.type === "rectangle");
    expect(rects.length).toBeGreaterThanOrEqual(600);
    expect(rects.length).toBeLessThan(1200);
  });

  it("grid cell size subdivides the world (the 54j.10 seam)", () => {
    expect(24 * CELL).toBe(1200);
  });
});
