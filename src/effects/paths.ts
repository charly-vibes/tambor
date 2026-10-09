// Purpose: the state.paths path system — public API surface.
// Responsibilities: re-export the navigator/symbol vocabulary and
//   normalization (paths-core), and the immutable select/set/update/
//   delete entry points (paths-walk).
// Rationale: openspec/specs/state-paths/spec.md is the design authority — never
//   improvise semantics beyond its constraint rows. The module stays a
//   thin re-export so the walk engine can carry one handler per
//   navigator without bloating a single file (tambor-272).

export {
  ALL,
  END,
  FIRST,
  LAST,
  MAP_VALS,
  META,
  isNavigator,
  isSpecial,
  keywordPred,
  normalize,
  type Navigator,
  type Path,
  type Pred,
  type SpecialSymbol,
  type Step,
} from "./paths-core.ts";

export {
  deletePath,
  select,
  setPath,
  updatePath,
} from "./paths-walk.ts";
