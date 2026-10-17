// Purpose: contract tests for the BZ7 spreadsheet bench app
//   (tambor-54j.19) — the 1M-cell logical grid's defined cells, the
//   tiny formula evaluator and the two recompute strategies must be
//   correct before the browser scenarios can be trusted to measure
//   anything: the candidate (dependency-graph recompute) must leave
//   the SAME state as the naive full recompute after the same edit
//   sequence, and must touch only the edited cell's transitive
//   dependents.
// Responsibilities: pin (a) the seeded sheet's shape (10 000 literals,
//   90 000 three-ref formulas, a dep index covering every edge, values
//   for every defined cell), (b) evaluator correctness against
//   independently computed sums (B5, C10 and the column-9 pyramid),
//   (c) the topological sweep (recomputeAll from empty equals the
//   seeded values), (d) naive-vs-graph state equality after a 13-edit
//   cycle plus the drawn status guards (edits 13 sum …), (e) the
//   closure property: recomputeClosure changes only dependents of the
//   edited ref, independently recomputed, and (f) the ordinary
//   dispatcher wire drives both ops (no benchmark-specific path).
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op misrecomputes or no-ops produces meaningless medians;
//   equality against the naive sweep and the independent closure make
//   "the candidate recompute is correct" a checked contract.

import { describe, it, expect } from "vitest";
import {
  EDIT_DELTA,
  FORMULA_COLS,
  LOGICAL_COLS,
  SHEET_ROWS,
  VIS_COLS,
  VIS_ROWS,
  buildDeps,
  editGraph,
  editNaive,
  editedRef,
  emptySheet,
  evalContent,
  formulaContent,
  literalAt,
  refsOf,
  recomputeAll,
  recomputeClosure,
  seedSheet,
  statusLine,
  sumOf,
  type Sheet,
} from "../src/examples/bench/spreadsheet-sheet.ts";
import {
  SHEET_PATH,
  createSpreadsheetApp,
  spreadsheetState,
} from "../src/examples/bench/spreadsheet.ts";

// A cycle of k timed edits through one strategy, from a fresh seed.
function cycle(k: number, op: (s: Sheet) => Sheet): Sheet {
  let sheet = seedSheet();
  for (let i = 0; i < k; i++) sheet = op(sheet);
  return sheet;
}

describe("spreadsheet bench app — seeded shape", () => {
  const sheet = seedSheet();

  it("seeds 10000 literals and 90000 formulas over the 1M logical grid", () => {
    const cells = Object.entries(sheet.cells);
    expect(cells.length).toBe(100000);
    const literals = cells.filter(([, c]) => !c.startsWith("="));
    const formulas = cells.filter(([, c]) => c.startsWith("="));
    expect(literals.length).toBe(10000);
    expect(formulas.length).toBe(SHEET_ROWS * FORMULA_COLS);
    // the logical grid is 1M; the sparse map holds only defined cells
    expect(SHEET_ROWS * LOGICAL_COLS).toBe(1_000_000);
  });

  it("gives every defined cell a value and every edge a dep entry", () => {
    expect(Object.keys(sheet.values).length).toBe(100000);
    for (const [cell, content] of Object.entries(sheet.cells)) {
      for (const ref of refsOf(content)) {
        expect(sheet.deps[ref]).toContain(cell);
      }
    }
  });

  it("evaluates the seeded values against independent sums", () => {
    // B5 = A4 + A5 + A6 (column 1, single multiplicity each)
    expect(sheet.values["B5"]).toBe(
      literalAt(4) + literalAt(5) + literalAt(6),
    );
    // C10 = B9 + B10 + B11, each B = three literals
    const b = (r: number) => literalAt(r - 1) + literalAt(r) + literalAt(r + 1);
    expect(sheet.values["C10"]).toBe(b(9) + b(10) + b(11));
    // the column-4 pyramid: three +-1/0 steps convolved — weights
    // [1,3,6,7,6,3,1] over the ±3-row triangle
    expect(sheet.values["D500"]).toBe(
      literalAt(497) + 3 * literalAt(498) + 6 * literalAt(499)
        + 7 * literalAt(500) + 6 * literalAt(501) + 3 * literalAt(502)
        + literalAt(503),
    );
  });

  it("recomputes everything (from empty) to exactly the seeded values", () => {
    const swept = recomputeAll(sheet.cells, {});
    expect(swept).toEqual(sheet.values);
  });
});

