// Purpose: interop.model — the explicit path-building API: plain
//   functions for path concatenation, a filter navigator constructor
//   and an each helper that hands each child its value and its path
//   (paths_explicit_api). The dollar-path derivation is optional.
// Responsibilities: concatPath joins path fragments (nested arrays
//   flatten); filterNav builds the ["filter", pred] navigator; each
//   walks a list giving (value, path) per child, the child path being
//   the parent path plus the child's index.
// Rationale: openspec/specs/interop-model/spec.md is the design authority, porting
//   experiments/tambor-paths.mjs's path-aware each. Paths are the
//   plain data of state.paths; concatenation normalizes once so
//   nesting never leaks. each gives the i-th child the path
//   parent + nth(i) — for a filtered todo list the second visible item
//   reads todos, filter, 1 (p_explicit_paths).

import { normalize, type Navigator, type Path, type Pred } from "../effects/paths.ts";

/** Concatenate path fragments; nested arrays flatten (nested_paths_flatten). */
export function concatPath(...parts: readonly Path[]): Path {
  return normalize(parts as unknown as Path);
}

/** The filter navigator constructor. */
export function filterNav(pred: Pred | string): Navigator {
  return ["filter", pred];
}

/** The nth navigator constructor (each's child step). */
export function nthNav(i: number): Navigator {
  return ["nth", i];
}

/** each: hand every child its value and its path, no macro needed. */
export function each(
  xs: Iterable<unknown>,
  $xs: Path,
  f: (value: unknown, path: Path) => unknown,
): readonly unknown[] {
  return Array.from(xs, (x, i) => f(x, concatPath($xs, [nthNav(i)])));
}
