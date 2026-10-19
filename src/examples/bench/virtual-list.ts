// Purpose: the virtual-list benchmark app (tambor-54j.8.2) — a 10k-row
//   list whose rows are derived from the index (the raw stream is never
//   stored: the state is the summary triple count + offset + mode),
//   mounted as an ordinary gallery demo through the same makeApp/SPA
//   mount path as every other corpus app.
// Responsibilities: VirtualListState (count, offset, mode),
//   LIST_COUNT_PATH/OFFSET_PATH/MODE_PATH, the op builders — drawAll /
//   windowAll (10k items, whole-view vs windowed mode), scrollRows
//   (+1 row, the measured op) — and virtualListView: a control row of
//   op buttons over the mode's body.
// Rationale: no benchmark-specific fast paths: every op is an ordinary
//   ["update", …] intent applied by the registry-aware dispatcher. The
//   whole-view mode is the honest failing-before meter (tambor-54j.8.2):
//   every scroll op re-derives and re-draws all 10k rows — the same
//   whole-view redraw the notebook-chain-200 finding names as the
//   dominant cost, at 50× the card count. The windowed mode draws only
//   the visible window through the components.virtual_list component
//   (src/components/virtual_list). The offset is the scroll position in
//   pixels — rows * pitch — in BOTH modes, so the same +1-row op drives
//   both bodies and the component's $offset wheel binding stays
//   pixel-consistent. Rows are label text derived from the index — no
//   list is ever materialised in state, which is the windowing
//   acceptance from the component side too.

import {
  button,
  label as labelNode,
  spacer,
  height,
  translate,
  type Elem,
  type Vec2,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { render, call } from "../../model/component.ts";
import { virtualList, windowSummary } from "../../components/virtual_list/index.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// The bench's row count: one draw op materialises this many rows.
export const LIST_COUNT = 10000;

// The row gap (the layout gap the whole-view stack uses).
export const ROW_GAP = 1;

// The list modes: whole-view redraw (the failing-before meter) and
// windowed draw through the virtual-list component (the candidate).
export type ListMode = "full" | "window";

// The app state: plain summaries — the item count, the scroll offset
// in pixels (rows * pitch) and the draw mode. The rows are never stored.
export interface VirtualListState {
  readonly count: number;
  readonly offset: number;
  readonly mode: ListMode;
}

// The paths the op buttons update.
export const LIST_COUNT_PATH: Path = [["keypath", "count"]];
export const OFFSET_PATH: Path = [["keypath", "offset"]];
export const MODE_PATH: Path = [["keypath", "mode"]];

// The demo's initial state: zero rows at offset 0, whole-view mode —
// the draw op is the measured setup.
export function virtualListState(): VirtualListState {
  return { count: 0, offset: 0, mode: "full" };
}

// The drawn row: one label carrying the index — derived from the
// index, never stored.
function rowLabel(i: number): Elem {
  return labelNode(`row ${i}`);
}

// The row pitch: the measured label height plus the layout gap, so a
// one-row scroll moves the same distance in both modes.
export function rowPitch(): number {
  return height(rowLabel(0)) + ROW_GAP;
}

// Draw all: the count becomes the full list size in whole-view mode.
export function drawAll(): number {
  return LIST_COUNT;
}

// One row further: the measured op (+1 row on the offset, exactly the
// state transition a scroll gesture produces — the offset is pixels,
// so one row is one pitch).
export function scrollRows(rows: number): (old: unknown) => number {
  return (old) => (old as number) + rows * rowPitch();
}

// The whole-view body: every row drawn, translated by the offset —
// re-derived whole on every op (the honest whole-view measure,
// form-200's weak-spot shape at 10k; the translate mirrors what the
// scrollview assembly does, so both modes make the same state
// transition visible).
function wholeView(state: VirtualListState): Elem {
  const readout = labelNode(`drawn ${state.count}`);
  const rows = verticalLayout(range(state.count).map(rowLabel)) ?? [];
  const scrolled = translate(0, -state.offset, rows) as Elem;
  const body = [readout, spacer(0, 10), scrolled] as readonly Elem[];
  return (verticalLayout(body) ?? readout) as Elem;
}

// The control row shared by both modes: the two draw strategies (the
// measured setup ops) and the scroll op both modes measure.
function controlsRow(state: VirtualListState): Elem {
  const scrollOp = (): IntentList => [["update", OFFSET_PATH, scrollRows(1)]];
  const drawOp = (mode: ListMode): IntentList => [
    ["update", LIST_COUNT_PATH, drawAll],
    ["update", MODE_PATH, (): ListMode => mode],
    ["update", OFFSET_PATH, (): number => 0],
  ];
  return (horizontalLayout([
    button("Draw all 10k", (): IntentList => drawOp("full")),
    spacer(5, 0),
    button("Window 10k", (): IntentList => drawOp("window")),
    spacer(5, 0),
    button("Scroll down", scrollOp),
    ...(state.mode === "window" ? [spacer(5, 0)] : []),
  ]) ?? labelNode("")) as Elem;
}

// The windowed body: the components.virtual_list component drawing
// only the rows intersecting the viewport, over the same summaries.
// The readout's from/at lines are ratios of the row pitch — the first
// window index and the offset in rows — so they are metric-independent
// guards (a dropped op or a mode flip changes them). The component's
// wrap nodes are event wrappers the layout geometry cannot measure, so
// the measurable head stack (controls + readout) is laid out normally
// and the component is translated below it.
function windowedView(state: VirtualListState): Elem {
  const pitch = rowPitch();
  const controls = controlsRow(state);
  const lineH = height(labelNode("window"));
  const headH = height(controls) + 10 + lineH;
  const viewport: Vec2 = [VIEWPORT[0], VIEWPORT[1] - headH - 10];
  const summary = windowSummary(state.count, pitch - ROW_GAP, ROW_GAP, state.offset, viewport[1]);
  const readout = labelNode(`window from ${summary.first} at ${Math.round(state.offset / pitch)}`);
  const head = (
    verticalLayout([controls, spacer(0, 10), readout]) ?? readout
  ) as Elem;
  const component = render(
    call(virtualList, {
      count: state.count,
      "row-height": pitch - ROW_GAP,
      gap: ROW_GAP,
      "scroll-bounds": viewport,
      offset: [0, state.offset],
      row: rowLabel,
      $offset: OFFSET_PATH,
    }),
  ) as Elem;
  return [head, translate(0, headH + 10, component) as Elem];
}

// The virtual-list view: the control row over the mode's body.
export function virtualListView(state: VirtualListState): Elem {
  if (state.mode === "window") return windowedView(state);
  const controls = controlsRow(state);
  const stack = [controls, spacer(0, 10), wholeView(state)] as readonly Elem[];
  return (verticalLayout(stack) ?? controls) as Elem;
}

// The integers 0..n-1, ascending.
function range(n: number): readonly number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createVirtualListApp(): App {
  return makeApp({
    view: (state) => virtualListView(state as VirtualListState),
    state: virtualListState(),
    backend: { containerSize: VIEWPORT },
  });
}
