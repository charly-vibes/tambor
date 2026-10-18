// Purpose: the SPA mount (tambor-e2y) — the testable core of the
//   browser entry: the todo example drawn through DomBackend onto the
//   real-DOM host adapter, driven by the corpus top-level wire.
// Responsibilities: mountSpa(doc, container) — a makeApp over the
//   todoApp view and todoState (the registry-aware dispatcher: defeffect
//   effects like add-todo apply), a DomBackend with the realDomFactory,
//   and the subscription loop: every forwarded event routes through the
//   corpus event router (dispatch), its intents go to app.dispatch, and
//   the tree re-draws from app.view(). Wheel input has no backend
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
import { measureUnit } from "../render/backend.ts";
import { type Elem, type Vec2 } from "../views/model.ts";
import { wireExtentSizing } from "./extent.ts";
import type { Font } from "../render/backend.ts";
import {
  RealDomElement,
  realDomFactory,
  type HostDoc,
  type HostElement,
} from "../interop/domhost.ts";
import { todoApp, todoState, type TodoState } from "../examples/todo/todo.ts";
import { makeApp, type App } from "../effects/dispatch.ts";
import { setFocusSurface, spaFocusView } from "./focus.ts";
import { VIEWPORT } from "./viewport.ts";
import { dispatch } from "../events/dispatch.ts";
import { phaseTimers } from "../events/phase-timers.ts";
import { type TamborEvent } from "../events/event.ts";
import type { IntentList } from "../core.ts";
import { wireSurfaceInput } from "./surface-input.ts";

export interface SpaHandle {
  readonly backend: DomBackend;
  readonly app: App;
  readonly root: RealDomElement;
  readonly surface: RealDomElement;
  unmount(): void;
}

// The demo viewport, used for both the app render context and the
// backend container size.
// The registry-aware app wire (makeApp): defeffect effects like
// add-todo apply; the backend is carried so the render context sees
// the container size.
// The focus entry is merged into the context the view sees (tambor-e5n):
// makeApp only injects the container size, so the mount wraps the view
// with the SPA's focus-context merge (focus_ctx) — the todoApp view
// reads context.focus for the textareas' focused state.
function createTodoApp(): App {
  return makeApp({
    view: spaFocusView((state, context) =>
      todoApp(state as TodoState, context as { focus?: unknown })),
    state: todoState(),
    backend: { containerSize: VIEWPORT },
  });
}

// Route-time view cache (tambor-8xm): the drawn tree is reused while
// the state is unchanged. State changes only through dispatch, so
// app.getState() identity is the invalidation signal — a derivation
// happens only on a change, and the phase-timer derive span still
// opens/closes per route (a cache hit records a ~zero span).
function viewCache(app: App): () => Elem {
  let cache: { state: unknown; view: Elem } | null = null;
  return () => {
    const state = app.getState();
    if (cache !== null && cache.state === state) return cache.view;
    const view = app.view();
    cache = { state, view };
    return view;
  };
}

// The re-render wrapper (tambor-a45): async applies route through the
// demo's own dispatch OUTSIDE the event wire, so every non-routed
// dispatch re-draws from the cached view; the route's own draw stays
// single (setRouted(true) around the routed apply).
function wireRerender(
  backend: DomBackend,
  app: App,
  viewFor: () => Elem,
): { setRouted(routed: boolean): void } {
  let routed = false;
  const rawDispatch = app.dispatch;
  app.dispatch = (batch, ...rest: unknown[]): undefined => {
    const applied = rawDispatch(batch, ...rest);
    if (!routed) backend.draw(viewFor());
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
  const viewFor = viewCache(app);
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
    // Empty intents changed nothing (event_pure — the same
    // empty_batch_noop shape the headless wire pins): no re-derivation,
    // no draw, so the wire floor stops scaling with app state.
    if (intents.length === 0) return;
    phaseTimers.startSpan("derive");
    const drawn = viewFor();
    phaseTimers.endSpan();
    backend.draw(drawn);
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

export function mountSpa(doc: HostDoc, container: HostElement): SpaHandle {
  return mountDemo(doc, container, createTodoApp);
}

// Real font metrics for the mount path (tambor-0rp): measure text the way
// the emitted DOM spans will render it — canvas 2D measureText with the
// mount/host CSS default font (16px system-ui). The demos draw with
// font: null, and layout offsets come from measure, so without this the
// unit measure (1px/char) under-measures real text and siblings overlap
// in a real browser. jsdom has no canvas 2D context (getContext returns
// null) — fall back to the unit measure; the structural contracts and
// the jsdom suite do not need metrics, only the real browser does.
// Exported for the browser entry (main.ts), which also feeds it to
// configureLabelMeasure so VIEW-build-time layout (bounds/verticalLayout)
// uses the same metrics the backend measures with.
export function domMeasure(doc: HostDoc): (text: string, font?: Font | null) => Vec2 {
  const unit = measureUnit;
  try {
    const canvas = doc.createElement("canvas");
    const ctx = (canvas as unknown as {
      getContext: (kind: string) => { font: string; measureText: (t: string) => { width: number } } | null;
    }).getContext("2d");
    if (!ctx) return unit;
    ctx.font = '16px system-ui, sans-serif';
    return (text, _font) => {
      // multiline labels (textarea bodies): the width is the widest line,
      // the height is one line-box per line — matches the pre-formatted
      // span the DOM emission renders (tambor-0rp)
      const lines = text.split("\n");
      let width = 0;
      for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > width) width = w;
      }
      return [width, 16 * lines.length];
    };
  } catch {
    return unit;
  }
}

// The demo backend: the real-DOM factory plus real font metrics
// (tambor-0rp) — measure with the font the emitted spans inherit (16px
// system-ui); jsdom falls back to the unit measure.
function demoBackend(doc: HostDoc): DomBackend {
  return new DomBackend({
    createElement: realDomFactory(doc),
    containerSize: VIEWPORT,
    measure: domMeasure(doc),
  });
}

export function mountDemo(
  doc: HostDoc,
  container: HostElement,
  create: () => App,
): SpaHandle {
  const app = create();
  const backend = demoBackend(doc);
  const wire = wireSurface(backend, app);
  const route = wire.route;

  const root = backend.root as RealDomElement;
  container.appendChild(root.host);

  const surface = attachInputSurface(backend, root);

  wireSurfaceInput(surface, route, backend);

  // Root height tracks the drawn extent per draw (tambor-8yn, extent.ts).
  wireExtentSizing(backend, root.host);

  // The initial draw shares the wire's view cache: one derivation for
  // mount + first route (tambor-8xm).
  backend.draw(wire.viewFor());

  return {
    backend,
    app,
    root,
    surface,
    unmount: () => {
      // surface == root (tambor-huu): one host element to remove
      container.removeChild(root.host);
      setFocusSurface(null);
    },
  };
}
