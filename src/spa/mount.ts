// Purpose: the SPA mount (tambor-e2y) — the testable core of the
//   browser entry: a demo app drawn through DomBackend onto the
//   real-DOM host adapter, driven by the corpus top-level wire.
// Responsibilities: mountDemo(doc, container, create, opts?) — a DomBackend
//   with the realDomFactory, and the subscription loop: every
//   forwarded event routes through the corpus event router (dispatch),
//   its intents go to app.dispatch, and the tree re-draws from
//   app.view(). (The original todo wiring — createTodoApp/mountSpa —
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
import { type Elem, type Vec2, translate } from "../views/model.ts";
import { wireExtentSizing } from "./extent.ts";
import { domMeasure } from "./font.ts";
import {
  RealDomElement,
  realDomFactory,
  type HostDoc,
  type HostElement,
} from "../interop/domhost.ts";
import { type App, type Effect, type LaneStore } from "../effects/dispatch.ts";
import { setFocusSurface } from "./focus.ts";
import { VIEWPORT } from "./viewport.ts";
import { dispatch } from "../events/dispatch.ts";
import { phaseTimers } from "../events/phase-timers.ts";
import { type TamborEvent } from "../events/event.ts";
import { wireSurfaceInput } from "./surface-input.ts";

export interface SpaHandle {
  readonly backend: DomBackend;
  readonly app: App;
  readonly root: RealDomElement;
  readonly surface: RealDomElement;
  unmount(): void;
}

// The read-only debug snapshot (add-spa-test-seams): live accessors on
// the mounted app, never copies.
//
// Design decision — read-only-by-API, not a deep-frozen snapshot or a
// clone/projection. The handle holds function references and allocates
// nothing on read: state() returns app.getState() (the spec's "equals
// the app state" is identity, and a copy could never satisfy it),
// view() returns the RAW app.view() derivation (never the wire's
// cached or lane-wrapped tree, which is a draw detail), and there is
// no setter and no dispatch on the handle. A clone/projection would
// allocate a whole state/view tree per read and put a stale copy
// between extractors and the app; deep-freezing the live objects would
// mutate app-owned state (frozen state breaks any app that writes
// through its own boxes) and still would not pin identity. Isolation
// is enforced at the API surface, and the tests pin it: a fixed key
// set with no write path.
//
// drawCount reads DomBackend.drawCount, which draw() increments — the
// single draw path every actual draw goes through (the mount's initial
// draw, wireDrawTail's state and lane draws, async re-renders, resizes).
// A forwarded event that yields no intents draws nothing, so the count
// does not move; debug on/off changes no drawn output.
export interface DebugSnapshot {
  /** The gallery demo id actually mounted ("" when unknown). */
  readonly demo: string;
  /** The live app state (identity, not a copy). */
  state(): unknown;
  /** The raw app view derivation, not the cached/lane-wrapped tree. */
  view(): Elem;
  /** Every actual backend draw since this mount was created. */
  drawCount(): number;
}

export interface MountOptions {
  /** Publish globalThis.__tambor after the initial draw. */
  readonly debug?: boolean;
  /** The demo id the snapshot names; defaults to "". */
  readonly demo?: string;
}

// The host global, reached structurally (tsconfig carries no DOM lib).
interface DebugGlobal {
  __tambor?: DebugSnapshot;
}

// The demo viewport, used for both the app render context and the
// backend container size.
// The registry-aware app wire (makeApp): defeffect effects like
// add-todo apply; the backend is carried so the render context sees
// the container size.
// Route-time view cache (tambor-8xm): the drawn tree is reused while
// the state is unchanged. State changes only through dispatch, so
// app.getState() identity is the invalidation signal — a derivation
// happens only on a change, and the phase-timer derive span still
// opens/closes per route (a cache hit records a ~zero span).
// The lane transform (tambor-54j.3 Phase 2): the wire draws every tree
// — cached or freshly derived — under the lane's pan/scroll offset as
// a translate wrapper (BZ2 pan-as-transform promoted to a seam). The
// lane keys are "pan" and "scroll", each a Vec2 ([x, y]) or {x, y};
// absent or non-conforming entries contribute zero. At identity the
// tree is returned unwrapped so apps that never touch the lane draw
// exactly as before.
function laneTransform(lane: LaneStore): Vec2 {
  let x = 0;
  let y = 0;
  for (const key of ["pan", "scroll"]) {
    const v: unknown = lane[key];
    if (Array.isArray(v)) {
      const a = v as unknown[];
      if (typeof a[0] === "number") x += a[0];
      if (typeof a[1] === "number") y += a[1];
    } else if (v !== null && typeof v === "object" && "x" in v) {
      const o = v as { x?: unknown; y?: unknown };
      x += typeof o.x === "number" ? o.x : 0;
      y += typeof o.y === "number" ? o.y : 0;
    }
  }
  return [x, y];
}

