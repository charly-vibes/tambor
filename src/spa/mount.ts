// Purpose: the SPA mount (tambor-e2y) — the testable core of the
//   browser entry: the todo example drawn through DomBackend onto the
//   real-DOM host adapter, driven by the corpus top-level wire.
// Responsibilities: mountSpa(doc, container) — a makeApp over the
//   todoApp view and todoState (the registry-aware dispatcher: defeffect
//   effects like add-todo apply), a DomBackend with the realDomFactory,
//   and the subscription loop: every forwarded event routes through the
//   corpus event router (dispatch), its intents go to app.dispatch, and
//   the tree re-draws from app.view(). The first draw lands before any
//   event; the input surface IS the drawn root (tambor-huu): real
//   <button>/<span> children bubble their pointer events up to it, so
//   a separate canvas would only ever see synthetic hits. The mount
//   also owns the SPA focus plumbing (tambor-e5n, spa/focus.ts): the
//   corpus request-focus effect the textarea handlers emit is
//   registered on the dispatcher (it sets the ::context/focus state
//   and focuses the surface host), and the focus state is merged into
//   the view context (spaFocusView) so textareas see their focused
//   state.
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
import type { Vec2 } from "../views/model.ts";
import type { Font } from "../render/backend.ts";
import {
  RealDomElement,
  realDomFactory,
  type HostDoc,
  type HostElement,
} from "../interop/domhost.ts";
import { todoApp, todoState, type TodoState } from "../examples/todo/todo.ts";
import { makeApp, type App } from "../effects/dispatch.ts";
import {
  registerSpaFocus,
  setFocusSurface,
  spaFocusView,
} from "./focus.ts";
import { VIEWPORT } from "./viewport.ts";
import { dispatch } from "../events/dispatch.ts";
import type { TamborEvent } from "../events/event.ts";

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

// One forwarded event = one corpus wire round trip, the routeClick
// shape: route through the event router, hand the intents to the
// registry-aware dispatcher, re-draw from the app view.
function wireSurface(backend: DomBackend, app: App): void {
  backend.subscribe((ev: TamborEvent) => {
    const intents = dispatch(app.view(), ev);
    if (intents.length > 0) app.dispatch(intents);
    backend.draw(app.view());
  });
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

// One gallery demo mount: the same wire as mountSpa, over any demo's
// app factory (tambor-cie.2). The corpus semantics live in the demo
// view + state; this is mounting plumbing only.
// Focus plumbing (tambor-e5n): register the corpus request-focus
// effect (textarea handlers emit it; without this the dispatcher drops
// it as unknown) and point it at this mount's surface — the registry
// is global, so the ref is per-mount and cleared on unmount; the
// surface capability is DOM focus, carried by the host element.
function wireFocus(surface: RealDomElement): void {
  registerSpaFocus();
  setFocusSurface({ focus: () => surface.host.focus?.() });
}

export function mountDemo(
  doc: HostDoc,
  container: HostElement,
  create: () => App,
): SpaHandle {
  const app = create();
  const backend = new DomBackend({
    createElement: realDomFactory(doc),
    containerSize: VIEWPORT,
    // Real font metrics (tambor-0rp): the drawn DOM labels render at
    // browser text metrics, so sibling offsets computed with the unit
    // measure (1px/char) overlap in a real browser. Measure with the same
    // font the emitted spans inherit (16px system-ui, the mount/host CSS
    // default). jsdom has no canvas 2D context — falls back to the unit
    // measure there, where the structural contracts don't need metrics.
    measure: domMeasure(doc),
  });
  wireSurface(backend, app);

  const root = backend.root as RealDomElement;
  container.appendChild(root.host);

  const surface = attachInputSurface(backend, root);

  wireFocus(surface);
  backend.draw(app.view());

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
