// Purpose: the keyed-table benchmark app (tambor-yx8) — B1 of the bench
//   core suite: a js-framework-benchmark-style table over 1000 keyed
//   rows, mounted as an ordinary gallery demo through the same
//   makeApp/SPA mount path as every other corpus app.
// Responsibilities: KeyedRow/KeyedTableState, keyedTableState (empty
//   rows), KEYED_ROWS_PATH, keyedTableView (a control row of op buttons
//   over the row stack), and the op builders — buildRows (1000 fresh
//   rows), replaceEveryTenth (10% relabel), swapFirstTwo (2-row swap),
//   removeEveryHundredth (~10 rows), appendRows (1k more rows).
// Rationale: no benchmark-specific fast paths: the view is a pure
//   function of plain state and every op is an ordinary ["update", …]
//   intent applied by the registry-aware dispatcher — the same
//   plain-data edit shape the todo example's add-todo uses
//   (src/examples/todo/todo.ts). Rows are keyed by id and each drawn
//   label carries "row <id> — <label>", so the real DOM the backend
//   emits reflects the row identity the ops mutate; the demo starts
//   with empty rows so a "Build 1000" click is the measured creation
//   op (scenario keyed-table-build) and the ops scenario runs after an
//   untimed build (scenario keyed-table-ops).

import {
  button,
  label as labelNode,
  spacer,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { Intent, IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// The keyed row shape: a stable id (the key the ops preserve) and a
// mutable label (the datum the replace op rewrites).
export interface KeyedRow {
  readonly id: number;
  readonly label: string;
}

// The app state: plain data — the row list and nothing else.
export interface KeyedTableState {
  readonly rows: readonly KeyedRow[];
}

// The path the op buttons update.
export const KEYED_ROWS_PATH: Path = [["keypath", "rows"]];

// The demo's initial state: zero rows — building them is the measured op.
export function keyedTableState(): KeyedTableState {
  return { rows: [] };
}

// The integers 0..n-1, ascending.
function range(n: number): readonly number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// The largest id already in use (−1 when empty), so fresh ids never
// collide with rows still on screen after an append or rebuild.
function maxId(rows: readonly KeyedRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), -1);
}

// Fresh rows labelled "row <n>" (js-framework-benchmark's create 1,000
// rows): ids continue after anything already present.
export function buildRows(
  current: readonly KeyedRow[],
): readonly KeyedRow[] {
  const start = maxId(current) + 1;
  return range(1000).map((i) => ({ id: start + i, label: `row ${start + i}` }));
}

// Replace every 10th row's label (js-framework-benchmark's partial
// update): ~10% of the table relabelled, ids untouched.
export function replaceEveryTenth(
  rows: readonly KeyedRow[],
): readonly KeyedRow[] {
  return rows.map((row, i) =>
    i % 10 === 9 ? { ...row, label: "!!!" } : row,
  );
}

// Swap the first two rows (js-framework-benchmark's swap rows).
export function swapFirstTwo(
  rows: readonly KeyedRow[],
): readonly KeyedRow[] {
  if (rows.length < 2) return rows;
  const [a, b, ...rest] = rows;
  return [b as KeyedRow, a as KeyedRow, ...rest];
}

// Remove every 100th row: ~10 of the 1000 rows leave the table.
export function removeEveryHundredth(
  rows: readonly KeyedRow[],
): readonly KeyedRow[] {
  return rows.filter((_, i) => i % 100 !== 99);
}

// Append 1,000 more rows (js-framework-benchmark's append).
export function appendRows(
  rows: readonly KeyedRow[],
): readonly KeyedRow[] {
  const start = maxId(rows) + 1;
  const extra = range(1000).map((i) => ({
    id: start + i,
    label: `row ${start + i}`,
  }));
  return [...rows, ...extra];
}

// One op button: an ordinary handler returning its plain-data update.
function opButton(text: string, op: (rows: readonly KeyedRow[]) => readonly KeyedRow[]): Elem {
  return button(text, (): IntentList => [["update", KEYED_ROWS_PATH, op]]);
}

// The drawn row: one label carrying the row's id and label.
function rowLabel(row: KeyedRow): Elem {
  return labelNode(`row ${row.id} — ${row.label}`);
}

// The keyed-table view: the control row, a spacer, then the row stack.
// The buttons' update intents route through the app's dispatcher; the
// rows are plain labels — pure view, no state of their own.
export function keyedTableView(state: KeyedTableState): Elem {
  const controls = horizontalLayout([
    opButton("Build 1000", buildRows),
    spacer(5, 0),
    opButton("Replace 10%", replaceEveryTenth),
    spacer(5, 0),
    opButton("Swap Rows", swapFirstTwo),
    spacer(5, 0),
    opButton("Remove 10", removeEveryHundredth),
    spacer(5, 0),
    opButton("Append 1k", appendRows),
  ]) as Elem;
  const rows = (verticalLayout(state.rows.map(rowLabel)) ?? []) as readonly Elem[];
  const body = [controls, spacer(0, 10), ...rows] as readonly Elem[];
  return (verticalLayout(body) ?? controls) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createKeyedTableApp(): App {
  return makeApp({
    view: (state) => keyedTableView(state as KeyedTableState),
    state: keyedTableState(),
    backend: { containerSize: VIEWPORT },
  });
}
