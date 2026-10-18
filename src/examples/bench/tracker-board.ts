// Purpose: the pure model half of the BZ4 tracker bench app
//   (tambor-54j.16) — a Jira-like board over 5 000 issues in five
//   columns, plus the §4.3 op strategies the scenarios contrast: the
//   board move (drag-drop simulated as a move-one op) drawn every-row
//   vs visible-window, the open filter recomputed per op vs read from
//   the memoised derived indexes, and the optimistic edit +
//   reconciliation (conflict OUTCOMES are the wanna tracker's
//   candidate — deferred there, not built here).
// Responsibilities: the Issue/TrackerState shapes (all plain data),
//   ISSUE_COUNT/COLUMN_KEYS/VIS_ROWS, seedTracker (5 000 deterministic
//   issues + the memoised column/open indexes), moveShared (one issue
//   moved to the next column, the two touched index entries maintained
//   in place), moveNaive/moveWindow (the same state, the full vs
//   windowed drawIds), filterNaive/filterMemo (the same toggle, a full
//   rescan vs the precomputed lists), editOptimistic (optimistic write
//   + reconcile settle), statusLine and revisionOf (the drawn no-op
//   guards).
// Rationale: the memoised derived paths candidate (cf.
//   dashboard-derived.ts / BZ7's dependency index) lives IN state —
//   `columns` and `openCols` are per-column id indexes maintained
//   incrementally by each op, so the memo filter op reads them (O(1)
//   toggle) while the naive op rescans all 5 000 issues per op; the
//   draw is decoupled as `drawIds` (the plots-precedent draw-in-state),
//   so the move pair varies ONLY the drawn surface (all 5 000 rows vs
//   the first VIS_ROWS per column) over an identical abstract state —
//   the §4.3 hazards measured in isolation. No benchmark-specific fast
//   paths: every op is an ordinary ["update", …] intent applied by the
//   registry-aware dispatcher.

// The board: 5 000 issues across five columns (a Jira-like Backlog →
// Done flow plus a Blocked column), seeded deterministically.
export const ISSUE_COUNT = 5000;
export const COLUMN_COUNT = 5;
export const COLUMN_KEYS: readonly string[] = [
  "backlog",
  "active",
  "review",
  "done",
  "blocked",
];

// The visible-window board draw: the first VIS_ROWS issue rows per
// column (the keyed-table precedent — the board viewport pattern).
export const VIS_ROWS = 8;

// Every EDIT_STRIDE-th counter position picks the edited issue id.
export const EDIT_STRIDE = 7;

// One issue: stable id (its index in `issues`), the column it sits in,
// its open flag (what the filter reads), a title and a revision
// (what the optimistic edit bumps).
export interface Issue {
  readonly id: number;
  readonly col: number;
  readonly open: boolean;
  readonly title: string;
  readonly version: number;
}

// The memoised derived paths: per-column id indexes (ascending, seeded
// order) maintained incrementally by every mutating op — never rebuilt
// by a view or a derive.
export interface TrackerState {
  readonly issues: readonly Issue[];
  readonly columns: readonly (readonly number[])[];
  readonly openCols: readonly (readonly number[])[];
  readonly filterOpen: boolean;
  readonly moves: number;
  readonly edits: number;
  readonly drawIds: readonly (readonly number[])[];
}

// The demo's initial state: an empty board — seeding is the untimed
// setup op.
export function trackerState(): TrackerState {
  return {
    issues: [],
    columns: COLUMN_KEYS.map(() => []),
    openCols: COLUMN_KEYS.map(() => []),
    filterOpen: false,
    moves: 0,
    edits: 0,
    drawIds: [],
  };
}

// A deterministic seed: issue i sits in column i % 5 and is open when
// i is even (2 500 open / 2 500 closed), title "issue <i>", version 0.
export function seedTracker(): TrackerState {
  const issues: Issue[] = [];
  for (let i = 0; i < ISSUE_COUNT; i++) {
    issues.push({
      id: i,
      col: i % COLUMN_COUNT,
      open: i % 2 === 0,
      title: `issue ${i}`,
      version: 0,
    });
  }
  const columns = bucketBy(issues, () => true);
  const openCols = bucketBy(issues, (issue) => issue.open);
  return {
    issues,
    columns,
    openCols,
    filterOpen: false,
    moves: 0,
    edits: 0,
    drawIds: windowBoard(columns),
  };
}

// Bucket issue ids per column (ascending — the scan visits ids in
// order), keeping only the ids whose issue satisfies `keep`.
function bucketBy(
  issues: readonly Issue[],
  keep: (issue: Issue) => boolean,
): readonly (readonly number[])[] {
  const buckets: number[][] = COLUMN_KEYS.map(() => []);
  for (const issue of issues) {
    if (keep(issue)) buckets[issue.col]?.push(issue.id);
  }
  return buckets;
}

// The first VIS_ROWS ids of one column (the window slice).
export function windowSlice(ids: readonly number[]): readonly number[] {
  return ids.slice(0, VIS_ROWS);
}

// The visible-window draw of a whole board.
export function windowBoard(
  columns: readonly (readonly number[])[],
): readonly (readonly number[])[] {
  return columns.map(windowSlice);
}

