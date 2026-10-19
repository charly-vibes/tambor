// Purpose: components.virtual_list — the public barrel of the
//   virtual-list component (tambor-54j.8.2).
// Responsibilities: re-export the component, its view and the pure
//   window geometry under stable names.
// Rationale: openspec/specs/components-virtual_list/spec.md is the design
//   authority; the geometry stays importable separately so app-local
//   window computations (tracker's Move window, the bench apps) can use
//   the same arithmetic without the component wrapper.

export { virtualList, virtualListView } from "./virtual_list.ts";
export {
  rowOffset,
  contentExtent,
  windowFor,
  windowSummary,
  type WindowSummary,
} from "./geometry.ts";
