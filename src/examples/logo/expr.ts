// Purpose: the Logo tokenizer and expression reader of the example.logo
//   demo (tambor-y9d.2) — pure text → tokens and token-stream → value
//   machinery, with no world or state access.
// Responsibilities: tokenize (comment stripping, bracket splitting,
//   lowercasing); stripDefs (skip `to … end` bodies — registration
//   happens in the fold, not during execution); defsOf (collect the
//   `to name :params body end` definitions of one entry); readBlock
//   (balanced-bracket block reader); the expression grammar expr/sum/
//   term/fac with :variable lookup and truthy-number coercion.
// Rationale: the wanna-chat session demo is the design authority for
//   the grammar (insights/dynamic-environment.md); this port changes
//   presentation only. Demo-local logic — no corpus semantics live
//   here; see interpreter.ts for the fold.

export interface Reader {
  t: readonly string[];
  i: number;
}

export type Env = Readonly<Record<string, number>>;

// Tokenize: strip comments, split brackets onto their own tokens,
// lowercase, drop empties.
export function tokenize(src: string): readonly string[] {
  return src
    .replace(/;.*$/gm, "")
    .replace(/[[\]()]/g, " $& ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

// Skip the body of a `to … end` definition.
export function stripDefs(toks: readonly string[]): readonly string[] {
  const out: string[] = [];
  let skipping = false;
  for (const t of toks) {
    if (skipping) {
      if (t === "end") skipping = false;
      continue;
    }
    if (t === "to") {
      skipping = true;
      continue;
    }
    out.push(t);
  }
  return out;
}

// Collect the `to … end` definitions of one token stream into procs.
export function defsOf(toks: readonly string[], procs: Record<string, Proc>): void {
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] !== "to") continue;
    const name = toks[i + 1];
    if (typeof name !== "string") return;
    let j = i + 2;
    const params: string[] = [];
    while (typeof toks[j] === "string" && (toks[j] as string)[0] === ":") {
      params.push((toks[j] as string).slice(1));
      j++;
    }
    const body: string[] = [];
    while (j < toks.length && toks[j] !== "end") {
      body.push(toks[j] as string);
      j++;
    }
    procs[name] = { params, body };
    i = j; // the for's i++ lands past the matching end
  }
}

export interface Proc {
  readonly params: readonly string[];
  readonly body: readonly string[];
}

// Balanced-bracket block reader: the tokens between [ and its match.
export function readBlock(P: Reader): readonly string[] {
  const open = P.t[P.i];
  if (open !== "[") throw new Error("expected [");
  let depth = 0;
  const start = P.i;
  do {
    if (P.t[P.i] === "[") depth++;
    if (P.t[P.i] === "]") depth--;
    P.i++;
    if (P.i > P.t.length + 1) throw new Error("missing ]");
  } while (depth > 0 && P.i <= P.t.length);
  if (depth > 0) throw new Error("missing ]");
  return P.t.slice(start + 1, P.i - 1);
}

// Arithmetic contexts coerce the boolean comparison result truthily
// (true = 1, false = 0) — the original's loose typing, made explicit.
export function num(v: number | boolean): number {
  return typeof v === "number" ? v : v ? 1 : 0;
}

// Expression grammar: expr = sum ((<|>|=) sum)?; sum = term ((+|-) term)*;
// term = factor ((*|/) factor)*; factor = number | :var | (expr) | -factor.
// The comparison operators return a boolean consumed truthily by `if`.
export function expr(P: Reader, env: Env): number | boolean {
  const a = sum(P, env);
  const op = P.t[P.i];
  if (op === "<" || op === ">" || op === "=") {
    P.i++;
    const b = sum(P, env);
    return op === "<" ? a < b : op === ">" ? a > b : a === b;
  }
  return a;
}

function sum(P: Reader, env: Env): number {
  let a = term(P, env);
  while (P.t[P.i] === "+" || P.t[P.i] === "-") {
    const op = P.t[P.i++];
    const b = term(P, env);
    a = op === "+" ? a + b : a - b;
  }
  return a;
}

function term(P: Reader, env: Env): number {
  let a = fac(P, env);
  while (P.t[P.i] === "*" || P.t[P.i] === "/") {
    const op = P.t[P.i++];
    const b = fac(P, env);
    a = op === "*" ? a * b : a / b;
  }
  return a;
}

function fac(P: Reader, env: Env): number {
  const t = P.t[P.i++];
  if (t === undefined) throw new Error("a number was expected");
  if (t === "-") return -fac(P, env);
  if (t === "(") {
    const v = expr(P, env);
    P.i++;
    return num(v);
  }
  if (t[0] === ":") {
    const k = t.slice(1);
    if (!(k in env)) throw new Error("no value for :" + k);
    return env[k] as number;
  }
  const n = Number(t);
  if (Number.isNaN(n)) throw new Error("a number was expected, got " + t);
  return n;
}
