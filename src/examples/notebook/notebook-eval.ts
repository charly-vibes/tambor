// Purpose: the notebook expression interpreter (tambor-54j.9) — the
//   tokenizer, Pratt parser, identifier collection and the no-eval
//   evaluator over Float64Array array ops, ported from the chat-repo
//   artifact (docs/reference/chat-repo-cold-read/artifacts/
//   tambor-notebook.html.txt) and kept DOM-free and eval-free: a
//   published page may block eval, and arbitrary code execution is the
//   risk the interpreter replaces.
// Responsibilities: MAXN (the array-length cap); tokenize/parse (the
//   expression grammar: numbers, identifiers, calls, + - * / % ^ and
//   unary minus with the artifact's precedence); idsOf (the identifiers
//   an AST reads — the dependency-inference input); the F1 elementwise
//   math table and the FN array table (sin cos tan abs sqrt exp log
//   floor round / sum len mean min max range linspace plot); ev (the
//   evaluator against a look(name) callback — unknown functions and
//   length mismatches throw per-cell errors).
// Rationale: the in-process evaluator is the same interpreter the
//   Worker wraps (worker-main.ts), so the core contract tests and the
//   killable off-thread run exercise one implementation. Everything here
//   is pure: no DOM, no host globals, every failure a thrown Error the
//   caller attaches to its cell.

// The array-length cap: range/linspace allocations above it are a cell
// error, not an OOM (the artifact's budget).
export const MAXN = 1e6;

// The parsed expression tree (num/id/neg/bin/call).
export type Ast =
  | { readonly t: "num"; readonly v: number }
  | { readonly t: "id"; readonly n: string }
  | { readonly t: "neg"; readonly e: Ast }
  | { readonly t: "bin"; readonly o: string; readonly l: Ast; readonly r: Ast }
  | { readonly t: "call"; readonly f: string; readonly args: readonly Ast[] };

// The binary operator table and its precedence (the artifact's grammar).
const OPS: Readonly<Record<string, (a: number, b: number) => number>> = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
  "%": (a, b) => a % b,
  "^": Math.pow,
};
const PREC: Readonly<Record<string, number>> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  "^": 3,
};

// The elementwise math functions (F1): broadcast over arrays.
const F1: Readonly<Record<string, (x: number) => number>> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: Math.log,
  floor: Math.floor,
  round: Math.round,
};

// The elementwise map: a scalar maps directly, an array elementwise.
function map1(f: (x: number) => number, a: number | Float64Array): number | Float64Array {
  if (!(a instanceof Float64Array)) return f(a);
  const r = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) r[i] = f(a[i] as number);
  return r;
}

// The binary zip: scalar/scalar is scalar; an array operand broadcasts
// the other side; two arrays must match length.
function zip(
  f: (a: number, b: number) => number,
  a: number | Float64Array,
  b: number | Float64Array,
): number | Float64Array {
  const sa = !(a instanceof Float64Array);
  const sb = !(b instanceof Float64Array);
  if (sa && sb) return f(a, b);
  if (!sa && !sb && (a as Float64Array).length !== (b as Float64Array).length) {
    throw new Error(`length mismatch ${(a as Float64Array).length} vs ${(b as Float64Array).length}`);
  }
  const n = sa ? (b as Float64Array).length : (a instanceof Float64Array ? a.length : 1);
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = sa ? (a as number) : ((a as Float64Array)[i] as number);
    const y = sb ? (b as number) : ((b as Float64Array)[i] as number);
    r[i] = f(x, y);
  }
  return r;
}

// The array reduction core.
function red(
  a: number | Float64Array,
  f: (s: number, x: number) => number,
  z: number,
): number | Float64Array {
  if (!(a instanceof Float64Array)) return a;
  let s = z;
  for (let i = 0; i < a.length; i++) s = f(s, a[i] as number);
  return s;
}

// The array function table (FN): reductions, constructors, plot.
// sumOf/lenOf are hoisted so mean can compose them without a
// self-referential table lookup.
function sumOf(a: number | Float64Array): number | Float64Array {
  return red(a, (s, x) => s + x, 0);
}
function lenOf(a: number | Float64Array): number | Float64Array {
  return a instanceof Float64Array ? a.length : 1;
}
const FN: Readonly<Record<string, (...a: readonly (number | Float64Array)[]) => number | Float64Array | { readonly plot: readonly [Float64Array, Float64Array] }>> = {
  sum: sumOf,
  len: lenOf,
  mean: (a) => (sumOf(a) as number) / (lenOf(a) as number),
  min: (a) => red(a, Math.min, Number.POSITIVE_INFINITY),
  max: (a) => red(a, Math.max, Number.NEGATIVE_INFINITY),
  range: (a, b) => {
    const to = Number(b === undefined ? a : b);
    const from = b === undefined ? 0 : Number(a);
    const n = Math.max(0, Math.ceil(to - from));
    if (n > MAXN) throw new Error("array too large");
    const r = new Float64Array(n);
    for (let i = 0; i < n; i++) r[i] = from + i;
    return r;
  },
  linspace: (a, b, n) => {
    const count = Math.floor(n as number);
    if (!(count >= 2) || count > MAXN) throw new Error("linspace needs 2 ≤ n ≤ 1e6");
    const from = Number(a);
    const to = Number(b);
    const r = new Float64Array(count);
    for (let i = 0; i < count; i++) r[i] = from + (to - from) * i / (count - 1);
    return r;
  },
  plot: (x, y) => {
    if (!(x instanceof Float64Array) || !(y instanceof Float64Array) || x.length !== y.length) {
      throw new Error("plot needs two arrays of equal length");
    }
    return { plot: [x, y] as const };
  },
};

