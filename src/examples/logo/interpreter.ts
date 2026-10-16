// Purpose: the Logo interpreter of the example.logo demo (tambor-y9d.2) —
//   the world is never stored: it is derived as a pure fold over the
//   source entries, `world = fold(entries[0..cursor])`, so rewind is a
//   cursor change and late binding re-runs every command against the
//   newest procedure definitions.
// Responsibilities: the World shape and pen-color table; move/trace
//   recording; the COMMANDS dispatch table (fd/bk/rt/lt, pu/pd, home,
//   setcolor, repeat, if, stop); the EN/ES runtime keyword tables
//   (tambor-y9d.5) consulted at tokenize time via translateTokens;
//   defined-procedure invocation with
//   depth guarding; derive(entries, late, dialect, budget) — all
//   definitions applied first when late is on, then every command re-run
//   (the step budget is a parameter: the Worker boundary runs with a
//   kill-sized budget, the in-thread fallback keeps the bounded one —
//   tambor-y9d.10); the EXAMPLES library and the procText re-load helper.
// Rationale: the wanna-chat session demo (insights/dynamic-environment.md,
//   "Core idea realised in the Logo demo") is the design authority for
//   the fold semantics; this port changes presentation only. Demo-local
//   logic — no corpus semantics live here: effects, paths and dispatch
//   stay in logo.ts; this file is a pure (entries, late) → World
//   function with no state access at all.

import {
  defsOf,
  expr,
  num,
  readBlock,
  stripDefs,
  tokenize,
  type Env,
  type Proc,
  type Reader,
} from "./expr.ts";
import { TABLES, translateTokens, type Dialect } from "./keywords.ts";

export type { Dialect } from "./keywords.ts";

export type { Proc } from "./expr.ts";

export interface LogoEntry {
  readonly text: string;
}

/** A pen-down move: from (x1,y1) to (x2,y2) in the pen color (null =
 * currentColor). */
export type TraceSeg = readonly [number, number, number, number, string | null];

export interface World {
  readonly procs: Readonly<Record<string, Proc>>;
  readonly x: number;
  readonly y: number;
  readonly hd: number;
  readonly pen: boolean;
  readonly color: string | null;
  readonly trace: readonly TraceSeg[];
}

export const COLORS: Readonly<Record<string, string | null>> = {
  red: "#d93025",
  green: "#1e8e3e",
  blue: "#1a73e8",
  orange: "#e8710a",
  purple: "#9334e6",
  black: null,
};

// The example programs of the demo (the original EX map, verbatim).
export const EXAMPLES: Readonly<Record<string, string>> = {
  square: "repeat 4 [fd 80 rt 90]",
  star: "setcolor purple\nrepeat 5 [fd 120 rt 144]",
  spiral:
    "to spiral :n\n fd :n rt 91\n if :n < 200 [spiral :n + 3]\nend\nsetcolor blue\nspiral 5",
  flower:
    "to petal\n repeat 2 [repeat 30 [fd 3 rt 3] rt 90]\nend\nsetcolor orange\nrepeat 12 [petal rt 30]",
  tree:
    "to tree :s\n if :s < 8 [stop]\n fd :s lt 25 tree :s * 0.7\n rt 50 tree :s * 0.7\n lt 25 bk :s\nend\nsetcolor green\npu bk 100 pd\ntree 80",
};

// The Spanish example programs (tambor-y9d.5): the same figures as the
// English EXAMPLES above, written in the verified Spanish dialect.
export const EXAMPLES_ES: Readonly<Record<string, string>> = {
  cuadrado: "repite 4 [avanza 80 giraderecha 90]",
  estrella: "poncolor morado\nrepite 5 [avanza 120 giraderecha 144]",
};

/** Load a procedure back into the editor as source text (procText). */
export function procText(name: string, proc: Proc): string {
  const params = proc.params.map((x) => ":" + x).join(" ");
  const body = proc.body
    .join(" ")
    .replace(/ \[ /g, " [")
    .replace(/ \]/g, "]");
  return `to ${name} ${params}\n ${body}\nend`;
}

// The builder-side world: mutable during the fold, projected readonly.
interface WorldBuilder {
  procs: Record<string, Proc>;
  x: number;
  y: number;
  hd: number;
  pen: boolean;
  color: string | null;
  trace: TraceSeg[];
  steps: number;
  budget: number;
}

// The step budget and recursion depth guard (the demo's two runaway
// protections, same limits as the original). The budget is exported so the
// Worker boundary can size it (WORKER_BUDGET) and the in-thread fallback
// can keep the bounded default.
export const STEP_BUDGET = 30000;
const TRACE_CAP = 20000;
const MAX_DEPTH = 150;

