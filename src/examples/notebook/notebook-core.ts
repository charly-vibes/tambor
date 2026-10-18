// Purpose: the reactive notebook core model (tambor-54j.9) — the pure,
//   DOM-free, Node-testable half of the B9 example: dependency
//   inference from identifiers, one definition per name, topological
//   order, and incremental evaluation that re-runs only the transitive
//   dependents of the dirty set (plus previously-errored cells) while
//   untouched values are reused BY IDENTITY. Ported from the chat-repo
//   artifact; tambor's real model/views/effects replace the mini-port's
//   DOM layer.
// Responsibilities: the Cell/Val/OutEntry/CellInfo shapes; analyze
//   (per-cell parse, reads inference, name/defs map, cycle and
//   duplicate-definition reporting, slider-input validation); the
//   affected-set closure (dirty seeds + transitive dependents over the
//   reverse reader index + previously-errored cells); runAll (the
//   topological evaluation loop with the identity-reuse merge, per-cell
//   error capture and the touched list the Worker merge needs).
// Rationale: state is plain data — cells `{id, src}`, sliders as a map,
//   out as a map of plain entries — so the view stays a pure function
//   and the Worker boundary is a structured clone away. No eval: the
//   evaluator is notebook-eval.ts's interpreter, the same one the
//   Worker wraps. `touched` (everything not reused this run) lets the
//   app merge a Worker reply without losing the identity reuse the
//   incremental contract pins.

import { ev, idsOf, isBuiltin, type Ast } from "./notebook-eval.ts";
import { parse, tokenize } from "./notebook-parse.ts";

// A notebook cell: a stable id and its source text.
export interface Cell {
  readonly id: number;
  readonly src: string;
}

// A computed value: a scalar, a Float64Array, or a plot pair.
export type Val =
  | number
  | Float64Array
  | { readonly plot: readonly [Float64Array, Float64Array] };

// One cell's outcome: a value or a per-cell error message.
export interface OutEntry {
  readonly v?: Val;
  readonly err?: string;
}

// The slider signature of a `name = slider(min, max, step, value)` cell.
export type SliderInput = readonly [number, number, number, number];

// The per-cell static facts the view draws: the defined name, the read
// identifiers, the analyze error (parse/dup/cycle) and the slider input.
export interface CellInfo {
  readonly name: string | null;
  readonly reads: readonly string[];
  readonly err: string | null;
  readonly input: SliderInput | null;
}

// One run's result: entries by cell id, per-cell info, the ids this run
// freshly computed (everything not reused from prev), the evaluation
// count, and the wall time.
export interface RunResult {
  readonly out: Readonly<Record<number, OutEntry>>;
  readonly info: Readonly<Record<number, CellInfo>>;
  readonly touched: readonly number[];
  readonly ran: number;
  readonly ms: number;
}

// The analysis product: per-cell info, the name → defining-cell map,
// the topological cell order (error-free cells only) and the parsed
// ASTs (runAll evaluates from these; nothing outside needs them).
interface Analysis {
  readonly info: Readonly<Record<number, CellInfo>>;
  readonly defs: Readonly<Record<string, number>>;
  readonly order: readonly number[];
  readonly asts: Readonly<Record<number, Ast | null>>;
}

// The host clock, resolved structurally (performance sits outside the
// ES2022 lib — the phase-timers pattern).
function clock(): { now(): number } {
  return (globalThis as unknown as { performance?: { now(): number } })
    .performance ?? { now: () => Date.now() };
}

// Parse one cell's expression part and collect its reads; a `name =`
// prefix defines a name (the definition form), otherwise the cell is
// an output. Every failure becomes inf.err — never a thrown analysis.
function parseCell(c: Cell): { inf: CellInfo; ast: Ast | null; body: string | null } {
  const m = /^\s*([A-Za-z_]\w*)\s*=(?!=)([\s\S]*)$/.exec(c.src);
  const name = m === null || m[1] === undefined ? null : m[1];
  const body = m === null || m[2] === undefined ? c.src : m[2];
  const base = { name, reads: [] as readonly string[], err: null as string | null, input: null as SliderInput | null };
  if (body.trim().length === 0) return { inf: { ...base, err: "empty cell" }, ast: null, body: null };
  try {
    const ast = parse(tokenize(body));
    const reads = [...new Set(idsOf(ast))];
    const input = sliderInput(name, ast);
    return { inf: { ...base, reads, input }, ast, body };
  } catch (e) {
    return { inf: { ...base, err: e instanceof Error ? e.message : String(e) }, ast: null, body: null };
  }
}

// A slider cell must define a name and carry four numeric arguments —
// anything else is the usage error (the artifact's slider rule).
function sliderInput(name: string | null, ast: Ast): SliderInput | null {
  if (!(ast.t === "call" && ast.f === "slider")) return null;
  const args = ast.args;
  const numeric = args.length === 4 && args.every((a) => a.t === "num");
  if (name === null || !numeric) throw new Error("use: name = slider(min, max, step, value)");
  return [args[0], args[1], args[2], args[3]].map((a) => (a as { v: number }).v) as unknown as SliderInput;
}

// The definition pass: the first definition of a name wins; a second
// definition (or a built-in shadow) errs the LATER cell — matching the
// artifact's one-definition-per-name rule.
function define(info: Record<number, CellInfo>, defs: Record<string, number>, id: number): void {
  const inf = info[id];
  if (inf === undefined) return;
  const name = inf.name;
  if (name === null || inf.err !== null) return;
  if (name in defs) {
    info[id] = { ...inf, err: `${name} is defined twice` };
    return;
  }
  if (isBuiltin(name)) {
    info[id] = { ...inf, err: `${name} is a built-in` };
    return;
  }
  defs[name] = id;
}

