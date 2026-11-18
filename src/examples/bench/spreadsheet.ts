// Purpose: the BZ7 spreadsheet benchmark app (tambor-54j.19) — a 1M-cell
//   logical grid with formulas, mounted as an ordinary gallery demo
//   through the same makeApp/SPA mount path as every other corpus app.
// Responsibilities: SpreadState, SHEET_PATH and the three op intents —
//   seedSheet (the untimed setup: literals, formulas, values, dep
//   index), editNaive (the §4.3 hazard: recompute EVERY formula per
//   edit) and editGraph (the candidate: recompute only the edited
//   cell's transitive dependents) — plus spreadsheetView (control row,
//   the fitted status labels, the 24×10 drawn window reflowed into
//   stage-width bands over the 1000×1000 logical grid) and
//   createSpreadsheetApp.
// Rationale: the point of the benchmark is the honest cost of the
//   dependency recompute interaction — the two timed ops apply the
//   SAME literal edit and leave the SAME final state (the status
//   line's edits counter and values checksum are the no-op guard, so
//   a misroute or a misrecompute fails loudly); the only variable is
//   the recompute strategy, implemented in spreadsheet-sheet.ts as
//   pure functions over plain data. The 1M grid is logical: the sparse
//   map holds 10k defined cells and the view draws only the visible
//   window (the keyed-table viewport pattern — never 1M DOM nodes).
//   Every drawn leaf must also fit the 300 px stage: the status line
//   wraps through fittedLabels and each logical row's ten cells are
//   packed into bands measured against the live label measure (the row
//   overflows that stage on its own at real font metrics — the 44 px
//   floor is about buttons, not cells), so all 240 cells stay drawn
//   without leaving the root.
//   No benchmark-specific fast paths: every op is an ordinary
//   ["update", …] intent applied by the registry-aware dispatcher.

import {
  button,
  label as labelNode,
  spacer,
  width,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import { fittedLabels, packRows } from "../../views/fit.ts";
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

// The horizontal gap horizontalLayout inserts between neighbours; the
// packer charges it per cell so a band's DRAWN width, not just the sum
// of its label widths, stays inside the stage.
const CELL_GAP = 1;

// One logical window row: VIS_COLS cell labels packed into horizontal
// bands whose measured widths fit the stage — the ten-cell row
// overflows the 300 px root on its own at real font metrics (a ref+value
// cell is several glyphs wide); the 44 px floor sizes buttons, never
// cells, so it was never what made the row overflow. Cell order, text
// and count are unchanged; only the band breaks are new.
function windowRow(row: number, sheet: Sheet): readonly Elem[] {
  const cells: Elem[] = [];
  for (let col = 0; col < VIS_COLS; col++) {
    cells.push(cellLabel(col, row, sheet));
  }
  const bands = packRows(cells, (cell) => width(cell) + CELL_GAP);
  return bands.map(
    (band) => horizontalLayout(band, CELL_GAP) as Elem,
  );
}

// The visible window: VIS_ROWS rows × VIS_COLS columns of drawn cells
// over the 1M-cell logical grid.
function windowGrid(sheet: Sheet): readonly Elem[] {
  const rows: Elem[] = [];
  for (let row = 1; row <= VIS_ROWS; row++) {
    rows.push(...windowRow(row, sheet));
  }
  return rows;
}

// The spreadsheet view: the control row, the fitted status labels,
// then the visible window — a pure function of the plain-data sheet.
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
    ...fittedLabels(statusLine(state.sheet)),
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
