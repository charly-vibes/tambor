// Purpose: distribution.packaging — the DOM-free core subpath barrel
//   (typing-model p-core-dom: the core has zero DOM dependencies).
// Responsibilities: re-export model, paths, effect dispatch, events and
//   layout — everything needed to build views, handlers and apps that a
//   non-DOM backend can render.
// Rationale: openspec/changes/add-distribution-packaging separates the
//   DOM-free core (./core) from DOM/SPA parts (./spa, ./dom) so embedders
//   and non-browser hosts never pull DOM modules transitively.

// events/bubble's surface is Handler-free; views/model and effects/dispatch
// both export a `Handler` type, so those two modules are re-exported with
// explicit named lists (TS2308 avoidance) instead of star exports.
export * from "./views/model.ts";
export * from "./views/layout.ts";
export * from "./effects/paths.ts";
export {
  defeffect,
  lookupEffect,
  defaultHandler,
  makeApp,
  cell,
  isCell,
  CONTAINER_SIZE_KEY,
  type Cell,
  type DispatchFn,
  type DispatchInput,
  type Effect,
  type EffectContext,
  type EffectFn,
  type App,
  type AppOptions,
  type Backend,
  type Handler,
  type ViewContext,
  type ViewFn,
} from "./effects/dispatch.ts";
export {
  onBubble,
  onPairs,
  wrapOn,
  type BubbleFn,
  type BubbleNode,
  type EventElem,
  type Intent,
  type IntentList,
  type WrapHandler,
  type WrapNode,
} from "./events/bubble.ts";