// Is `name` a built-in function (elementwise or array)? Definitions
// may not shadow the vocabulary (the artifact's built-in rule).
export function isBuiltin(name: string): boolean {
  return name in F1 || name in FN;
}

// The tokenizer: numbers, identifiers, operators and parens; anything
// else is a per-cell parse error (unexpected <char>).
export function tokenize(s: string): readonly string[] {
  const t: string[] = [];
  const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|[A-Za-z_]\w*|[-+*/^%(),])/gy;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(s)) !== null) {
    t.push(m[1] ?? "");
    last = re.lastIndex;
  }
  const rest = s.slice(last).trim();
  if (rest) throw new Error(`unexpected ${rest[0]}`);
  return t;
}

// The Pratt parser over the token stream (the artifact's expr/unary/
// atom shape): binary precedence climbing, unary minus, calls and
// parens. Every malformed stream throws a per-cell parse error.
export function parse(tokens: readonly string[]): Ast {
  let i = 0;
  const at = (): string | undefined => tokens[i];
  const expr = (minp: number): Ast => {
    let l = unary();
    for (;;) {
      const o = at();
      const p = o === undefined ? undefined : PREC[o];
      if (o === undefined || p === undefined || p < minp) break;
      i++;
      l = { t: "bin", o, l, r: expr(o === "^" ? p : p + 1) };
    }
    return l;
  };
  const unary = (): Ast => {
    if (at() === "-") {
      i++;
      return { t: "neg", e: expr(3) };
    }
    return atom();
  };
  const atom = (): Ast => {
    const k = tokens[i];
    i++;
    if (k === undefined) throw new Error("expression ended early");
    if (/^\d/.test(k)) return { t: "num", v: Number(k) };
    if (/^[A-Za-z_]/.test(k)) {
      if (at() !== "(") return { t: "id", n: k };
      i++;
      const args: Ast[] = [];
      if (at() === ")") i++;
      else {
        for (;;) {
          args.push(expr(1));
          if (at() === ",") {
            i++;
            continue;
          }
          if (at() === ")") {
            i++;
            break;
          }
          throw new Error("expected , or )");
        }
      }
      return { t: "call", f: k, args };
    }
    if (k === "(") {
      const e = expr(1);
      if (tokens[i] !== ")") throw new Error("missing )");
      i++;
      return e;
    }
    throw new Error(`unexpected ${k}`);
  };
  const e = expr(1);
  if (i < tokens.length) throw new Error(`unexpected ${tokens[i]}`);
  return e;
}

// The identifiers an AST reads, in order (dependency inference).
export function idsOf(n: Ast): readonly string[] {
  const o: string[] = [];
  const walk = (node: Ast): void => {
    if (node.t === "id") o.push(node.n);
    else if (node.t === "neg") walk(node.e);
    else if (node.t === "bin") {
      walk(node.l);
      walk(node.r);
    } else if (node.t === "call") node.args.forEach(walk);
  };
  walk(n);
  return o;
}

// The evaluator: numbers, identifier lookups, elementwise negation,
// zipped binary ops, and calls over F1/FN. A call to an unknown
// function is a per-cell error (never eval, never a global lookup).
export function ev(
  n: Ast,
  look: (name: string) => number | Float64Array,
): number | Float64Array | { readonly plot: readonly [Float64Array, Float64Array] } {
  switch (n.t) {
    case "num":
      return n.v;
    case "id":
      return look(n.n);
    case "neg":
      return map1((x) => -x, ev(n.e, look) as number | Float64Array);
    case "bin": {
      const op = OPS[n.o] as (a: number, b: number) => number;
      return zip(op, ev(n.l, look) as number | Float64Array, ev(n.r, look) as number | Float64Array);
    }
    case "call": {
      const a = n.args.map((x) => ev(x, look));
      const f1 = F1[n.f];
      if (f1 !== undefined) return map1(f1, a[0] as unknown as number);
      const fn = FN[n.f];
      if (fn !== undefined) return fn(...(a as unknown as readonly (number | Float64Array)[]));
      throw new Error(`unknown function ${n.f}`);
    }
  }
}
