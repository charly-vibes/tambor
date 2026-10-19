// Purpose: the virtual-list window geometry (components.virtual_list) —
//   the pure arithmetic that turns list summaries plus viewport bounds
//   into the visible row window.
// Responsibilities: rowOffset (row i's y offset), contentExtent (the
//   total content height), windowFor (the half-open [first, last) index
//   window with overscan padding) and windowSummary (the summary record
//   the windowed state carries — item count, step, extent, scroll
//   offset and the window bounds; never the item stream).
// Rationale: openspec/specs/components-virtual_list/spec.md is the design
//   authority. Offsets are arithmetic in the declared row height and
//   gap — no DOM measurement feeds them (offsets_arithmetic), which is
//   what keeps a 10k-row list's per-op work proportional to the window,
//   not the list. Degenerate inputs (count 0, viewport 0, step <= 0)
//   yield the empty window and finite numbers (empty_window_zero); the
//   summary is plain numbers only (count_summary_state).

// One row's y offset: the pure arithmetic the whole list's geometry
// rests on (offsets_arithmetic).
export function rowOffset(index: number, rowHeight: number, gap: number): number {
  return index * (rowHeight + gap);
}

// The total content height: count rows of rowHeight with (count - 1)
// gaps; zero rows have zero extent.
export function contentExtent(count: number, rowHeight: number, gap: number): number {
  return count <= 0 ? 0 : count * rowHeight + (count - 1) * gap;
}

// The half-open index window [first, last) of the rows that intersect
// the viewport [oy, oy + vh), padded by overscan rows each side and
// clamped to [0, count] (window_half_open, overscan_pads_window).
// Row i spans [i*step, i*step + h), so it intersects exactly when
// oy - h < i*step < oy + vh — the closed form below, which stays exact
// at gap boundaries and past the content end (where the overscan pad
// reaches back to the tail rows). Degenerate inputs (count 0, viewport
// 0, step <= 0) and empty intersections yield the empty window
// (empty_window_zero).
export function windowFor(
  oy: number,
  viewportH: number,
  count: number,
  rowHeight: number,
  gap: number,
  overscan = 0,
): { readonly first: number; readonly last: number } {
  const step = rowHeight + gap;
  if (count <= 0 || viewportH <= 0 || step <= 0) return { first: 0, last: 0 };
  const iMin = Math.max(0, Math.floor((oy - rowHeight) / step) + 1);
  const iMax = Math.ceil((oy + viewportH) / step);
  const first = Math.max(0, iMin - overscan);
  const last = Math.min(count, iMax + overscan);
  return first >= last ? { first: 0, last: 0 } : { first, last };
}

// The windowed state: summaries only — the item count, the row step,
// the content extent, the scroll offset and the half-open window
// bounds. No item list is carried (count_summary_state).
export interface WindowSummary {
  readonly count: number;
  readonly step: number;
  readonly extent: number;
  readonly offset: number;
  readonly first: number;
  readonly last: number;
}

// The summary record for a list state: the pure function of the
// summaries plus the viewport bounds the whole view derives from.
export function windowSummary(
  count: number,
  rowHeight: number,
  gap: number,
  oy: number,
  viewportH: number,
  overscan = 0,
): WindowSummary {
  const w = windowFor(oy, viewportH, count, rowHeight, gap, overscan);
  return {
    count,
    step: rowHeight + gap,
    extent: contentExtent(count, rowHeight, gap),
    offset: oy,
    first: w.first,
    last: w.last,
  };
}