function viewCache(app: App, size: () => unknown): () => Elem {
  let cache: { state: unknown; size: unknown; view: Elem } | null = null;
  return () => {
    const state = app.getState();
    const box = size();
    if (cache !== null && cache.state === state && cache.size === box)
      return cache.view;
    const view = app.view();
    cache = { state, size: box, view };
    return view;
  };
}

// The drag overlay (interaction-lane lane_overlay_drawn, Phase 4): a
// lane entry may carry an overlay renderer `(entry) => Elem` — the
// dragged shape re-drawn from the lane position. The first such entry
// in key order is rendered ON TOP of the tree (appended after it in
// draw order); the renderer is called with its lane entry at draw
// time. Draw-only: routing semantics are untouched (the pointer
// stream hits the tree's own handlers). Single-drag scope v1.
function laneOverlay(app: App): Elem | null {
  const lane = app.getLane() as Record<string, unknown>;
  for (const key of Object.keys(lane)) {
    const v = lane[key];
    if (v !== null && typeof v === "object") {
      const overlay = (v as { overlay?: unknown }).overlay;
      if (typeof overlay === "function") {
        return (overlay as (entry: unknown) => Elem)(v);
      }
    }
  }
  return null;
}

// Every wire draw goes through here: the tree under the lane wrap,
// with the drag overlay appended on top while a drag entry carries a
// renderer (lane-only draw, state re-derive and async re-render
// alike — lane wins on position, state wins on structure).
function drawWire(
  backend: DomBackend,
  app: App,
  wrap: (tree: Elem) => Elem,
  tree: Elem,
): void {
  const overlay = laneOverlay(app);
  backend.draw(overlay === null ? wrap(tree) : wrap([tree, overlay]));
}

// The lane transform wrapper (interaction-lane): every draw — cached
// or freshly derived — carries the lane's pan/scroll offset, so the
// lane wins on position while state wins on structure; at identity
// the tree passes through unwrapped. Shared by the wire route's lane
// draw, the state draw and the rerender path.
function laneWrap(app: App): (tree: Elem) => Elem {
  return (tree) => {
    const [x, y] = laneTransform(app.getLane());
    return x === 0 && y === 0 ? tree : translate(x, y, tree);
  };
}

// The wire's draw tail — what a routed batch costs after its intents
// are applied. Empty intents changed nothing (event_pure — the same
// empty_batch_noop shape the headless wire pins): no re-derivation, no
// draw. A lane-only batch (interaction-lane lane_draw_no_derive): the
// state identity is unchanged, so the cached tree is still valid —
// draw it under the lane transform (usually the 60 Hz pan delta) with
// NO re-derivation. Any state effect: one derivation + one draw.
function wireDrawTail(
  backend: DomBackend,
  app: App,
  viewFor: () => Elem,
  wrap: (tree: Elem) => Elem,
  intents: readonly Effect[],
): void {
  if (intents.length === 0) return;
  if (intents.every((effect) => effect[0] === "lane")) {
    drawWire(backend, app, wrap, viewFor());
    return;
  }
  phaseTimers.startSpan("derive");
  const drawn = viewFor();
  phaseTimers.endSpan();
  drawWire(backend, app, wrap, drawn);
}

// The re-render wrapper (tambor-a45): async applies route through the
// demo's own dispatch OUTSIDE the event wire, so every non-routed
// dispatch re-draws from the cached view; the route's own draw stays
// single (setRouted(true) around the routed apply). A lane-only async
// dispatch draws the cached tree under the transform too: no repaint
// was scheduled, and the state identity makes viewFor a cache hit —
// no re-derivation (lane_draw_no_derive).
function wireRerender(
  backend: DomBackend,
  app: App,
  viewFor: () => Elem,
): { setRouted(routed: boolean): void } {
  const wrap = laneWrap(app);
  let routed = false;
  const rawDispatch = app.dispatch;
  app.dispatch = (batch, ...rest: unknown[]): undefined => {
    const applied = rawDispatch(batch, ...rest);
    if (!routed) drawWire(backend, app, wrap, viewFor());
    return applied;
  };
  return { setRouted: (routedNow: boolean) => void (routed = routedNow) };
}

