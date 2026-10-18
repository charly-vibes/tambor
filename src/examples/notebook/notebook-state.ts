// Purpose: the plain-data state half of the B9 reactive notebook demo
//   (tambor-54j.9) — cells, sliders, out, info, stats, mode and the
//   textarea/slider scratch live in one plain object; the path builders
//   the view binds to and the structural op builders (+cell, +200
//   chained, +200 fan-out, +100 heavy) live beside it.
// Responsibilities: NotebookState (every field plain data); the keypath
//   builders (cellSrcPath/cellExtraPath/sliderNumPath/sliderMdownPath);
//   notebookState() (the demo's initial 8 cells, evaluated once
//   in-thread at construction — boot needs no Worker); the op builders
//   the handler applies before launching a run (appendCell/chainCells/
//   fanCells/heavyCells — heavy is the kill switch's long-running
//   target: a 1M-point array feeding 100 reduction cells).
// Rationale: state is data, the view is a pure function of it, and the
//   handlers return intents (the keyed-table/spreadsheet bench shape);
//   splitting state from handler/view keeps the module DAG acyclic
//   (state ← handler/app, state ← view) and every file under the gate's
//   400-line limit. Names are unique per append batch (one definition
//   per name — notebook-core's duplicate rule would err a second chain).

import {
  runAll,
  type Cell,
  type CellInfo,
  type OutEntry,
} from "./notebook-core.ts";
import type { Path } from "../../effects/paths.ts";

// The demo notebook's initial cells (the chat-repo artifact's demo):
// two sliders, two plots, derived arrays — small enough to boot
// in-thread, rich enough to show every output form.
export const DEMO_CELLS: readonly Cell[] = [
  { id: 1, src: "freq = slider(1, 10, 1, 3)" },
  { id: 2, src: "xs = linspace(0, 6.283, 120)" },
  { id: 3, src: "ys = sin(xs * freq)" },
  { id: 4, src: "plot(xs, ys)" },
  { id: 5, src: "energy = sum(ys * ys) / len(ys)" },
  { id: 6, src: "amp = slider(0.5, 3, 0.1, 1)" },
  { id: 7, src: "zs = ys * amp" },
  { id: 8, src: "plot(xs, zs)" },
];

// The last run's counters (the stats bar and the bench's no-op guard).
export interface NotebookStats {
  readonly ran: number;
  readonly total: number;
  readonly ms: number;
}

// What an in-flight run is about to touch: the dirty seeds (null = a
// Full-mode run) and the ids the launching op added. A killed run marks
// dirty ?? added with the killed error; everything else keeps its value.
export interface PendingRun {
  readonly dirty: readonly number[] | null;
  readonly added: readonly number[];
}

// The demo's state: plain data throughout (state_is_data).
export interface NotebookState {
  readonly cells: readonly Cell[];
  readonly sliders: Readonly<Record<number, number>>;
  readonly out: Readonly<Record<number, OutEntry>>;
  readonly info: Readonly<Record<number, CellInfo>>;
  readonly stats: NotebookStats;
  readonly mode: "incremental" | "full";
  readonly nextId: number;
  readonly runId: number;
  readonly pending: PendingRun | null;
  readonly err: string;
  readonly chainBase: number | null;
  readonly "::extra": Readonly<Record<string, unknown>>;
}

// The paths the view binds and the handler recognizes.
export const CELLS_PATH: Path = [["keypath", "cells"]];
export const SLIDERS_PATH: Path = [["keypath", "sliders"]];
export const EXTRA_ROOT: Path = [["keypath", "::extra"]];

// A cell textarea's text path: cells → seq-nth(idx) → src. Focus
// deep-equals this path, so focus survives every re-derive that keeps
// the cell order stable (the e2e focus contract).
export function cellSrcPath(idx: number): Path {
  return [...CELLS_PATH, ["seq-nth", idx], ["keypath", "src"]];
}

// A cell textarea's scratch path (cursor/selection/mpos per cell).
export function cellExtraPath(id: number): Path {
  return [...EXTRA_ROOT, ["keypath", `cell-${id}`]];
}