describe("spreadsheet bench app — evaluator", () => {
  it("parses literals and signed formula tokens", () => {
    expect(evalContent("123", {})).toBe(123);
    expect(evalContent("=A1+A2", { A1: 2, A2: 3 })).toBe(5);
    expect(evalContent("=A1-A2", { A1: 2, A2: 3 })).toBe(-1);
    expect(evalContent("=A1+7", { A1: 2 })).toBe(9);
    // a missing ref contributes 0 (the pre-recompute state)
    expect(evalContent("=A1+A2", { A1: 2 })).toBe(2);
  });

  it("extracts deduplicated refs from clamped formulas", () => {
    // row 1 clamps: the first and second neighbours coincide
    expect(formulaContent(1, 1)).toBe("=A1+A2");
    expect(refsOf("=A1+A1+A2")).toEqual(["A1", "A2"]);
    expect(refsOf("150")).toEqual([]);
  });
});

describe("spreadsheet bench app — the two recompute strategies", () => {
  it("leaves naive and graph in the SAME state after a 13-edit cycle", () => {
    const naive = cycle(13, editNaive);
    const graph = cycle(13, editGraph);
    expect(graph.values).toEqual(naive.values);
    expect(graph.cells).toEqual(naive.cells);
    expect(graph.deps).toEqual(naive.deps);
    expect(graph.edits).toBe(naive.edits);
    expect(graph.edits).toBe(13);
  });

  it("raises exactly the cycled row's literal by EDIT_DELTA per edit", () => {
    let sheet = seedSheet();
    for (let i = 0; i < 3; i++) {
      const ref = editedRef(sheet.edits);
      const row = Number(ref.slice(1));
      const bref = `B${row}`;
      const literalBefore = Number(sheet.cells[ref]);
      const dependentBefore = sheet.values[bref] ?? 0;
      sheet = editGraph(sheet);
      // the literal moved, and its column-1 dependent moved with it —
      // the edit actually landed and propagated
      expect(Number(sheet.cells[ref])).toBe(literalBefore + EDIT_DELTA);
      expect(sheet.values[bref]).toBe(dependentBefore + EDIT_DELTA);
    }
  });

  it("recomputeClosure touches only the edited cell's dependents", () => {
    const sheet = seedSheet();
    // independent closure: BFS over a locally rebuilt reverse index
    const local = buildDeps(sheet.cells);
    const seen = new Set(["A5"]);
    let frontier = [...(local["A5"] ?? [])];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const cell of frontier) {
        if (!seen.has(cell)) {
          seen.add(cell);
          for (const dep of local[cell] ?? []) next.push(dep);
        }
      }
      frontier = next;
    }
    const edited: Sheet = { ...sheet, cells: { ...sheet.cells, A5: "999" } };
    const after = recomputeClosure(edited, "A5");
    const changed = Object.keys(after).filter(
      (k) => after[k] !== sheet.values[k],
    );
    expect(changed.length).toBeGreaterThan(1);
    for (const cell of changed) expect(seen.has(cell)).toBe(true);
    // every changed formula really depends (transitively) on A5
    expect(changed).toContain("B4");
    expect(changed).toContain("B5");
    expect(changed).toContain("B6");
  });

  it("draws the same status guards under both strategies", () => {
    const naive = cycle(13, editNaive);
    const graph = cycle(13, editGraph);
    const expected = `edits 13 sum ${sumOf(naive.values)}`;
    expect(statusLine(graph)).toBe(statusLine(naive));
    expect(statusLine(graph)).toContain("sheet 10000x100 formulas 90000");
    expect(statusLine(graph)).toContain(expected);
    expect(statusLine(seedSheet())).toContain("edits 0");
  });
});

describe("spreadsheet bench app — the ordinary dispatcher wire", () => {
  it("drives both ops and the view through makeApp", () => {
    const app = createSpreadsheetApp();
    expect(app.getState()).toEqual(spreadsheetState());
    expect(JSON.stringify(app.view())).toContain("edits 0");
    // one dispatch per op — the same intent shape every corpus app uses
    app.dispatch(["update", SHEET_PATH, editNaive]);
    const afterNaive = (app.getState() as { sheet: Sheet }).sheet;
    expect(afterNaive.edits).toBe(1);
    app.dispatch(["update", SHEET_PATH, editGraph]);
    const afterGraph = (app.getState() as { sheet: Sheet }).sheet;
    expect(afterGraph.edits).toBe(2);
    expect(statusLine(afterGraph)).toContain("edits 2");
    expect(JSON.stringify(app.view())).toContain(
      `edits 2 sum ${sumOf(afterGraph.values)}`,
    );
  });

  it("draws the visible window (24 × 10), never the 1M grid", () => {
    const app = createSpreadsheetApp();
    app.dispatch(["update", SHEET_PATH, () => seedSheet()]);
    const text = JSON.stringify(app.view());
    expect(text).toContain("A1 ");
    expect(text).toContain("J24");
    expect(text).not.toContain("J25");
    expect(text).not.toContain("A1000");
    expect(VIS_ROWS * VIS_COLS).toBe(240);
  });

  it("starts empty — seeding is the untimed setup op", () => {
    expect(emptySheet().edits).toBe(0);
    expect(Object.keys(emptySheet().cells).length).toBe(0);
  });
});