// One forwarded event = one corpus wire round trip, the routeClick
// shape: route through the event router, hand the intents to the
// registry-aware dispatcher, re-draw from the app view. Returns the
// wire so the surface's own wheel listener (tambor-gov) can feed the
// same route.
interface Wire {
  route(ev: TamborEvent): void;
  viewFor(): Elem;
}

function wireSurface(backend: DomBackend, app: App): Wire {
  // Phase-timer seams (tambor-54j.1, opt-in): derive is accumulated
  // over the view derivations of the wire (a cache hit records a ~zero
  // span), handler is the routing plus the intent application, and the
  // dom draw attributes reconcile_layout and closes the record. All
  // seam calls are no-ops while the timers are off.
  const viewFor = viewCache(app, () => backend.containerSize);
  const wrap = laneWrap(app);
  const rerender = wireRerender(backend, app, viewFor);
  const route = (ev: TamborEvent): void => {
    phaseTimers.begin(ev.type);
    phaseTimers.startSpan("derive");
    const view = viewFor();
    phaseTimers.endSpan();
    phaseTimers.startSpan("handler");
    const intents = dispatch(view, ev);
    rerender.setRouted(true);
    try {
      if (intents.length > 0) app.dispatch(intents);
    } finally {
      rerender.setRouted(false);
    }
    phaseTimers.endSpan();
    wireDrawTail(backend, app, viewFor, wrap, intents);
  };
  backend.subscribe(route);
  return { route, viewFor };
}

// The input surface IS the drawn root (tambor-huu): pointer events on
// the real <button>/<span> children bubble to it, and the origin is
// the root's own bounding rect, so normalizeDOMEvent's view-space
// translation lands the hit exactly where the tree was laid out. The
// root is focusable (tabindex) for keyboard/paste, sized to the
// viewport so it actually occupies layout, and touch-action:none so
// touch input feeds the corpus instead of scrolling the page.
function attachInputSurface(backend: DomBackend, root: RealDomElement): RealDomElement {
  root.host.setAttribute("tabindex", "0");
  root.host.style.setProperty("width", `${VIEWPORT[0]}px`);
  root.host.style.setProperty("height", `${VIEWPORT[1]}px`);
  root.host.style.setProperty("touch-action", "none");
  backend.attach(root);
  return root;
}

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

// The opt-in debug snapshot (add-spa-test-seams), published only AFTER
// the initial draw: a reader that sees the handle sees a demo that is
// actually drawn. Without the flag no handle is ever created and no
// cleanup is returned — a stale global from another page belongs to
// nobody here and is left alone; the cleanup only clears the handle
// THIS mount published, and only while it is still the mounted one.
function wireDebugSnapshot(
  app: App,
  backend: DomBackend,
  opts: MountOptions | undefined,
): (() => void) | undefined {
  if (opts === undefined || opts.debug !== true) return undefined;
  const host = globalThis as DebugGlobal;
  const snapshot: DebugSnapshot = {
    demo: opts.demo ?? "",
    state: () => app.getState(),
    view: () => app.view(),
    drawCount: () => backend.drawCount,
  };
  host.__tambor = snapshot;
  return () => {
    if (host.__tambor === snapshot) delete host.__tambor;
  };
}

export function mountDemo(
  doc: HostDoc,
  container: HostElement,
  create: () => App,
  opts?: MountOptions,
): SpaHandle {
  const app = create();
  const backend = demoBackend(doc);
  const wire = wireSurface(backend, app);

  const root = backend.root as RealDomElement;
  container.appendChild(root.host);

  const surface = attachInputSurface(backend, root);

  wireSurfaceInput(surface, wire.route, backend);

  // Root height tracks the drawn extent per draw (tambor-8yn, extent.ts).
  wireExtentSizing(backend, root.host);

  // The initial draw shares the wire's view cache: one derivation for
  // mount + first route (tambor-8xm).
  backend.draw(wire.viewFor());

  const clearDebug = wireDebugSnapshot(app, backend, opts);

  return {
    backend,
    app,
    root,
    surface,
    unmount: () => {
      // surface == root (tambor-huu): one host element to remove
      container.removeChild(root.host);
      setFocusSurface(null);
      clearDebug?.();
    },
  };
}
