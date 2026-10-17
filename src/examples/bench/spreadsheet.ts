// Purpose: the BZ7 spreadsheet benchmark app (tambor-54j.19) — a 1M-cell
//   logical grid with formulas, mounted as an ordinary gallery demo
//   through the same makeApp/SPA mount path as every other corpus app.
// Responsibilities: SpreadState, SHEET_PATH and the three op intents —
//   seedSheet (the untimed setup: literals, formulas, values, dep
//   index), editNaive (the §4.3 hazard: recompute EVERY formula per
//   edit) and editGraph (the candidate: recompute only the edited
//   cell's transitive dependents) — plus spreadsheetView (control row,
//   status line, the 24×10 drawn window over the 1000×1000 logical
//   grid) and createSpreadsheetApp.
// Rationale: the point of the benchmark is the honest cost of the
//   dependency recompute interaction — the two timed ops apply the
//   SAME literal edit and leave the SAME final state (the status
//   line's edits counter and values checksum are the no-op guard, so
//   a misroute or a misrecompute fails loudly); the only variable is
//   the recompute strategy, implemented in spreadsheet-sheet.ts as
//   pure functions over plain data. The 1M grid is logical: the sparse
//   map holds 10k defined cells and the view draws only the visible
//   window (the keyed-table viewport pattern — never 1M DOM nodes).
//   No benchmark-specific fast paths: every op is an ordinary
//   ["update", …] intent applied by the registry-aware dispatcher.

import {
  button,
  label as labelNode,
  spacer,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import {
  VIS_COLS,
  VIS_ROWS,
  editGraph,
  editNaive,
  emptySheet,
  seedSheet,
  statusLine,
  type Sheet,
} from "./spreadsheet-sheet.ts";

// The app state: one plain-data sheet node — a single keypath keeps
// each op's edit + recompute + counter in one atomic update.
export interface SpreadState {
  readonly sheet: Sheet;
}

export const SHEET_PATH: Path = [["keypath", "sheet"]];

// The demo's initial state: an empty sparse map — seeding is the
// untimed setup op.
export function spreadsheetState(): SpreadState {
  return { sheet: emptySheet() };
}

// The three ops as ordinary update intents over the one sheet path.
const SEED_INTENT: IntentList = [["update", SHEET_PATH, () => seedSheet()]];
const EDIT_NAIVE_INTENT: IntentList = [["update", SHEET_PATH, editNaive]];
const EDIT_GRAPH_INTENT: IntentList = [["update", SHEET_PATH, editGraph]];

// One drawn cell of the visible window: ref + value (or the empty
// marker for an undefined cell of the sparse map).
function cellLabel(
  col: number,
  row: number,
  sheet: Sheet,
): Elem {
  const ref = `${"ABCDEFGHIJ"[col] as string}${row}`;
  const value = sheet.values[ref];
  const text = value === undefined ? `${ref} ·` : `${ref} ${value}`;
  return labelNode(text);
}

// The visible window: VIS_ROWS rows × VIS_COLS columns of drawn cells
// over the 1M-cell logical grid.
function windowGrid(sheet: Sheet): readonly Elem[] {
  const rows: Elem[] = [];
  for (let row = 1; row <= VIS_ROWS; row++) {
    const cells: Elem[] = [];
    for (let col = 0; col < VIS_COLS; col++) cells.push(cellLabel(col, row, sheet));
    rows.push(horizontalLayout(cells) as Elem);
  }
  return rows;
}

// The spreadsheet view: the control row, the status line, then the
// visible window — a pure function of the plain-data sheet.
export function spreadsheetView(state: SpreadState): Elem {
  const controls = horizontalLayout([
    button("Seed", (): IntentList => SEED_INTENT),
    spacer(5, 0),
    button("Edit naive", (): IntentList => EDIT_NAIVE_INTENT),
    spacer(5, 0),
    button("Edit graph", (): IntentList => EDIT_GRAPH_INTENT),
  ]) as Elem;
  const body = [
    controls,
    labelNode(statusLine(state.sheet)),
    spacer(0, 10),
    ...windowGrid(state.sheet),
  ] as readonly Elem[];
  return (verticalLayout(body) ?? controls) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createSpreadsheetApp(): App {
  return makeApp({
    view: (state) => spreadsheetView(state as SpreadState),
    state: spreadsheetState(),
    backend: { containerSize: VIEWPORT },
  });
}