function move(w: WorldBuilder, d: number): void {
  const r = (w.hd * Math.PI) / 180;
  const nx = w.x + d * Math.sin(r);
  const ny = w.y + d * Math.cos(r);
  if (w.pen && w.trace.length < TRACE_CAP) {
    w.trace.push([w.x, w.y, nx, ny, w.color]);
  }
  w.x = nx;
  w.y = ny;
}

class Stop extends Error {}

interface CmdCtx {
  P: Reader;
  env: Env;
  w: WorldBuilder;
  depth: number;
}

type CmdHandler = (c: CmdCtx) => void;

// The command dispatch table: one handler per drawing command; each
// reads its arguments from the token stream in order.
const COMMANDS: Readonly<Record<string, CmdHandler>> = {
  fd: ({ P, env, w }) => move(w, num(expr(P, env))),
  forward: ({ P, env, w }) => move(w, num(expr(P, env))),
  bk: ({ P, env, w }) => move(w, -num(expr(P, env))),
  back: ({ P, env, w }) => move(w, -num(expr(P, env))),
  rt: ({ P, env, w }) => {
    w.hd += num(expr(P, env));
  },
  right: ({ P, env, w }) => {
    w.hd += num(expr(P, env));
  },
  lt: ({ P, env, w }) => {
    w.hd -= num(expr(P, env));
  },
  left: ({ P, env, w }) => {
    w.hd -= num(expr(P, env));
  },
  pu: ({ w }) => {
    w.pen = false;
  },
  pd: ({ w }) => {
    w.pen = true;
  },
  home: ({ w }) => {
    w.x = 0;
    w.y = 0;
    w.hd = 0;
  },
  setcolor: ({ P, w }) => {
    const c = P.t[P.i++];
    if (typeof c !== "string" || !(c in COLORS)) throw new Error("unknown color " + String(c));
    w.color = COLORS[c] ?? null;
  },
  repeat: ({ P, env, w, depth }) => {
    const n = num(expr(P, env));
    const body = readBlock(P);
    for (let k = 0; k < n; k++) execReader({ t: body, i: 0 }, env, w, depth);
  },
  if: ({ P, env, w, depth }) => {
    const c = expr(P, env);
    const body = readBlock(P);
    if (c) execReader({ t: body, i: 0 }, env, w, depth);
  },
  stop: () => {
    throw new Stop();
  },
};

// Invoke a defined procedure: bind its params from the argument
// expressions, run its body one level deeper; a `stop` inside the body
// ends only that invocation.
function callProc(
  proc: Proc,
  P: Reader,
  env: Env,
  w: WorldBuilder,
  depth: number,
): void {
  if (depth > MAX_DEPTH) throw new Error("recursion too deep");
  const e2: Record<string, number> = {};
  for (const k of proc.params) e2[k] = num(expr(P, env));
  try {
    execReader({ t: proc.body, i: 0 }, e2, w, depth + 1);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
}

function execReader(P: Reader, env: Env, w: WorldBuilder, depth: number): void {
  while (P.i < P.t.length) {
    const t = P.t[P.i++];
    if (t === undefined) return;
    w.steps++;
    if (w.steps > w.budget) throw new Error("too many steps — infinite loop?");
    const cmd = COMMANDS[t];
    if (cmd) {
      cmd({ P, env, w, depth });
      continue;
    }
    const proc = w.procs[t];
    if (proc) {
      callProc(proc, P, env, w, depth);
      continue;
    }
    throw new Error("I don't know how to " + t);
  }
}

function freshWorld(budget: number): WorldBuilder {
  return { procs: {}, x: 0, y: 0, hd: 0, pen: true, color: null, trace: [], steps: 0, budget };
}

function freezeWorld(w: WorldBuilder): World {
  return {
    procs: w.procs,
    x: w.x,
    y: w.y,
    hd: w.hd,
    pen: w.pen,
    color: w.color,
    trace: w.trace,
  };
}

/** Derive the world: every entry runs as a fold step. With `late`, all
 * definitions are applied first, then every command re-runs — the old
 * drawing redrawn with the newest procedures. `to`/`end` tokens never
 * execute: definitions are registered by the fold. The dialect's
 * keyword table translates tokens at tokenize time (EN default; the
 * canonical words themselves always work in every dialect). */
export function derive(
  entries: readonly LogoEntry[],
  late: boolean,
  dialect: Dialect = "en",
  budget: number = STEP_BUDGET,
): World {
  const w = freshWorld(budget);
  const table = TABLES[dialect];
  const toks = entries.map((e) => translateTokens(tokenize(e.text), table));
  if (late) toks.forEach((t) => defsOf(t, w.procs));
  toks.forEach((t) => {
    if (!late) defsOf(t, w.procs);
    execReader({ t: stripDefs(t), i: 0 }, {}, w, 0);
  });
  return freezeWorld(w);
}
