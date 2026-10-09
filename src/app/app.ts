// Purpose: the headless app wire — the e2e loop that routes an input
//   event through the view tree, hands the resulting intents to the
//   dispatcher (make-app applies them against the state), and triggers
//   exactly one repaint per routed event, including in raw mode.
// Responsibilities: makeHeadlessApp(options) wraps a make-app instance;
//   send(event) is one routed event: dispatch the current view tree,
//   apply any intents through the app dispatcher, and when a raw-mode
//   event yields no intents (a handler mutated external state and
//   returned nil) trigger one repaint anyway; render() is the current
//   view tree.
// Rationale: openspec/specs/example-counter/spec.md raw_mode_supported is the design
//   authority: "a handler that mutates external state and returns nil is
//   allowed in raw mode and triggers a repaint" — the no-framework
//   version of the counter example, where the view reads the atom at
//   render time like membrane's `#(my-app @counter-atom)` run loop.
//   The repaint is scheduled on the next animation frame through the
//   host capability query (typeof requestAnimationFrame), the same
//   boundary single_repaint pins for the dispatch path. An empty intent
//   list outside raw mode still triggers no repaint (empty_batch_noop).
//   No behavior beyond the corpus.

import { dispatch } from "../events/dispatch.ts";
import type { TamborEvent } from "../events/event.ts";
import { makeApp, type App, type Cell, type ViewFn } from "../effects/dispatch.ts";
import type { Elem } from "../views/model.ts";

export interface HeadlessAppOptions {
  view: ViewFn;
  /** a plain initial state, passed through to make-app */
  state?: unknown;
  /** an atom-like cell, passed through to make-app (used as given) */
  cell?: Cell<unknown>;
  /** raw mode: a routed event repaints even when it yields no intents */
  raw?: boolean;
}

export interface HeadlessApp {
  /** one routed event: dispatch → apply → repaint */
  send(event: TamborEvent): void;
  /** the current view tree */
  render(): Elem;
  /** the app's state */
  getState(): unknown;
}

export function makeHeadlessApp(options: HeadlessAppOptions): HeadlessApp {
  const app: App = makeApp({
    view: options.view,
    ...(options.state !== undefined ? { state: options.state } : {}),
    ...(options.cell !== undefined ? { cell: options.cell } : {}),
  });

  return {
    send(event: TamborEvent): void {
      const intents = dispatch(app.view(), event);
      if (intents.length > 0) {
        // the framework path: the batch applies in order and make-app
        // schedules exactly one repaint
        app.dispatch(intents);
      } else if (options.raw === true) {
        // raw mode: the handler may have mutated external state and
        // returned nil — still exactly one repaint
        scheduleRepaint(app);
      }
      // an empty batch outside raw mode triggers no repaint
      // (empty_batch_noop)
    },
    render: () => app.view(),
    getState: () => app.getState(),
  };
}

// The host capability query: repaints ride the host's animation frame
// when it provides one; a headless host without one repaints nothing.
function scheduleRepaint(app: App): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => {
      app.view();
    });
  }
}