// Depth-first topological visit: dependencies first, cycle detection
// over the mark map (1 = on stack, 2 = done); a back edge errs the
// reading cell with the cycle path.
function visit(
  id: number,
  path: readonly number[],
  info: Record<number, CellInfo>,
  defs: Readonly<Record<string, number>>,
  mark: Record<number, number>,
  order: number[],
): void {
  const m = mark[id];
  if (m === 2) return;
  mark[id] = 1;
  const inf = info[id];
  if (inf === undefined) return;
  for (const r of inf.reads) {
    const d = defs[r];
    if (d === undefined) continue;
    if (d === id || mark[d] === 1) {
      info[id] = { ...inf, err: `cycle: ${[...path, id, r].join(" → ")}` };
      continue;
    }
    visit(d, [...path, id], info, defs, mark, order);
  }
  mark[id] = 2;
  if (info[id]?.err === null) order.push(id);
}

// analyze: parse every cell, resolve definitions, then topo-visit.
export function analyze(cells: readonly Cell[]): Analysis {
  const info: Record<number, CellInfo> = {};
  const defs: Record<string, number> = {};
  const asts: Record<number, Ast | null> = {};
  for (const c of cells) {
    const parsed = parseCell(c);
    info[c.id] = parsed.inf;
    asts[c.id] = parsed.ast;
    define(info, defs, c.id);
  }
  const mark: Record<number, number> = {};
  const order: number[] = [];
  for (const c of cells) {
    if (info[c.id]?.err === null) visit(c.id, [], info, defs, mark, order);
  }
  return { info, defs, order, asts };
}

// The affected set: full (every cell) when dirty is null (Full mode /
// structural ops), otherwise the dirty seeds plus their transitive
// dependents over the reverse reader index, plus every
// previously-errored cell (an upstream fix may un-error them).
function affected(
  cells: readonly Cell[],
  info: Readonly<Record<number, CellInfo>>,
  prev: Readonly<Record<number, OutEntry>>,
  dirty: readonly number[] | null,
  readers: Readonly<Record<string, readonly number[]>>,
): Set<number> {
  if (dirty === null) return new Set(cells.map((c) => c.id));
  const aff = new Set<number>();
  const q: number[] = [...dirty];
  for (const c of cells) {
    if (prev[c.id]?.err !== undefined) q.push(c.id);
  }
  while (q.length > 0) {
    const id = q.pop();
    if (id === undefined || aff.has(id)) continue;
    aff.add(id);
    const name = info[id]?.name;
    if (name !== undefined && name !== null) {
      for (const x of readers[name] ?? []) q.push(x);
    }
  }
  return aff;
}

// Evaluate one ordered cell: a slider reads its current value (the
// sliders map, else its default); anything else evaluates the AST
// against the running values — an upstream failure surfaces as the
// per-cell "upstream error".
function evalCell(
  id: number,
  inf: CellInfo,
  ast: Ast | null,
  sliders: Readonly<Record<number, number>>,
  look: (name: string) => number | Float64Array,
): OutEntry {
  try {
    if (inf.input !== null) {
      const v = sliders[id] ?? inf.input[3];
      return { v };
    }
    if (ast === null) return { err: inf.err ?? "not run" };
    return { v: ev(ast, look) };
  } catch (e) {
    return { err: e instanceof Error ? e.message : String(e) };
  }
}

// runAll: analyze, close the affected set, evaluate in topological
// order (reusing prev BY IDENTITY outside the affected set), then error
// every cell that never produced an entry. `ran` counts real
// evaluations; `touched` is the identity-reuse complement (the merge
// contract).
export function runAll(
  cells: readonly Cell[],
  sliders: Readonly<Record<number, number>>,
  prev: Readonly<Record<number, OutEntry>>,
  dirty: readonly number[] | null,
): RunResult {
  const t0 = clock().now();
  const { info, defs, order, asts } = analyze(cells);
  const readers: Record<string, number[]> = {};
  for (const c of cells) {
    for (const r of info[c.id]?.reads ?? []) (readers[r] ??= []).push(c.id);
  }
  const aff = affected(cells, info, prev, dirty, readers);
  const out: Record<number, OutEntry> = {};
  const vals: Record<string, Val> = {};
  const reused = new Set<number>();
  let ran = 0;
  const look = (n: string): number | Float64Array => {
    if (n in vals) return vals[n] as number | Float64Array;
    const d = defs[n];
    throw new Error(d !== undefined ? `upstream error in ${n}` : `${n} is not defined`);
  };
  for (const id of order) {
    const inf = info[id];
    if (inf === undefined) continue;
    const p = prev[id];
    if (!aff.has(id) && p !== undefined) {
      reuseCell(id, p, out, reused);
    } else {
      ran++;
      out[id] = evalCell(id, inf, asts[id] ?? null, sliders, look);
    }
    const v = out[id]?.v;
    if (inf.name !== null && v !== undefined) vals[inf.name] = v;
  }
  fillMissingOut(cells, info, out);
  const touched = cells.map((c) => c.id).filter((id) => !reused.has(id));
  return { out, info, touched, ran, ms: clock().now() - t0 };
}

// An untouched cell keeps its previous entry BY IDENTITY (the
// incremental contract) and is marked reused for the touched report.
function reuseCell(
  id: number,
  p: OutEntry,
  out: Record<number, OutEntry>,
  reused: Set<number>,
): void {
  out[id] = p;
  reused.add(id);
}

// Cells the topological pass never reached get their per-cell error or
// a "not run" marker.
function fillMissingOut(
  cells: readonly Cell[],
  info: Readonly<Record<number, CellInfo>>,
  out: Record<number, OutEntry>,
): void {
  for (const c of cells) {
    if (!(c.id in out)) out[c.id] = { err: info[c.id]?.err ?? "not run" };
  }
}
