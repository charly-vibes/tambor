// Purpose: the notebook expression parser (tambor-54j.9) — the
//   artifact's tokenize/parse shape, split from notebook-eval.ts at the
//   pretender 300-line seam.
// Responsibilities: tokenize (a flat number/identifier/operator stream)
//   and parse (Pratt precedence climbing: binary operators by PREC,
//   unary minus, calls, parens); every malformed stream throws a
//   per-cell parse error.
// Rationale: the parser is pure syntax — the evaluator (notebook-eval)
//   walks the ASTs it produces; notebook-core imports both.

import type { Ast } from "./notebook-eval.ts";

const PREC: Readonly<Record<string, number>> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  "^": 3,
};

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
      return { t: "call", f: k, args: callArgs() };
    }
    if (k === "(") {
      const e = expr(1);
      if (tokens[i] !== ")") throw new Error("missing )");
      i++;
      return e;
    }
    throw new Error(`unexpected ${k}`);
  };
  // A call's argument list: empty (), a single expression, or a comma
  // separated run — anything else is a per-cell parse error.
  const callArgs = (): Ast[] => {
    const args: Ast[] = [];
    if (at() === ")") {
      i++;
      return args;
    }
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
    return args;
  };
  const e = expr(1);
  if (i < tokens.length) throw new Error(`unexpected ${tokens[i]}`);
  return e;
}
