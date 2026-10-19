// Purpose: the virtual-list benchmark app (tambor-54j.8.2) — a 10k-row
//   list whose rows are derived from the index (the raw stream is never
//   stored: the state is the summary pair count + offset), mounted as
//   an ordinary gallery demo through the same makeApp/SPA mount path
//   as every other corpus app.
// Responsibilities: VirtualListState (count, offset, mode),
//   LIST_COUNT_PATH/OFFSET_PATH/MODE_PATH, the op builders — drawAll
//   (10k items, whole-view mode), windowAll (10k items, windowed mode),
//   scrollDown (+1 row, the measured op) — and virtualListView: a
//   control row of op buttons over the drawn rows.
// Rationale: no benchmark-specific fast paths: every op is an ordinary
//   ["update", …] intent applied by the registry-aware dispatcher. The
//   whole-view mode is the honest failing-before meter (tambor-54j.8.2):
//   every scroll op re-derives and re-draws all 10k rows — the same
//   whole-view redraw the notebook-chain-200 finding names as the
//   dominant cost, at 50× the card count. The windowed mode draws only
//   the visible window through the components.virtual-list component
//   (src/components/virtual-list). Rows are label text derived from the
//   index — no list is ever materialised in state, which is the
//   windowing acceptance from the component side too.

import {
  button,
  label as labelNode,
  spacer,
  height,
  translate,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// The bench's row count: one draw op materialises this many rows.
export const LIST_COUNT = 10000;

// The row gap (the layout gap the whole-view stack uses).
export const ROW_GAP = 1;

// The list modes: whole-view redraw (the failing-before meter) and
// windowed draw through the virtual-list component (the candidate).
export type ListMode = "full" | "window";

// The app state: plain summaries — the item count, the scroll offset
// in rows and the draw mode. The rows themselves are never stored.
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

// The integers 0..n-1, ascending.
function range(n: number): readonly number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// Draw all: the count becomes the full list size in whole-view mode.
export function drawAll(): number {
  return LIST_COUNT;
}

// One row further: the measured op (+1 row on the offset, exactly the
// state transition a scroll gesture produces).
export function scrollDown(rows: number): (old: unknown) => number {
  return (old) => (old as number) + rows;
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

// The whole-view body: every row drawn, translated by the offset —
// re-derived whole on every op (the honest whole-view measure,
// form-200's weak-spot shape at 10k; the translate mirrors what the
// scrollview assembly does, so both modes make the same state
// transition visible).
function wholeView(state: VirtualListState): Elem {
  const readout = labelNode(`drawn ${state.count}`);
  const rows = verticalLayout(range(state.count).map(rowLabel)) ?? [];
  const scrolled = translate(0, -state.offset * rowPitch(), rows) as Elem;
  const body = [readout, spacer(0, 10), scrolled] as readonly Elem[];
  return (verticalLayout(body) ?? readout) as Elem;
}

// The virtual-list view: the control row over the mode's body.
export function virtualListView(state: VirtualListState): Elem {
  const controls = horizontalLayout([
    button("Draw all 10k", (): IntentList => [
      ["update", LIST_COUNT_PATH, drawAll],
      ["update", MODE_PATH, (): ListMode => "full"],
      ["update", OFFSET_PATH, (): number => 0],
    ]),
    spacer(5, 0),
    button("Scroll down", (): IntentList => [
      ["update", OFFSET_PATH, scrollDown(1)],
    ]),
  ]) as Elem;
  const body = [controls, spacer(0, 10), wholeView(state)] as readonly Elem[];
  return (verticalLayout(body) ?? controls) as Elem;
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
