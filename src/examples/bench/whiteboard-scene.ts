// Purpose: the scene-data half of the whiteboard bench app
//   (tambor-54j.15) — BZ3 of the bench business suite: a 10k-shape
//   scene, the drag/resize/undo op shapes and the remote-cursor pair —
//   the §4.3 hazards "O(n) array copies; linear hit-testing" made
//   measurable. The hit-testing pair (hitLinear vs hitIndex + the
//   bucket index) and the world geometry live in whiteboard-index.ts —
//   split at the wave-2 file-size seam.
// Responsibilities: Shape/Cursor/WBState (plain data), the probe list,
//   seedShapes/seedOp (the deterministic 10k scene + the index built
//   once), the three drag shapes (NAIVE: full-scene snapshot per op —
//   the O(n)-copy hazard; LOG: one old-rect entry; GRID: log +
//   maintained bucket index), resizeLogOp, undoOp (both history
//   kinds), naiveMsgOp/frameOp (the cursor dispatch-shape pair),
//   checksum and summaryLine (the no-op guards).

import {
  COLS,
  SPACING,
  buildIndex,
  hitIndex,
  hitLinear,
  indexMove,
} from "./whiteboard-index.ts";

// Re-exported so the app and the tests read one scene module.
export {
  CELL,
  GRID,
  WORLD,
  buildIndex,
  hitIndex,
  hitLinear,
  indexMove,
} from "./whiteboard-index.ts";

// Rationale: the naive and candidate ops are pinned to leave the SAME
//   scene state — every drag variant hits the SAME shape (topmost =
//   highest id containing the probe; probes are consumed once per run
//   so a run never exhausts a probe's coverage) and applies the SAME
//   move, so the checksums match across variants (pinned in
//   tests/bench-whiteboard.test.ts, undo included) and the measured
//   delta is pure work shape. The seam a persistent collection (cherry)
//   would fill — O(1) scene restore — is deliberately NOT built: with
//   plain-data state every variant still pays one immutable rebuild of
//   the 10k array per op, and that is what the medians record.

// The scene: 10k shapes on a 100×100 grid over the 1200×1200 world;
// the drawn window is the 300×300 viewport at world (500,500). Sizes
// ≥ 2·SPACING keep every point covered (no gaps) — a probe hit never
// silently misses.
export const SHAPE_COUNT = 10_000;
export const WIN_X = 500;
export const WIN_Y = 500;

// One op consumes ONE probe per click (16 probes, ≤13 clicks per run
// — a run never exhausts a probe's coverage).
const PROBE_STRIDE = 76;
export const PROBES: readonly (readonly [number, number])[] = Array.from(
  { length: 16 },
  (_, k) =>
    [
      36 + (k % 4) * PROBE_STRIDE,
      36 + Math.floor(k / 4) * PROBE_STRIDE,
    ] as readonly [number, number],
);

// The move/resize deltas (deterministic, small).
const DRAG_DX = 8;
const DRAG_DY = 6;
const RESIZE_DW = 4;
const RESIZE_DH = 3;

// Remote cursors: 8 users, an 80-move burst (one 60fps frame's worth —
// the BZ1 burst precedent).
export const USERS = 8;
export const CURSOR_BURST = 80;

