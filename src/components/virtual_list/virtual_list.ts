// Purpose: the virtual-list component — a fixed-row-height list that
//   draws only the window of rows intersecting the viewport
//   (components.virtual_list), composed over the scrollview assembly
//   for clipping, wheel scrolling and the scrollbar.
// Responsibilities: the virtual-list component with props count, row
//   height, gap, overscan, scroll-bounds, offset (default [0, 0]), row
//   (the per-index row renderer) and $offset; the view assembly — the
//   window's rows placed at their arithmetic offsets inside the
//   scrollview body (an extent-sized spacer carries the scroll range),
//   and the summary record the windowed state derives from.
// Rationale: openspec/specs/components-virtual_list/spec.md is the design
//   authority. The window math lives in geometry.ts (pure function of
//   the summaries plus the viewport bounds — no DOM measuring,
//   offsets_arithmetic). The component holds no state of its own: the
//   app owns count and offset (plain summaries — count_summary_state),
//   and rows are pulled per index through the row renderer exactly for
//   the drawn window (drawn_window_only), so a 10k-row list draws ~20
//   rows per op. Scrolling and the scroll range reuse the scrollview's
//   tested machinery (wheelIntents, scrollMax, the scrollbars) with the
//   total set to [viewport width, content extent].

import {
  translate,
  spacer,
  type Elem,
  type Vec2,
} from "../../views/model.ts";
import {
  wrapOn,
  type EventElem,
  type WrapHandler,
} from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import {
  defineComponent,
  type Component,
  type Props,
} from "../../model/component.ts";
import { wheelIntents } from "../scrollview/scrollview.ts";
import { verticalScrollbar } from "../scrollview/scrollbar.ts";
import { rowOffset, windowSummary } from "./geometry.ts";

// The pointer kinds the clip gates, half-open like the event model —
// the scrollview assembly's rule over the windowed body.
const CLIP_KINDS: readonly string[] = [
  "mouse-down",
  "mouse-up",
  "mouse-move",
  "scroll",
  "drop",
];

// Pointer events outside the viewport do nothing (the scrollview clip
// gate over the windowed content).
function clipGate(viewport: Vec2): WrapHandler {
  return (defaultHandler, pos) => {
    const p = (pos ?? [0, 0]) as Vec2;
    if (p[0] < 0 || p[0] >= viewport[0] || p[1] < 0 || p[1] >= viewport[1]) {
      return [];
    }
    return defaultHandler();
  };
}

// The scroll gate: children win first (a nested scrollview scrolls
// itself); otherwise the wheel delta updates the offset through the
// scrollview's wheel rule over the content extent.
function scrollGate(
  viewport: Vec2,
  offset: Vec2,
  extent: number,
  $offset: Path,
): WrapHandler {
  return (defaultHandler, pos, event) => {
    const p = (pos ?? [0, 0]) as Vec2;
    if (p[0] < 0 || p[0] >= viewport[0] || p[1] < 0 || p[1] >= viewport[1]) {
      return [];
    }
    const child = defaultHandler();
    if (child.length > 0) return child;
    const delta = (event as { delta?: Vec2 } | undefined)?.delta;
    if (delta === undefined) return [];
    return wheelIntents(offset, delta, [viewport[0], extent], viewport, $offset);
  };
}

// The window's rows: the row renderer pulled per index exactly for the
// drawn window, each row translated to its arithmetic offset
// (drawn_window_only, offsets_arithmetic).
function windowRows(
  row: (index: number) => Elem,
  summary: { readonly first: number; readonly last: number },
  rowHeight: number,
  gap: number,
): readonly Elem[] {
  const rows: Elem[] = [];
  for (let i = summary.first; i < summary.last; i++) {
    rows.push(translate(0, rowOffset(i, rowHeight, gap), row(i)));
  }
  return rows;
}

// The vertical scrollbar drawn when the extent exceeds the viewport
// (the scrollview bars rule over the content extent).
function scrollbarBars(
  summary: { readonly extent: number },
  viewport: Vec2,
  offset: Vec2,
  $offset: Path,
): readonly EventElem[] {
  if (summary.extent <= viewport[1]) return [];
  return [
    verticalScrollbar({
      offset,
      total: [viewport[0], summary.extent],
      viewport,
      $offset,
    }),
  ];
}

// The virtual-list's view: the window's rows at their arithmetic
// offsets under the scrollview clip, plus the vertical scrollbar when
// the extent exceeds the viewport. The stored offset is used as-is.
export function virtualListView(props: Props): readonly EventElem[] {
  const offset = (props["offset"] as Vec2 | undefined) ?? [0, 0];
  const viewport = props["scroll-bounds"] as Vec2;
  const count = props["count"] as number;
  const rowHeight = props["row-height"] as number;
  const gap = (props["gap"] as number | undefined) ?? 0;
  const overscan = (props["overscan"] as number | undefined) ?? 0;
  const row = props["row"] as ((index: number) => Elem) | undefined;
  const $offset = props["$offset"] as Path;

  const summary = windowSummary(count, rowHeight, gap, offset[1], viewport[1], overscan);
  if (row === undefined) return [];
  // the extent-sized spacer carries the scroll range so the scrollview
  // assembly's range formula computes over the whole content
  const body: Elem = [
    ...windowRows(row, summary, rowHeight, gap),
    spacer(viewport[0], summary.extent),
  ];
  const gated = wrapOn(
    CLIP_KINDS.map(
      (kind) =>
        [
          kind,
          kind === "scroll"
            ? scrollGate(viewport, offset, summary.extent, $offset)
            : clipGate(viewport),
        ] as const,
    ),
    translate(-offset[0], -offset[1], body),
  );
  return [gated, ...scrollbarBars(summary, viewport, offset, $offset)];
}

// The virtual-list component: offset defaults to [0, 0].
export const virtualList: Component = defineComponent(
  "virtual_list",
  [
    {
      keys: ["count", "row-height", "gap", "overscan", "scroll-bounds", "offset", "row"],
      defaults: { offset: [0, 0], gap: 0, overscan: 0 },
    },
  ],
  (props) => virtualListView(props),
);
