// Purpose: the SPA mount (tambor-e2y) — the testable core of the
//   browser entry: a demo app drawn through DomBackend onto the
//   real-DOM host adapter, driven by the corpus top-level wire.
// Responsibilities: mountDemo(doc, container, create, opts?) — a DomBackend
//   with the realDomFactory, and the subscription loop: every
//   forwarded event routes through the corpus event router (dispatch),
//   its intents go to app.dispatch, and the tree re-draws from
//   app.view(). The routed draw tail's paint policy is the frame
//   coalescer (add-frame-coalescing D1/D2, mountSpa boundary): state
//   applies synchronously in dispatch order, the derive+draw paints at
//   most once per animation frame by default ("coalesced"), flush()
//   drains a pending draw synchronously, "immediate" and hosts without
//   requestAnimationFrame restore the per-dispatch synchronous draw.
//   Runtime-invalidation (add-runtime-invalidation §3): the mount
//   subscribes to keep the last commit and hands every wire draw the
//   frame's render hint (ChangeSet, overlay, lane, scheme) so the
//   backend's draw() short-circuits on an identity-equal view. (The original todo wiring — createTodoApp/mountSpa —
//   moved to todo-spa.ts with add-spa-delivery: a static example
//   import here pulled src/examples/todo into every initial chunk.)
//   Wheel input has no backend
//   listener, so the surface registers its own (tambor-gov): a raw
//   wheel becomes the corpus scroll event with the deltas on its delta
//   field, preventDefaulted so the page does not scroll. The first draw lands before any
//   event; the input surface IS the drawn root (tambor-huu): real
//   <button>/<span> children bubble their pointer events up to it, so
//   a separate canvas would only ever see synthetic hits. The mount
//   also owns the SPA focus plumbing (tambor-e5n, spa/focus.ts): the
//   corpus request-focus effect the textarea handlers emit is
//   registered on the dispatcher (it sets the ::context/focus state
//   and focuses the surface host), and the focus state is merged into
//   the view context (spaFocusView) so textareas see their focused
//   state. Input hardening (tambor-hyw) is surface wiring too: the
//   keydowns the app handles preventDefault (the page does not
//   scroll), pointer gestures capture the pointer and deliver a
//   synthetic mouse-up on cancel/leave/lost-capture so no down state
//   sticks, and IME composition text inserts like a paste.
//   The opt-in debug snapshot (add-spa-test-seams) is mount plumbing
//   too: when the caller asks for it, the mount publishes a read-only
//   globalThis.__tambor handle AFTER the initial draw, naming the demo
//   and returning the live app state, the raw app view and the draw
//   count; unmount clears it so it never names an unmounted demo.
//   Runtime-invalidation §4.0: the counters?: mount option opts the
//   phase-timers derive/rebuild/draw counters in for the mount's
//   lifetime (never stealing an external meter's seam); the debug
//   snapshot exposes them as counts() next to drawCount.
// Rationale: openspec/specs/example-todo/spec.md is the design authority,
//   with routeClick (backends.ts) as the host-side routing shape: the
//   host dispatches the event and hands the intent list to the app's
//   registry-aware dispatcher. Runtime.send is NOT used — its handler is
//   defaultHandler only, so registered effects like add-todo would be
//   reported unknown (found live in the bundle smoke test). makeTopApp is
//   equally out: topView wraps another event layer around todoApp's own
//   wrapOn root, and nested event layers are unroutable (bounds of a wrap
//   node is unreachable geometry). The SPA changes no app semantics; it
//   is mounting plumbing (backend_portable: the same todo definition now
//   renders as live DOM).

import { DomBackend } from "../render/dom.ts";
import { type App } from "../effects/dispatch.ts";
import { type Elem } from "../views/model.ts";
import { type TamborEvent } from "../events/event.ts";
import {
  RealDomElement,
  realDomFactory,
  type HostDoc,
  type HostElement,
} from "../interop/domhost.ts";
import { setFocusSurface } from "./focus.ts";
import { VIEWPORT } from "./viewport.ts";
import { wireSurfaceInput } from "./surface-input.ts";
import { wireExtentSizing } from "./extent.ts";
import { domMeasure } from "./font.ts";
import { ambientScheme } from "../ui/ambient-theme.ts";
// The wire machinery (coalescer, view cache, lane draws, event wire,
// input surface) and the debug/counters seams live in sibling modules
// (mechanical splits); this file re-exports the public surface.
import {
  attachInputSurface,
  drawnSchemeIs,
  frameCoalescer,
  wireSurface,
  type Coalescer,
} from "./mount-wire.ts";
import { wireDebugSnapshot, type DebugSnapshot } from "./mount-debug.ts";
import { mountCounters } from "./mount-counters.ts";

// The dispatch/coalescing mode (add-frame-coalescing D3): "coalesced"
// paints once per animation frame, "immediate" restores the
// per-dispatch repaint. Default "coalesced".
export type SpaMode = "coalesced" | "immediate";

export interface SpaHandle {
  readonly backend: DomBackend;
  readonly app: App;
  readonly root: RealDomElement;
  readonly surface: RealDomElement;
  /** The active coalescing mode (add-frame-coalescing D3). */
  readonly mode: SpaMode;
  /**
   * Flush any pending coalesced draw synchronously (add-frame-coalescing
   * D2) so DOM readers after a dispatch see the painted tree. In
   * "immediate" mode and the no-rAF fallback nothing is ever pending,
   * so this is a no-op there.
   */
  flush(): void;
  unmount(): void;
}

