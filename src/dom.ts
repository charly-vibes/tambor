// Purpose: distribution.packaging — the DOM subpath barrel: the real-DOM
//   backend surface (typing-model keeps these out of the DOM-free core).
// Responsibilities: re-export the DomBackend, the DOM simulation helpers
//   used by the test suite, and the real-DOM host factory for interop apps.
// Rationale: openspec/changes/add-distribution-packaging — browser and
//   jsdom consumers import tambor/dom without touching the SPA gallery.

export { DomBackend, type DomBackendOptions } from "./render/dom.ts";
export {
  computedStyle,
  createCanvas,
  SimCanvas,
  SimElement,
  type ElementLike,
  type SimEvent,
  type SimRect,
} from "./render/domsim.ts";
export {
  realDomFactory,
  RealDomElement,
  type HostDoc,
  type HostElement,
} from "./interop/domhost.ts";