export interface Shape {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Cursor {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface CursorState {
  readonly users: readonly Cursor[];
  readonly msgs: number;
}

// One undo-history entry: either a FULL scene snapshot (the naive
// strategy's per-op deep copy — the hazard) or the touched shape's old
// rect (the op-log candidate).
export type HistEntry =
  | { readonly kind: "snap"; readonly shapes: readonly Shape[] }
  | { readonly kind: "op"; readonly id: number; readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export interface WBState {
  readonly shapes: readonly Shape[];
  /** grid-bucket index over the shapes (empty until seeded) */
  readonly index: readonly (readonly Shape[])[];
  readonly history: readonly HistEntry[];
  readonly cursors: CursorState;
  readonly drags: number;
  readonly resizes: number;
  readonly undos: number;
  /** consumed probe cursor (drags and resizes share the sequence) */
  readonly probeIdx: number;
}

// The demo's initial state: an empty scene — seeding is the untimed
// setup op the scenarios run first.
export function whiteboardState(): WBState {
  return {
    shapes: [],
    index: [],
    history: [],
    cursors: {
      users: Array.from({ length: USERS }, (_, id) => ({
        id,
        x: 20 + id * 30,
        y: 20,
      })),
      msgs: 0,
    },
    drags: 0,
    resizes: 0,
    undos: 0,
    probeIdx: 0,
  };
}

// The deterministic seed: row-major grid placement, integer jitter on
// the sizes (min 24 = 2·SPACING keeps tiling gap-free).
export function seedShape(id: number): Shape {
  return {
    id,
    x: (id % COLS) * SPACING,
    y: Math.floor(id / COLS) * SPACING,
    w: 24 + (id % 7),
    h: 24 + (id % 5),
  };
}

export function seedShapes(): readonly Shape[] {
  return Array.from({ length: SHAPE_COUNT }, (_, i) => seedShape(i));
}

// --- the drag/resize/undo op shapes -------------------------------------

function probeXY(state: WBState): readonly [number, number] {
  const [vx, vy] = PROBES[state.probeIdx % PROBES.length]!;
  return [vx + WIN_X, vy + WIN_Y];
}

function historyFor(
  mode: "naive" | "log",
  before: WBState,
  hit: Shape,
): readonly HistEntry[] {
  const entry: HistEntry =
    mode === "naive"
      ? { kind: "snap", shapes: before.shapes.map((s) => ({ ...s })) }
      : { kind: "op", id: hit.id, x: hit.x, y: hit.y, w: hit.w, h: hit.h };
  return [...before.history, entry];
}

// One drag op shared by the three shapes: hit-test the probe, move the
// shape, record history per strategy. All three leave the SAME scene.
function dragOp(state: WBState, mode: "naive" | "log" | "grid"): WBState {
  const [wx, wy] = probeXY(state);
  const hit =
    mode === "grid" ? hitIndex(state.index, wx, wy) : hitLinear(state.shapes, wx, wy);
  if (hit === undefined) {
    return { ...state, drags: state.drags + 1, probeIdx: state.probeIdx + 1 };
  }
  const moved: Shape = { ...hit, x: hit.x + DRAG_DX, y: hit.y + DRAG_DY };
  const shapes = state.shapes.map((s) => (s.id === hit.id ? moved : s));
  const index =
    mode === "grid" ? indexMove(state.index, hit, moved) : state.index;
  return {
    ...state,
    shapes,
    index,
    history: historyFor(mode === "naive" ? "naive" : "log", state, hit),
    drags: state.drags + 1,
    probeIdx: state.probeIdx + 1,
  };
}

export function dragNaiveOp(state: WBState): WBState {
  return dragOp(state, "naive");
}

export function dragLogOp(state: WBState): WBState {
  return dragOp(state, "log");
}

export function dragGridOp(state: WBState): WBState {
  return dragOp(state, "grid");
}

// Resize: the same pipeline, growing the hit shape instead of moving it
// (linear hit-test + op-log history — the bz3-resize scenario's op).
export function resizeLogOp(state: WBState): WBState {
  const [wx, wy] = probeXY(state);
  const hit = hitLinear(state.shapes, wx, wy);
  if (hit === undefined) {
    return { ...state, resizes: state.resizes + 1, probeIdx: state.probeIdx + 1 };
  }
  const grown: Shape = {
    ...hit,
    w: hit.w + RESIZE_DW,
    h: hit.h + RESIZE_DH,
  };
  return {
    ...state,
    shapes: state.shapes.map((s) => (s.id === hit.id ? grown : s)),
    history: historyFor("log", state, hit),
    resizes: state.resizes + 1,
    probeIdx: state.probeIdx + 1,
  };
}

// Undo: pop the newest history entry — a snapshot restores the scene by
// reference; an op-log entry restores ONE shape's rect. Both leave the
// counters alone (the summary line shows the undo happened).
export function undoOp(state: WBState): WBState {
  const last = state.history[state.history.length - 1];
  if (last === undefined) return { ...state, undos: state.undos + 1 };
  const history = state.history.slice(0, -1);
  const shapes =
    last.kind === "snap"
      ? last.shapes
      : state.shapes.map((s) =>
          s.id === last.id ? { ...s, x: last.x, y: last.y, w: last.w, h: last.h } : s,
        );
  return { ...state, shapes, history, undos: state.undos + 1 };
}

// The untimed setup op: the full 10k scene + the bucket index, counters
// reset (bz3-seed seeds repeatedly; each seed is a fresh scene).
export function seedOp(state: WBState): WBState {
  const shapes = seedShapes();
  return {
    ...whiteboardState(),
    shapes,
    index: buildIndex(shapes),
  };
}

// --- remote cursors ------------------------------------------------------

// One message: move user (msgs % USERS) to its deterministic n-th
// position and bump the counter (the sequence number IS the position).
function cursorMsg(cs: CursorState, n: number): CursorState {
  return {
    users: cs.users.map((c) =>
      c.id === n % USERS ? { ...c, x: (n * 7) % 280, y: (n * 11) % 280 } : c,
    ),
    msgs: cs.msgs + 1,
  };
}

// The naive pump's per-message update (dispatched CURSOR_BURST times).
export function naiveMsgOp(state: WBState): WBState {
  return { ...state, cursors: cursorMsg(state.cursors, state.cursors.msgs) };
}

// The candidate: the whole burst folded into ONE update intent.
export function frameOp(state: WBState): WBState {
  let cs = state.cursors;
  for (let i = 0; i < CURSOR_BURST; i++) cs = cursorMsg(cs, cs.msgs);
  return { ...state, cursors: cs };
}

// --- the no-op guards ----------------------------------------------------

// Exact integer fold (values < 2^53 — the guard line's checksum).
export function checksum(shapes: readonly Shape[]): number {
  let acc = 0;
  for (const s of shapes) {
    acc = (acc + s.id * 31 + s.x * 7 + s.y * 3 + s.w * 11 + s.h * 5) % 1000000007;
  }
  return acc;
}

export function summaryLine(state: WBState): string {
  return (
    `shapes ${state.shapes.length} drags ${state.drags}` +
    ` resizes ${state.resizes} undos ${state.undos}` +
    ` msgs ${state.cursors.msgs} sum ${checksum(state.shapes)}`
  );
}