// A slider's value path: sliders → keypath(id). The handler recognizes
// updates at this shape and launches the cell's re-run.
export function sliderNumPath(id: number): Path {
  return [...SLIDERS_PATH, ["keypath", id]];
}

// A slider's gesture scratch path (::extra → mdown-<id>).
export function sliderMdownPath(id: number): Path {
  return [...EXTRA_ROOT, ["keypath", `mdown-${id}`]];
}

// Is this update intent's path a sliders value path (the handler's
// slider-move recognition)?
export function isSliderNumPath(path: unknown): boolean {
  if (!Array.isArray(path) || path.length !== 2) return false;
  const head = path[0] as readonly unknown[] | undefined;
  return Array.isArray(head) && head[0] === "keypath" && head[1] === "sliders";
}

// The slider id a sliders-path update targets (keypath arg).
export function sliderIdOf(path: unknown): number | null {
  const step = (path as readonly (readonly unknown[])[])?.[1];
  const id = Array.isArray(step) ? step[1] : undefined;
  return typeof id === "number" ? id : null;
}

// The initial state: the demo cells evaluated once in-thread (boot and
// Reset need no Worker — the reply path is only for interactive edits).
export function notebookState(): NotebookState {
  const r = runAll(DEMO_CELLS, {}, {}, null);
  return {
    cells: DEMO_CELLS,
    sliders: {},
    out: r.out,
    info: r.info,
    stats: { ran: r.ran, total: DEMO_CELLS.length, ms: r.ms },
    mode: "incremental",
    nextId: 9,
    runId: 0,
    pending: null,
    err: "",
    chainBase: null,
    "::extra": {},
  };
}

// + cell: one fresh output cell.
export function appendCell(s: NotebookState): NotebookState {
  return {
    ...s,
    cells: [...s.cells, { id: s.nextId, src: "1 + 1" }],
    nextId: s.nextId + 1,
  };
}

// The ids a batch append added (cells from nextId upward).
function addedIds(s: NotebookState, count: number): readonly number[] {
  return Array.from({ length: count }, (_, k) => s.nextId + k);
}

// +200 chained: one slider feeding a 200-cell dependency chain — the
// bench scenario's shape (a move re-runs all 201 dependents). The base
// slider's range leaves headroom for the +1 chain op's 13 bumps.
export function chainCells(s: NotebookState): NotebookState {
  const n = s.nextId;
  const batch: Cell[] = [{ id: n, src: `ch${n}_base = slider(0, 100, 1, 1)` }];
  for (let k = 1; k <= 200; k++) {
    const prev = k === 1 ? `ch${n}_base` : `ch${n}_${k - 1}`;
    batch.push({ id: n + k, src: `ch${n}_${k} = ${prev} + 1` });
  }
  return { ...s, cells: [...s.cells, ...batch], nextId: n + 201, chainBase: n };
}

// +200 fan-out: 200 cells each summing sin(xs * k) off the demo's xs.
export function fanCells(s: NotebookState): NotebookState {
  const n = s.nextId;
  const batch = Array.from(
    { length: 200 },
    (_, k): Cell => ({ id: n + k, src: `fan${n}_${k} = sum(sin(xs * ${k + 1}))` }),
  );
  return { ...s, cells: [...s.cells, ...batch], nextId: n + 200 };
}

// +200 heavy: a 1M-point array feeding 200 reduction cells — the
// long-running run the kill switch exists for (seconds of work).
export function heavyCells(s: NotebookState): NotebookState {
  const n = s.nextId;
  const batch: Cell[] = [{ id: n, src: `hx${n} = range(0, 1000000)` }];
  for (let k = 1; k <= 200; k++) {
    batch.push({ id: n + k, src: `hh${n}_${k} = sum(sin(hx${n} * ${k}))` });
  }
  return { ...s, cells: [...s.cells, ...batch], nextId: n + 201 };
}

// The added ids of each append op (the kill marking's fallback set).
export function addedOf(op: "add" | "chain" | "fan" | "heavy", s: NotebookState): readonly number[] {
  switch (op) {
    case "add":
      return [s.nextId];
    case "chain":
      return addedIds(s, 201);
    case "fan":
      return addedIds(s, 200);
    case "heavy":
      return addedIds(s, 201);
  }
}
