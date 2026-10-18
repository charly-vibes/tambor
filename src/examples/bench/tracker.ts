// Purpose: the BZ4 tracker benchmark app (tambor-54j.16) — a Jira-like
//   board over 5 000 issues in five columns, mounted as an ordinary
//   gallery demo through the same makeApp/SPA mount path as every
//   other corpus app.
// Responsibilities: TrackerState wrapper + TRACKER_PATH and the op
//   intents — seedTracker (the untimed setup), moveNaive/moveWindow
//   (the §4.3 rendering-every-row hazard vs the virtual-window
//   candidate), filterNaive/filterMemo (the recomputed-filters hazard
//   vs the memoised-derived-paths candidate) and editOptimistic — plus
//   trackerView (two control rows, the status line, the five-column
//   board) and createTrackerApp.
// Rationale: the op strategies live in tracker-board.ts as pure
//   functions over plain state; this file is only the view. Every
//   button is an ordinary ["update", …] intent applied by the
//   registry-aware dispatcher — drag-drop is simulated as the move-one
//   op the harness replays as a click. The board renders
//   state.drawIds (the plots-precedent draw-in-state), so the naive
//   and candidate ops differ only in what they put there; the status
//   line (counts + revision checksum) is the no-op guard both variants
//   must leave identical.

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
  COLUMN_KEYS,
  editOptimistic,
  filterMemo,
  filterNaive,
  moveNaive,
  moveWindow,
  seedTracker,
  statusLine,
  trackerState,
  type TrackerState,
} from "./tracker-board.ts";

// The whole-state path: one op moves/issues/edits and redraws together
// (the stream-dashboard shape).
export const TRACKER_PATH: Path = [] as unknown as Path;

// The demo's initial state: an empty board — seeding is the untimed
// setup op.
export function trackerDemoState(): TrackerState {
  return trackerState();
}

// The op intents, as ordinary update intents over the whole state.
const SEED_INTENT: IntentList = [["update", TRACKER_PATH, () => seedTracker()]];
const MOVE_NAIVE_INTENT: IntentList = [["update", TRACKER_PATH, moveNaive]];
const MOVE_WINDOW_INTENT: IntentList = [["update", TRACKER_PATH, moveWindow]];
const FILTER_NAIVE_INTENT: IntentList = [["update", TRACKER_PATH, filterNaive]];
const FILTER_MEMO_INTENT: IntentList = [["update", TRACKER_PATH, filterMemo]];
const EDIT_INTENT: IntentList = [["update", TRACKER_PATH, editOptimistic]];

// One op button: an ordinary handler returning its plain-data update.
function opButton(text: string, intent: IntentList): Elem {
  return button(text, (): IntentList => intent);
}

// One board column: the header label (the column's true count) over
// the drawn issue rows (all of them, or the window slice — whatever
// the op put in drawIds).
function boardColumn(key: string, state: TrackerState, col: number): Elem {
  const header = labelNode(`${key} ${state.columns[col]?.length ?? 0}`) as Elem;
  const rows = (state.drawIds[col] ?? []).map((id) => {
    const issue = state.issues[id];
    return labelNode(`#${id} v${issue?.version ?? 0}`) as Elem;
  });
  const body = [header, ...rows] as readonly Elem[];
  return (verticalLayout(body) ?? header) as Elem;
}

// The board: the five columns side by side.
function board(state: TrackerState): Elem {
  const columns = COLUMN_KEYS.map((key, c) => boardColumn(key, state, c));
  return (horizontalLayout(columns) ?? labelNode("no board")) as Elem;
}

// The tracker view: the control rows, the status line, then the board
// — a pure function of the plain-data state.
export function trackerView(state: TrackerState): Elem {
  const row1 = horizontalLayout([
    opButton("Seed", SEED_INTENT),
    spacer(5, 0),
    opButton("Move naive", MOVE_NAIVE_INTENT),
    spacer(5, 0),
    opButton("Move window", MOVE_WINDOW_INTENT),
  ]) as Elem;
  const row2 = horizontalLayout([
    opButton("Filter naive", FILTER_NAIVE_INTENT),
    spacer(5, 0),
    opButton("Filter memo", FILTER_MEMO_INTENT),
    spacer(5, 0),
    opButton("Opt edit", EDIT_INTENT),
  ]) as Elem;
  const body = [
    row1,
    spacer(0, 4),
    row2,
    spacer(0, 4),
    labelNode(statusLine(state)),
    spacer(0, 4),
    board(state),
  ] as readonly Elem[];
  return (verticalLayout(body) ?? row1) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createTrackerApp(): App {
  return makeApp({
    view: (state) => trackerView(state as TrackerState),
    state: trackerDemoState(),
    backend: { containerSize: VIEWPORT },
  });
}
