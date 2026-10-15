// Purpose: the SPA mount (tambor-e2y) — the testable core of the
//   browser entry: the todo example drawn through DomBackend onto the
//   real-DOM host adapter, driven by the corpus top-level wire.
// Responsibilities: mountSpa(doc, container) — a makeApp over the
//   todoApp view and todoState (the registry-aware dispatcher: defeffect
//   effects like add-todo apply), a DomBackend with the realDomFactory,
//   and the subscription loop: every forwarded event routes through the
//   corpus event router (dispatch), its intents go to app.dispatch, and
//   the tree re-draws from app.view(). The first draw lands before any
//   event; the <canvas> surface is attached for input.
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
import {
  RealDomElement,
  realDomFactory,
  type HostDoc,
  type HostElement,
} from "../interop/domhost.ts";
import { todoApp, todoState, type TodoState } from "../examples/todo/todo.ts";
import { makeApp, type App } from "../effects/dispatch.ts";
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
function createTodoApp(): App {
  return makeApp({
    view: (state, context) =>
      todoApp(state as TodoState, context as { focus?: unknown }),
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

export function mountSpa(doc: HostDoc, container: HostElement): SpaHandle {
  return mountDemo(doc, container, createTodoApp);
}

// One gallery demo mount: the same wire as mountSpa, over any demo's
// app factory (tambor-cie.2). The corpus semantics live in the demo
// view + state; this is mounting plumbing only.
export function mountDemo(
  doc: HostDoc,
  container: HostElement,
  create: () => App,
): SpaHandle {
  const app = create();
  const backend = new DomBackend({
    createElement: realDomFactory(doc),
    containerSize: VIEWPORT,
  });
  wireSurface(backend, app);

  const root = backend.root as RealDomElement;
  container.appendChild(root.host);

  const surface = new RealDomElement("canvas", doc);
  container.appendChild(surface.host);
  backend.attach(surface);

  backend.draw(app.view());

  return {
    backend,
    app,
    root,
    surface,
    unmount: () => {
      container.removeChild(root.host);
      container.removeChild(surface.host);
    },
  };
}
