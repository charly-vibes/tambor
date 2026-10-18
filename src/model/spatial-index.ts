// Purpose: the spatial hit-test index (tambor-54j.10, I12) — an
//   internal accelerator for pointer-move hit-testing over rectangle
//   scenes, so a 10k-shape canvas hits in one bucket lookup instead of
//   a linear scan.
// Responsibilities: buildHitIndex (one pass, every item registered in
//   each grid cell its bbox overlaps), hitAt (the bucket query),
//   hitIndexMove (a moved item re-registers out of its old cells into
//   its new ones) and hitLinearRef — the linear reverse-walk reference
//   the index must be byte-identical to.
// Rationale: dispatch semantics are unchanged — the linear walk's rule
//   (scan from the end, first containing item wins) is exactly "the
//   containing item with the greatest original position", so members
//   carry their original scene position and the bucket query resolves
//   to the max-position containing candidate. Cell membership scrambles
//   array order; the position comparison is what keeps the two walkers
//   in agreement (the whiteboard-index.ts max-id rule, generalized to
//   arbitrary item order — correctness never depends on bucket order,
//   containment is always verified per member). Half-open bbox
//   containment (hit_half_open): right/bottom edges exclusive.
//   Rectangles only — the BZ3 profile's shapes; no generalization
//   beyond them (anti-goal). Items carry their own bbox geometry; the
//   index snapshots bboxes at build/move time (move through
//   hitIndexMove, which re-registers with the new geometry). Grid
//   indices clamp into [0, side-1] — clamping only affects bucketing,
//   never results.

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// One grid cell's members: the item, its original scene position (the
// reverse-walk rule) and its bbox snapshot (the containment rule).
interface CellMember<T> {
  item: T;
  pos: number;
  bbox: BBox;
}

export interface HitIndex<T> {
  readonly cells: readonly (readonly CellMember<T>[])[];
  readonly side: number;
  readonly cell: number;
}

function clampCell(v: number, side: number): number {
  return Math.min(side - 1, Math.max(0, Math.floor(v)));
}

function cellsOfBox(b: BBox, side: number, cell: number): number[] {
  const out: number[] = [];
  // -1e-9: a bbox edge exactly on a cell boundary owns only the cell
  // it ends in (half-open on the max side, mirroring containment)
  const loX = clampCell(Math.floor(b.x / cell), side);
  const loY = clampCell(Math.floor(b.y / cell), side);
  const hiX = clampCell(Math.floor((b.x + b.w - 1e-9) / cell), side);
  const hiY = clampCell(Math.floor((b.y + b.h - 1e-9) / cell), side);
  for (let cy = loY; cy <= hiY; cy++) {
    for (let cx = loX; cx <= hiX; cx++) out.push(cy * side + cx);
  }
  return out;
}

function containsBox(b: BBox, x: number, y: number): boolean {
  return b.x <= x && x < b.x + b.w && b.y <= y && y < b.y + b.h;
}

// One pass over the scene: every item registered in each cell its bbox
// overlaps. Square grid, side = ceil(sqrt(n)); the caller tunes the
// bucket fill via `cell`.
export function buildHitIndex<T extends BBox>(
  items: readonly T[],
  cell: number,
): HitIndex<T> {
  const side = Math.max(1, Math.ceil(Math.sqrt(items.length)));
  const cells: CellMember<T>[][] = Array.from(
    { length: side * side },
    () => [] as CellMember<T>[],
  );
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const bbox: BBox = { x: item.x, y: item.y, w: item.w, h: item.h };
    for (const idx of cellsOfBox(bbox, side, cell)) {
      cells[idx]!.push({ item, pos: i, bbox });
    }
  }
  return { cells, side, cell };
}

// The linear reference: scan from the end, first containing item wins
// (the dispatch walk's rule — dispatchGroup iterates children in
// reverse and the first match is terminal). O(n) per query; the index
// exists so scenes that make this the bottleneck can stop paying it.
export function hitLinearRef<T extends BBox>(
  items: readonly T[],
  x: number,
  y: number,
): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const s = items[i]!;
    if (s.x <= x && x < s.x + s.w && s.y <= y && y < s.y + s.h) return s;
  }
  return undefined;
}

// The bucket query: one cell lookup, then the reverse-walk rule over
// the cell's members — the containing candidate with the greatest
// original position. Byte-identical to hitLinearRef (equivalence is
// pinned as a property in tests/spatial-index.test.ts).
export function hitAt<T>(
  index: HitIndex<T>,
  x: number,
  y: number,
): T | undefined {
  if (index.cells.length === 0) return undefined;
  const cx = clampCell(Math.floor(x / index.cell), index.side);
  const cy = clampCell(Math.floor(y / index.cell), index.side);
  const cell = index.cells[cy * index.side + cx];
  if (cell === undefined || cell.length === 0) return undefined;
  let best: CellMember<T> | undefined;
  for (const m of cell) {
    if (!containsBox(m.bbox, x, y)) continue;
    if (best === undefined || m.pos > best.pos) best = m;
  }
  return best?.item;
}

// Re-register one moved item: drop its old refs, add it back with the
// new geometry into its new cells. The member's original position is
// preserved, so the topmost rule is unchanged by the move — the
// whiteboard-index.ts invariant. Ownership: `item` is the scene's
// (unchanged) object whose CURRENT bbox is the old geometry; `to` is
// the moved geometry, snapshotted into the index.
export function hitIndexMove<T>(
  index: HitIndex<T>,
  item: T,
  to: BBox,
): HitIndex<T> {
  const oldCells = new Set<number>();
  const newCells = cellsOfBox(to, index.side, index.cell);
  // find the member's old cells by scanning for its refs (bounded by
  // the cells it actually occupies, not the grid)
  let pos = 0;
  let oldBox: BBox | undefined;
  for (let idx = 0; idx < index.cells.length; idx++) {
    const members = index.cells[idx]!;
    for (const m of members) {
      if (m.item === item) {
        oldCells.add(idx);
        pos = m.pos;
        oldBox = m.bbox;
      }
    }
  }
  if (oldBox === undefined) return index; // not registered — no-op
  const next = index.cells.map((members, idx): CellMember<T>[] => {
    if (!oldCells.has(idx) && !newCells.includes(idx)) return [...members];
    const filtered = members.filter((m) => m.item !== item);
    if (newCells.includes(idx)) {
      filtered.push({ item, pos, bbox: { ...to } });
    }
    return filtered;
  });
  // cells the item newly enters may not exist as rows yet — they do:
  // next is a full copy of the dense grid, every row present.
  return { cells: next, side: index.side, cell: index.cell };
}
