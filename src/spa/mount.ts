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
import {
  clipboard,
  mouseUp,
  scroll,
  type TamborEvent,
} from "../events/event.ts";
import { MODIFIER_KEYS, normalizeKey } from "../render/input.ts";

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
// registry-aware dispatcher, re-draw from the app view. Returns the
// wire so the surface's own wheel listener (tambor-gov) can feed the
// same route.
function wireSurface(backend: DomBackend, app: App): (ev: TamborEvent) => void {
  const route = (ev: TamborEvent): void => {
    const intents = dispatch(app.view(), ev);
    if (intents.length > 0) app.dispatch(intents);
    backend.draw(app.view());
  };
  backend.subscribe(route);
  return route;
}

// Wheel forwarding (tambor-gov): backend-render's input_forwarded says
// raw wheel events are normalised and forwarded, but the backend
// attaches no wheel listener, so the SPA surface registers its own on
// the drawn root. The raw wheel becomes the corpus scroll event (the
// event-model kind the wheel rules run on), carrying the raw deltas on
// the event's delta field — the transport components-scrollview's
// header delegates to the integration — at the cursor position
// translated into view space the same way normalizeDOMEvent does it.
// preventDefault so the page itself does not scroll; the mount owns
// the delta, the wheel rules in the scrollview consume it.
function wireWheel(surface: RealDomElement, route: (ev: TamborEvent) => void): void {
  surface.host.addEventListener("wheel", (raw) => {
    const e = raw as {
      clientX?: number;
      clientY?: number;
      deltaX?: number;
      deltaY?: number;
      preventDefault(): void;
    };
    e.preventDefault();
    const r = surface.host.getBoundingClientRect();
    route(
      scroll(
        [(e.clientX ?? 0) - r.x, (e.clientY ?? 0) - r.y],
        { delta: [e.deltaX ?? 0, e.deltaY ?? 0] },
      ),
    );
  });
}

// The raw device position in view space — the surface-host bounding-rect
// origin removed, the same translation wheel forwarding uses.
function viewPos(surface: RealDomElement, e: { clientX?: number; clientY?: number }): Vec2 {
  const r = surface.host.getBoundingClientRect();
  return [(e.clientX ?? 0) - r.x, (e.clientY ?? 0) - r.y];
}

// Key guard (tambor-hyw): keys the app handles — every keydown that
// forwards a corpus event (arrows, space, backspace, printable keys,
// multi-char IME keys) and every modified combo — preventDefault so the
// page does not scroll and the browser does not eat the shortcut. A
// modifier key alone produces no corpus event and stays unprevented.
function wireKeyGuard(surface: RealDomElement): void {
  surface.host.addEventListener("keydown", (raw) => {
    const e = raw as {
      key?: unknown;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      preventDefault(): void;
    };
    const key = e.key;
    if (typeof key !== "string") return;
    const modified = e.ctrlKey === true || e.metaKey === true || e.altKey === true;
    const forwarded = normalizeKey(key) !== null
      || (key.length > 1 && !MODIFIER_KEYS.includes(key)
        && key !== "Unidentified" && key !== "Process" && key !== "Dead");
    if (forwarded || modified) e.preventDefault();
  });
}

// Pointer capture and cancel (tambor-hyw): a pointerdown captures the
// pointer when the host can (so a drag leaving the surface keeps its
// moves), and every way a gesture can die without a pointerup —
// pointercancel, or the pointer leaving the surface when capture is
// unavailable, or the capture being lost mid-drag — delivers the
// synthetic mouse-up so no component's down state sticks. The
// synthetic mouse-up goes through the backend's deliver — the same
// path every real forwarded event takes (subscribers + routing), not
// a side door.
function wirePointerCapture(surface: RealDomElement, deliver: (ev: TamborEvent) => void): void {
  const host = surface.host;
  let mdown = false;
  let lastPos: Vec2 = [0, 0];
  const release = (): void => {
    if (!mdown) return;
    mdown = false;
    deliver(mouseUp(lastPos));
  };
  host.addEventListener("pointerdown", (raw) => {
    const e = raw as { clientX?: number; clientY?: number; pointerId?: unknown };
    mdown = true;
    lastPos = viewPos(surface, e);
    try {
      if (typeof (host as { setPointerCapture?: unknown }).setPointerCapture === "function"
        && typeof e.pointerId === "number"
      ) {
        (host as unknown as { setPointerCapture(id: number): void }).setPointerCapture(e.pointerId);
      }
    } catch {
      // a capture failure must not break the pointer flow
    }
  });
  host.addEventListener("pointermove", (raw) => {
    lastPos = viewPos(surface, raw as { clientX?: number; clientY?: number });
  });
  host.addEventListener("pointerup", () => {
    mdown = false;
  });
  host.addEventListener("pointercancel", release);
  host.addEventListener("pointerleave", release);
  host.addEventListener("lostpointercapture", release);
}

// IME composition (tambor-hyw): the committed text arrives as a
// compositionend with the data string — route it as paste-like
// insertion (the clipboard shape the textarea rules speak), the same
// way the multi-char keydown path does.
function wireIme(surface: RealDomElement, deliver: (ev: TamborEvent) => void): void {
  surface.host.addEventListener("compositionend", (raw) => {
    const data = (raw as { data?: unknown }).data;
    if (typeof data === "string" && data.length > 0) deliver(clipboard(data));
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

// Surface wiring: every raw-DOM seam hangs off the surface element —
// wheel forwarding (tambor-gov), input hardening (tambor-hyw: handled
// keys preventDefault, pointer gestures get capture/cancel and mouse-up
// delivery, IME composition inserts text) and the focus plumbing
// (tambor-e5n).
function wireSurfaceInput(
  surface: RealDomElement,
  route: (ev: TamborEvent) => void,
  backend: DomBackend,
): void {
  wireWheel(surface, route);
  wireKeyGuard(surface);
  wirePointerCapture(surface, backend.deliver.bind(backend));
  wireIme(surface, backend.deliver.bind(backend));
  wireFocus(surface);
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
  const route = wireSurface(backend, app);

  const root = backend.root as RealDomElement;
  container.appendChild(root.host);

  const surface = attachInputSurface(backend, root);

  wireSurfaceInput(surface, route, backend);
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
