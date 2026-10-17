// Purpose: the pure model half of the BZ7 spreadsheet bench app
//   (tambor-54j.19) — a 1M-cell logical grid (1000×1000) whose defined
//   cells are a sparse plain-data map: 1000 literals in column A and
//   9000 three-ref formulas in columns B..J, plus the two recompute
//   strategies the §4.3 row contrasts — recomputeAll (the naive
//   "recomputing everything" hazard) and recomputeClosure (the
//   dependency-graph candidate over derived paths, cf. B9).
// Responsibilities: the Sheet shape (cells/values/deps/edits — all
//   plain data), refOf/literalAt/formulaAt (the deterministic cell
//   scheme), tokensOf/evalContent (the tiny "+"-language evaluator —
//   no eval), buildDeps (the reverse dependency index), seedSheet,
//   recomputeAll (column-major full sweep), recomputeClosure (BFS
//   closure over the dep index, evaluated in column order), editNaive
//   and editGraph (the two timed ops — the same literal edit, the two
//   strategies), sumOf and statusLine (the drawn no-op guards).
// Rationale: values are STATE, recomputed by the op — the view stays a
//   pure function of plain data, so the recompute strategy is the only
//   variable between the two measured ops. The dependency index lives
//   in state (buildDeps runs once at seed time; editing a literal
//   never changes its outgoing refs), so the candidate's per-edit cost
//   is closure discovery + closure evaluation only, while the naive
//   op re-parses and re-evaluates every formula. Edges here span
//   exactly one column (column j's formulas reference only column
//   j−1), so a COLUMN-major sweep (column 0's literals, then B, then
//   C, …) is strictly topological — the naive op's single full sweep
//   is its best case — and sorting the closure by ref string (column
//   letter first) is topological for the same reason.

// Logical grid: 10 000 × 100 = 1,000,000 cells; only the sparse map
// below is materialised (the visible-viewport pattern): 10 000
// literals in column A and 90 000 three-ref formulas in columns
// B..J — enough defined formulas that the naive recompute-everything
// sweep is the dominant cost it is in a real 1M-cell sheet.
export const SHEET_ROWS = 10000;
export const LOGICAL_COLS = 100;

// The defined columns: A holds literals, B..J hold formulas.
export const FORMULA_COLS = 9;
export const COL_LETTERS = "ABCDEFGHIJ" as const;

// The drawn window: the first 24 rows × all 10 defined columns.
export const VIS_ROWS = 24;
export const VIS_COLS = 10;

// Each timed edit raises one literal by this fixed delta.
export const EDIT_DELTA = 3;

// A literal is unique per row, so the seeded values (and any checksum
// over them) are deterministic.
export function literalAt(row: number): number {
  return 100 + ((row * 7) % 891);
}

// Cell reference "A12" (column letter + 1-based row).
export function refOf(col: number, row: number): string {
  return `${COL_LETTERS[col] as string}${row}`;
}

// Column A's seeded content: a plain integer literal.
export function literalContent(row: number): string {
  return String(literalAt(row));
}

// Column j ≥ 1's formula at row: the sum of the three clamped
// neighbours in column j−1 — every edge spans one column, so the
// formula grid is a DAG with bounded fan-out 3 per column.
export function formulaContent(col: number, row: number): string {
  const lo = Math.max(1, row - 1);
  const hi = Math.min(SHEET_ROWS, row + 1);
  const refs: string[] = [];
  for (let r = lo; r <= hi; r++) refs.push(refOf(col - 1, r));
  return `=${refs.join("+")}`;
}

// The plain-data sheet: contents, computed values, the reverse
// dependency index (referenced ref → referencing cells), and the
// timed-edit counter (never drawn except through statusLine).
export interface Sheet {
  readonly cells: Readonly<Record<string, string>>;
  readonly values: Readonly<Record<string, number>>;
  readonly deps: Readonly<Record<string, readonly string[]>>;
  readonly edits: number;
}

// The demo's initial state: an empty sparse map over the 1M grid —
// seeding it is the untimed setup op.
export function emptySheet(): Sheet {
  return { cells: {}, values: {}, deps: {}, edits: 0 };
}

// The formula tokens of a "=" content: signed refs or integers
// ("=A1+A2" → ["A1", "+A2"]). Literals have no tokens.
const TOKEN = /[+-]?(?:[A-J]\d+|\d+)/g;

export function tokensOf(content: string): readonly string[] {
  return content.startsWith("=") ? (content.slice(1).match(TOKEN) ?? []) : [];
}

// All refs a content references (deduplicated — clamped neighbours
// can repeat in one formula).
export function refsOf(content: string): readonly string[] {
  const seen = new Set<string>();
  for (const token of tokensOf(content)) {
    if (/[A-J]/.test(token)) seen.add(token.replace(/^[+-]/, ""));
  }
  return [...seen];
}

// Evaluate one content against a values map: literals parse, formulas
// sum their signed terms (a missing ref contributes 0).
export function evalContent(
  content: string,
  values: Readonly<Record<string, number>>,
): number {
  if (!content.startsWith("=")) return Number(content);
  let total = 0;
  for (const token of tokensOf(content)) {
    const neg = token.startsWith("-");
    const body = token.replace(/^[+-]/, "");
    const value = /[A-J]/.test(body)
      ? (values[body] ?? 0)
      : Number(body);
    total += neg ? -value : value;
  }
  return total;
}