// Remove one id from an ascending index (the id is always present in
// the column it leaves).
function withoutId(ids: readonly number[], id: number): readonly number[] {
  return ids.filter((x) => x !== id);
}

// Insert one id into an ascending index at its sorted position.
function insertSorted(ids: readonly number[], id: number): readonly number[] {
  const at = ids.findIndex((x) => x > id);
  if (at < 0) return [...ids, id];
  return [...ids.slice(0, at), id, ...ids.slice(at)];
}

// The move's target: counter-cycled — the moves-th op moves issue
// (moves % 5000) one column to the right (wrapping to backlog).
export function movedId(moves: number): number {
  return moves % ISSUE_COUNT;
}

// The shared move mutation (drag-drop simulated as one op): the issue
// changes column in `issues`, and ONLY the two touched entries of each
// memo index change — no rescan, the memoised-derived-path shape.
function moveShared(state: TrackerState, full: boolean): TrackerState {
  const id = movedId(state.moves);
  const issue = state.issues[id];
  if (issue === undefined) return state;
  const nextCol = (issue.col + 1) % COLUMN_COUNT;
  const issues = state.issues.map((it) =>
    it.id === id ? { ...it, col: nextCol } : it,
  );
  const columns = state.columns.map((ids, c) =>
    c === issue.col ? withoutId(ids, id)
    : c === nextCol ? insertSorted(ids, id)
    : ids,
  );
  const openCols = state.openCols.map((ids, c) =>
    c === issue.col ? withoutId(ids, id)
    : c === nextCol && issue.open ? insertSorted(ids, id)
    : ids,
  );
  return {
    ...state,
    issues,
    columns,
    openCols,
    moves: state.moves + 1,
    drawIds: full ? columns : windowBoard(columns),
  };
}

// The §4.3 "rendering every row" hazard: the SAME move, but the board
// derives + draws ALL 5 000 issue rows per op.
export function moveNaive(state: TrackerState): TrackerState {
  return moveShared(state, true);
}

// The virtual-list candidate: the SAME move, the board draws only the
// visible window (VIS_ROWS rows × 5 columns).
export function moveWindow(state: TrackerState): TrackerState {
  return moveShared(state, false);
}

// The naive filter strategy — recompute the whole filtered board per
// op: a full rescan of all 5 000 issues buckets the visible ids afresh
// (the toggle itself could never reuse anything). The DRAW stays the
// window (the same as the memo op), so the measured delta is the
// recompute alone.
export function filterNaive(state: TrackerState): TrackerState {
  const filterOpen = !state.filterOpen;
  const visible = bucketBy(state.issues, (issue) => issue.open === filterOpen);
  return { ...state, filterOpen, drawIds: windowBoard(visible) };
}

// The memoised-derived-path candidate: the same toggle reads the
// precomputed indexes — zero recompute, the draw slices the lists the
// mutating ops already maintain.
export function filterMemo(state: TrackerState): TrackerState {
  const filterOpen = !state.filterOpen;
  const visible = filterOpen ? state.openCols : state.columns;
  return { ...state, filterOpen, drawIds: windowBoard(visible) };
}

// The optimistic edit's target: counter-cycled with a coprime stride,
// so 13 edits touch 13 distinct issues (several inside the drawn
// window).
export function editedId(edits: number): number {
  return (edits * EDIT_STRIDE) % ISSUE_COUNT;
}

// Optimistic edit + reconciliation (the BZ4 row's "optimistic edits"):
// the op applies the local write immediately (title/version bumped)
// and then settles the server ack — here a clean ack of the same
// revision, retitling to "issue <id> r<version>". Conflict OUTCOMES
// (what happens when the ack disagrees) are the wanna tracker's
// candidate, deferred — this bench pins only the clean-ack wire.
export function editOptimistic(state: TrackerState): TrackerState {
  const id = editedId(state.edits);
  const issue = state.issues[id];
  if (issue === undefined) return state;
  const version = issue.version + 1;
  const optimistic: Issue = { ...issue, version, title: `issue ${id} v${version}` };
  const reconciled: Issue = { ...optimistic, title: `issue ${id} r${version}` };
  const issues = state.issues.map((it) => (it.id === id ? reconciled : it));
  return {
    ...state,
    issues,
    edits: state.edits + 1,
    drawIds: windowBoard(state.columns),
  };
}

// The revision checksum the status line draws: col/version/open fold —
// a move, an optimistic edit or a lost update all change it, so the
// naive and candidate boards must read IDENTICAL numbers.
export function revisionOf(issues: readonly Issue[]): number {
  let total = 0;
  for (const issue of issues) {
    total += issue.col * 1009 + issue.version * 3 + (issue.open ? 1 : 0);
  }
  return total;
}

// The status line: issue count, per-column counts (moves change them),
// the open count, the op counters, the filter state and the revision
// checksum — the full no-op guard text.
export function statusLine(state: TrackerState): string {
  const cols = state.columns.map((ids) => ids.length).join(" ");
  const open = state.openCols.reduce((n, ids) => n + ids.length, 0);
  const filter = state.filterOpen ? "open" : "all";
  return (
    `tracker ${state.issues.length} cols ${cols} open ${open}` +
    ` moves ${state.moves} edits ${state.edits} filter ${filter}` +
    ` rev ${revisionOf(state.issues)}`
  );
}