export interface MountOptions {
  /** Publish globalThis.__tambor after the initial draw. */
  readonly debug?: boolean;
  /** The demo id the snapshot names; defaults to "". */
  readonly demo?: string;
  /**
   * The dispatch/coalescing mode (add-frame-coalescing): "coalesced"
   * (default) paints once per animation frame, "immediate" restores the
   * per-dispatch repaint.
   */
  readonly mode?: SpaMode;
  /**
   * Opt in the §4.0 derive/rebuild/draw counters (the phase-timers
   * seam's enable) for the lifetime of this mount. Default off — zero
   * cost. When the seam is already enabled by an external meter, the
   * mount leaves it alone and the unmount does not disable it.
   */
  readonly counters?: boolean;
}

export { drawnSchemeIs, type DebugSnapshot };

// The label measure/font seam lives in ./font.ts (tambor-v3s): re-exported
// from here because the browser entries and the demo backend import it
// from the mount module. `demoBackend` below uses the imported binding.
export { domMeasure, whenHostFontsReady } from "./font.ts";

// The demo backend: the real-DOM factory plus real font metrics
// (tambor-0rp) — measure with the host's computed face; jsdom falls
// back to the unit measure.
function demoBackend(doc: HostDoc): DomBackend {
  return new DomBackend({
    createElement: realDomFactory(doc),
    containerSize: VIEWPORT,
    measure: domMeasure(doc),
  });
}

// The coalescing mode (add-frame-coalescing D2/D3): "immediate" and
// the no-rAF fallback run today's synchronous per-dispatch draw; the
// coalesced default defers the draw tail to one paint per animation
// frame with flush() draining a pending draw. rAF is reached
// structurally and called as a METHOD of the host global (a detached
// requestAnimationFrame throws "Illegal invocation" in real browsers).
function mountCoalescer(mode: SpaMode): Coalescer | undefined {
  const frameHost = globalThis as {
    requestAnimationFrame?: (cb: () => void) => number;
  };
  const raf = frameHost.requestAnimationFrame;
  return mode === "coalesced" && typeof raf === "function"
    ? frameCoalescer((cb) => raf.call(globalThis, cb))
    : undefined;
}

// Surface wiring + the initial draw (tambor-8xm): the drawn root is
// appended, made the input surface, fed the wire route, and sized; the
// initial draw shares the wire's view cache — one derivation for mount
// + first route.
function mountSurface(
  backend: DomBackend,
  container: HostElement,
  route: (ev: TamborEvent) => void,
  viewFor: () => Elem,
): RealDomElement {
  const root = backend.root as RealDomElement;
  container.appendChild(root.host);
  const surface = attachInputSurface(backend, root);
  wireSurfaceInput(surface, route, backend);
  // Root height tracks the drawn extent per draw (tambor-8yn, extent.ts).
  wireExtentSizing(backend, root.host);
  // The initial draw shares the wire's view cache: one derivation for
  // mount + first route (tambor-8xm).
  backend.draw(viewFor());
  return surface;
}

// Unmount seam: remove the host element, drop the focus surface, clear
// the debug seam, release the counters this mount enabled (never an
// external meter's seam), and kill the coalescer — post-unmount frames
// must not re-derive + draw into the detached tree.
function mountUnmount(
  container: HostElement,
  root: RealDomElement,
  coalescer: Coalescer | undefined,
  clearDebug: (() => void) | undefined,
  releaseCounters: () => void,
): void {
  // surface == root (tambor-huu): one host element to remove
  container.removeChild(root.host);
  setFocusSurface(null);
  clearDebug?.();
  releaseCounters();
  coalescer?.drop();
}

export function mountDemo(
  doc: HostDoc,
  container: HostElement,
  create: () => App,
  opts?: MountOptions,
): SpaHandle {
  // Observe the ambient scheme before anything derives (the view cache
  // observes it too): a mount that lands AFTER a flip starts with a
  // cleared component render cache, so its first derive builds the new
  // scheme's trees instead of replaying the pre-flip cached ones.
  ambientScheme();
  // The coalescing mode (add-frame-coalescing D2/D3): see mountCoalescer.
  const mode: SpaMode = opts?.mode ?? "coalesced";
  const coalescer = mountCoalescer(mode);
  const app = create();
  const releaseCounters = mountCounters(opts);
  const backend = demoBackend(doc);
  const wire = wireSurface(backend, app, coalescer?.paint);

  const root = backend.root as RealDomElement;
  const surface = mountSurface(backend, container, wire.route, wire.viewFor);

  const clearDebug = wireDebugSnapshot(app, backend, opts);

  return {
    backend,
    app,
    root,
    surface,
    mode,
    // Drains the pending coalesced draw (D2): only the coalesced
    // default ever has one pending, so this is a no-op in "immediate"
    // mode and the no-rAF fallback.
    flush: () => coalescer?.flush(),
    unmount: () => mountUnmount(container, root, coalescer, clearDebug, releaseCounters),
  };
}
