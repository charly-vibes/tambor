// Purpose: the hit-testing half of the whiteboard bench app
//   (tambor-54j.15) — BZ3 of the bench business suite: the linear
//   10k-shape scan baseline and the grid-bucket index candidate, the
//   §4.3 "linear hit-testing" hazard made measurable and the explicit
//   evidence seam for tambor-54j.10 (the spatial-index component).
// Responsibilities: CELL/GRID (the 50px bucket grid over the 1200×1200
//   world), buildIndex (one pass at seed — every shape registered in
//   each cell its bbox overlaps), hitLinear vs hitIndex (the measured
//   pair) and indexMove (the candidate's maintenance cost: a moved
//   shape re-registers out of its old cells into its new ones).
// Rationale: the two hit-testers share ONE topmost rule — the
//   highest-id shape containing the point — so the drag variants hit
//   the SAME shape forever and the naive-vs-candidate medians measure
//   work shape, not data divergence (pinned in
//   tests/bench-whiteboard.test.ts). The max-id rule is
//   order-independent on purpose: cell membership is reordered by
//   moves, array order is not, and both must agree. Split from
//   whiteboard-scene.ts at the wave-2 file-size seam (>300 lines).

import type { Shape } from "./whiteboard-scene.ts";

// The world geometry (owned here — the bucket grid is world geometry,
// and the scene's 12px placement grid tiles the same 1200×1200 world).
export const SPACING = 12;
export const COLS = 100;
export const WORLD = SPACING * COLS;

// The grid-bucket index (the cheap spatial candidate): 50px cells over
// the world — 24×24 cells; a point query scans one cell (~tens of
// shapes) instead of the linear 10k.
export const CELL = 50;
export const GRID = WORLD / CELL;

function cellLo(v: number): number {
  return Math.max(0, Math.floor(v / CELL));
}

function cellHi(v: number): number {
  return Math.min(GRID - 1, Math.floor(v / CELL));
}

function cellsOf(s: Shape): readonly number[] {
  const out: number[] = [];
  for (let cy = cellLo(s.y); cy <= cellHi(s.y + s.h); cy++) {
    for (let cx = cellLo(s.x); cx <= cellHi(s.x + s.w); cx++) {
      out.push(cy * GRID + cx);
    }
  }
  return out;
}

// One pass over the scene: every shape registered in each cell its
// bbox overlaps. Build once at seed (the candidate's build cost — the
// bz3-seed scenario measures it).
export function buildIndex(
  shapes: readonly Shape[],
): readonly (readonly Shape[])[] {
  const cells: Shape[][] = Array.from(
    { length: GRID * GRID },
    () => [] as Shape[],
  );
  for (const s of shapes) {
    for (const idx of cellsOf(s)) cells[idx]!.push(s);
  }
  return cells;
}

function contains(s: Shape, x: number, y: number): boolean {
  return s.x <= x && x < s.x + s.w && s.y <= y && y < s.y + s.h;
}

// The linear baseline: a full scan of the scene. Returns the topmost
// (highest-id) shape containing the point — array order is id order
// forever (rebuilds preserve it), so a reverse scan finds it first.
export function hitLinear(
  shapes: readonly Shape[],
  x: number,
  y: number,
): Shape | undefined {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i]!;
    if (contains(s, x, y)) return s;
  }
  return undefined;
}

// The candidate: one bucket lookup, then the same containment rule
// over the cell's members (max id — order-independent, so a moved
// shape's re-registration cannot change which shape wins).
export function hitIndex(
  index: readonly (readonly Shape[])[],
  x: number,
  y: number,
): Shape | undefined {
  if (index.length === 0) return undefined;
  const cell = index[cellLo(y) * GRID + cellLo(x)]!;
  let best: Shape | undefined;
  for (const s of cell) {
    if (contains(s, x, y) && (best === undefined || s.id > best.id)) best = s;
  }
  return best;
}

// Re-register one moved shape: drop the old ref from its cells, add
// the moved ref to the new cells (affected cells rebuilt once).
export function indexMove(
  index: readonly (readonly Shape[])[],
  old: Shape,
  moved: Shape,
): readonly (readonly Shape[])[] {
  const touched = new Set<number>([...cellsOf(old), ...cellsOf(moved)]);
  const next = [...index];
  for (const idx of touched) {
    let cell = index[idx]!.filter((s) => s.id !== old.id);
    if (cellsOf(moved).includes(idx)) cell = [...cell, moved];
    next[idx] = cell;
  }
  return next;
}
