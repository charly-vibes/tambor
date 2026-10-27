// Purpose: the original SPA todo mount (tambor-e2y) — a makeApp over
//   the todoApp view and todoState mounted through the corpus wire.
// Responsibilities: createTodoApp (registry-aware dispatcher: defeffect
//   effects like add-todo apply, focus-context merged via spaFocusView)
//   and mountSpa(doc, container) — DomBackend with the realDomFactory
//   plus mountDemo's subscription loop.
// Rationale: add-spa-delivery moved this wiring OUT of mount.ts —
//   mount.ts is the npm ./spa subpath and the initial SPA chunk; a
//   static todoApp import there pulled src/examples/todo into every
//   initial chunk. The todo wiring is demo/example code: it lives
//   behind this module (imported by tests and nothing in the entry).
//   openspec/specs/example-todo/spec.md stays the design authority.

import { todoApp, todoState, type TodoState } from "../examples/todo/todo.ts";
import { makeApp, type App } from "../effects/dispatch.ts";
import { spaFocusView } from "./focus.ts";
import { VIEWPORT } from "./viewport.ts";
import { mountDemo, type SpaHandle } from "./mount.ts";
import type { HostDoc, HostElement } from "../interop/domhost.ts";

// The focus entry is merged into the context the view sees (tambor-e5n):
// makeApp only injects the container size, so the mount wraps the view
// with the SPA's focus-context merge (focus_ctx) — the todoApp view
// reads context.focus for the textareas' focused state.
export function createTodoApp(): App {
  return makeApp({
    view: spaFocusView((state, context) =>
      todoApp(state as TodoState, context as { focus?: unknown })),
    state: todoState(),
    backend: { containerSize: VIEWPORT },
  });
}

export function mountSpa(doc: HostDoc, container: HostElement): SpaHandle {
  return mountDemo(doc, container, createTodoApp);
}