// The reverse dependency index: for every formula cell, an edge into
// each ref it references. Plain data, built once at seed time —
// editing a literal changes its VALUE, never its outgoing refs.
export function buildDeps(
  cells: Readonly<Record<string, string>>,
): Readonly<Record<string, readonly string[]>> {
  const deps: Record<string, string[]> = {};
  for (const [cell, content] of Object.entries(cells)) {
    for (const ref of refsOf(content)) {
      (deps[ref] ??= []).push(cell);
    }
  }
  return deps;
}

// The seeded sheet: column A literals, columns B..J formulas, values
// from one full (topological) sweep, the dep index, edits 0.
export function seedSheet(): Sheet {
  const cells: Record<string, string> = {};
  for (let row = 1; row <= SHEET_ROWS; row++) {
    cells[refOf(0, row)] = literalContent(row);
    for (let col = 1; col <= FORMULA_COLS; col++) {
      cells[refOf(col, row)] = formulaContent(col, row);
    }
  }
  return { cells, values: recomputeAll(cells, {}), deps: buildDeps(cells), edits: 0 };
}

// The naive strategy — recompute EVERYTHING: one column-major sweep
// re-evaluating every defined cell (literal or formula) from the
// running values. Column-major is strictly topological for this
// formula scheme (a formula only ever references the previous
// column), so this is naive's BEST case: one pass, no fixpoint
// iteration, no dependency knowledge beyond the sweep order.
export function recomputeAll(
  cells: Readonly<Record<string, string>>,
  values: Readonly<Record<string, number>>,
): Record<string, number> {
  const next: Record<string, number> = { ...values };
  for (let col = 0; col <= FORMULA_COLS; col++) {
    for (let row = 1; row <= SHEET_ROWS; row++) {
      const cell = refOf(col, row);
      const content = cells[cell];
      if (content !== undefined) next[cell] = evalContent(content, next);
    }
  }
  return next;
}

// The candidate strategy — dependency-graph recompute: BFS over the
// reverse index from the edited ref collects the transitive dependents
// (the only cells whose values can change), then closure evaluation
// runs in (column, row) order — topological, because every edge spans
// one column down.
export function recomputeClosure(
  sheet: Sheet,
  edited: string,
): Record<string, number> {
  const values: Record<string, number> = { ...sheet.values };
  values[edited] = evalContent(sheet.cells[edited] ?? "", values);
  const closure: string[] = [];
  const visited = new Set<string>([edited]);
  let frontier = sheet.deps[edited] ?? [];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const cell of frontier) {
      if (!visited.has(cell)) {
        visited.add(cell);
        closure.push(cell);
        for (const dep of sheet.deps[cell] ?? []) next.push(dep);
      }
    }
    frontier = next;
  }
  closure.sort(byColumnRow);
  for (const cell of closure) {
    values[cell] = evalContent(sheet.cells[cell] ?? "", values);
  }
  return values;
}

// Ref-string order puts the column letter first, so cells of column
// B sort before column C — the topological order for
// one-column-spanning edges (within a column any order works: the
// scheme's formulas never reference their own column).
function byColumnRow(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The edited cell of an edit: the literal row cycled by the edit
// counter (row edits%10000 + 1 — 13 edits touch rows 1..13, all
// inside the drawn window).
export function editedRef(edits: number): string {
  return refOf(0, (edits % SHEET_ROWS) + 1);
}

// Apply the literal edit (both ops share it): the k-th edit (k =
// edits+1) raises the cycled row's literal by EDIT_DELTA. The target
// is chosen from the PRE-increment counter, so the k-th edit edits
// row k — 13 edits touch rows 1..13, all inside the drawn window.
function withEdit(sheet: Sheet): Sheet {
  const ref = editedRef(sheet.edits);
  const current = Number(sheet.cells[ref] ?? "0");
  return {
    ...sheet,
    cells: { ...sheet.cells, [ref]: String(current + EDIT_DELTA) },
    edits: sheet.edits + 1,
  };
}

// The naive timed op: the edit, then recompute every formula.
export function editNaive(sheet: Sheet): Sheet {
  const edited = withEdit(sheet);
  return { ...edited, values: recomputeAll(edited.cells, edited.values) };
}

// The candidate timed op: the same edit, then only the dependents.
export function editGraph(sheet: Sheet): Sheet {
  const edited = withEdit(sheet);
  return {
    ...edited,
    values: recomputeClosure(edited, editedRef(edited.edits - 1)),
  };
}

// The values checksum the status line draws: identical after the same
// edit sequence under either strategy — the correctness guard.
export function sumOf(values: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const v of Object.values(values)) total += v;
  return total;
}

// The status line: logical grid size, defined-formula count, edit
// counter and the values checksum.
export function statusLine(sheet: Sheet): string {
  let formulas = 0;
  for (const content of Object.values(sheet.cells)) {
    if (content.startsWith("=")) formulas++;
  }
  return `sheet ${SHEET_ROWS}x${LOGICAL_COLS} formulas ${formulas} edits ${sheet.edits} sum ${sumOf(sheet.values)}`;
}
