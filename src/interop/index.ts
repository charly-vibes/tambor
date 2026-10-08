// Purpose: interop.model — the public API barrel: ES module with named
//   exports and no top-level side effects (esm_named_exports), free
//   functions taking data first (free_functions).
// Responsibilities: re-export the interop surface under stable names.
// Rationale: specs/interop-model.md is the design authority. Everything
//   here is a function, a constant or a sentinel — no methods, no
//   builder chains, no reliance on this; and importing this module runs
//   no side effect, so squint and shadow-cljs can require it plainly.

export type { DataOps } from "./ops.ts";
export { jsOps } from "./ops.ts";
export {
  interDispatch,
  makeRegistry,
  seamDelete,
  seamSelect,
  seamSet,
  seamUpdate,
  type InterHandler,
} from "./seam.ts";
export { makeOpsApp, type OpsApp, type OpsAppOptions } from "./app.ts";
export { label, vstack, type LabelNode, type VStackNode } from "./views.ts";
export { concatPath, each, filterNav, nthNav } from "./paths.ts";
export { defui } from "./defui.ts";
