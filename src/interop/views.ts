// Purpose: interop.model — the plain view constructors the host
//   languages build views with, plus the single place iterable inputs
//   are normalized.
// Responsibilities: label(text) and vstack(...) as plain-data nodes
//   (plain_data_api); vstack accepts either rest arguments or one array
//   or any other iterable of children, normalizing to an array once at
//   the boundary so apply and direct array calls both work
//   (variadic_and_array, iterable_inputs).
// Rationale: specs/interop-model.md is the design authority. The
//   normalization is exactly one toArray pass at the boundary — the
//   lazy results of squint map and for arrive as iterables and are
//   collected here, never later. Strings are node text, never child
//   lists, so a lone string stays a single child rather than
//   exploding into characters.

import { jsOps } from "./ops.ts";

/** A label node: plain data, string type tag. */
export interface LabelNode {
  readonly type: "label";
  readonly text: string;
}

/** A vertical stack node: plain data, string type tag, array children. */
export interface VStackNode {
  readonly type: "vstack";
  readonly children: readonly unknown[];
}

export function label(text: string): LabelNode {
  return { type: "label", text };
}

function isList(x: unknown): boolean {
  if (x === null || x === undefined || typeof x === "string") return false;
  return typeof (x as Iterable<unknown>)[Symbol.iterator] === "function";
}

/** vstack accepts rest arguments or one array (or any other iterable)
 * of children; the output children is always an array. */
export function vstack(...args: readonly unknown[]): VStackNode {
  const children: unknown[] =
    args.length === 1 && isList(args[0]) ? jsOps.toArray(args[0]) : [...args];
  return { type: "vstack", children };
}
