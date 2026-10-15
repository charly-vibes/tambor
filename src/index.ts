// Purpose: distribution.packaging — the publishable public API barrel: ES
//   module with named exports and no top-level side effects
//   (esm_named_exports, free_functions — openspec/specs/interop-model).
// Responsibilities: re-export the consumer-facing surface under stable
//   names — the flat interop data API (ops, seam, ops-app, explicit paths,
//   defui) plus the membrane-side modules as namespaces (views, layout,
//   dispatch, paths, events) so no name collides with the interop barrel.
// Rationale: src/interop/index.ts already aggregates the squint/ClojureScript
//   surface and src/examples/todo/todo.ts shows the consumer-facing shape;
//   namespaced modules keep both worlds importable from one entry without
//   renaming. DOM/SPA parts stay behind the ./spa and ./dom subpaths.

export * from "./interop/index.ts";
export * as views from "./views/model.ts";
export * as layout from "./views/layout.ts";
export * as dispatch from "./effects/dispatch.ts";
export * as paths from "./effects/paths.ts";
export * as events from "./events/bubble.ts";
