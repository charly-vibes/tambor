// Purpose: the app.toplevel top-level handler — the root wire that
//   routes every event the backend delivers to the app root, passes the
//   resulting intents to the dispatcher, manages drag-scrolling and
//   clears focus on a click that hits nothing.
// Responsibilities: topEventHandler(state, view, event) — the pure root
//   wire: while a drag is in progress a mouse-move calls the stored
//   scroll function with the position delta and a mouse-up returns only
//   the clear-scroll-state effect; otherwise the event routes through
//   the view and a mouse-down that yields start-scroll intents stores
//   the deepest one's function and position in the state, replaces it
//   by its [0, 0] call result and drops the other start-scroll intents;
//   a mouse-down that yields nothing with a focus set emits the
//   clear-focus effect; makeTopApp(options) wires topEventHandler
//   against make-app, with the root wrapped so has-mouse-move-global
//   always reports true.
// Rationale: openspec/specs/app-toplevel/spec.md is the design authority — never
//   improvise semantics beyond its constraint rows. It ports membrane's
//   TopEventHandler, wrap-scroll and wrap-start-scroll (component.cljc):
//   the scrollbars return a start-scroll intent holding a function from
//   offset delta to intents, the root intercepts it and stores
//   {scrollf, mpos} in the state, and feeds later mouse moves to
//   scrollf until mouse-up; a mouse-down that produces no intents while
//   a focus is set clears the focus, which is why clicking outside a
//   textarea blurs it. The reserved namespaces are the "::"-prefixed
//   keys — the port of Clojure's namespaced keywords, the same encoding
//   component-model uses for the root ::extra/::context scratch — so an
//   ordinary user key can never collide with one. No behavior beyond
//   the corpus.

import { makeApp, type App, type Backend, type Effect, type Handler, type ViewFn } from "../effects/dispatch.ts";
import { select, type Path } from "../effects/paths.ts";
import type { Intent, IntentList } from "../events/bubble.ts";
import { dispatch } from "../events/dispatch.ts";
import type { TamborEvent } from "../events/event.ts";
import { on, type Elem, type Vec2 } from "../views/model.ts";

// The reserved namespaces of the top-level state (state_namespaces):
// extra, context and top-extra live under reserved keys of the state.
// The "::" prefix is the port of Clojure's namespaced keywords, the
// same encoding component-model uses for the root scratch.
export const EXTRA_KEY = "::extra";
export const CONTEXT_KEY = "::context";
export const TOP_EXTRA_KEY = "::top-extra";

// focus lives inside context; scroll-state lives inside top-extra.
export const FOCUS_KEY = "focus";
export const SCROLL_STATE_KEY = "scroll-state";

export const FOCUS_PATH: Path = [["keypath", CONTEXT_KEY], ["keypath", FOCUS_KEY]];
export const SCROLL_STATE_PATH: Path = [
  ["keypath", TOP_EXTRA_KEY],
  ["keypath", SCROLL_STATE_KEY],
];

// A start-scroll drag function: from the offset delta to intents.
export type Scrollf = (delta: Vec2) => IntentList;

// What the root stores on drag start: the drag function and the
// position it started from.
export interface ScrollState {
  scrollf: Scrollf;
  mpos: Vec2;
}

function isStartScroll(intent: Intent | undefined): boolean {
  return Array.isArray(intent) && intent[0] === "start-scroll";
}

// The deepest start-scroll intent — the last one — with its position
// in the list (start_scroll_intercept).
function lastStartScroll(
  intents: IntentList,
): { readonly index: number; readonly scrollf: Scrollf } | undefined {
  for (let i = intents.length - 1; i >= 0; i--) {
    const intent = intents[i];
    if (isStartScroll(intent)) return { index: i, scrollf: intent![1] as Scrollf };
  }
  return undefined;
}

// The pure root wire (all_events_dispatched): while scroll-state is set
// a mouse-move calls the stored function with the position minus the
// stored start position and returns its intents instead of routing the
// move (scroll_drag_delta), and a mouse-up returns only the effect that
// clears scroll-state (scroll_release); otherwise the event routes
// through the view. A mouse-down that yields start-scroll intents
// stores the deepest one and its position (start_scroll_intercept),
// replaces the chosen intent by its [0, 0] call result and keeps the
// other intents' order with every start-scroll intent removed
// (start_scroll_replaced); one with no intents and a non-nil focus
// returns the effect that sets focus to nil (click_away_blurs).
export function topEventHandler(
  state: unknown,
  view: Elem,
  event: TamborEvent,
): IntentList {
  const scrollState = select(state, SCROLL_STATE_PATH) as ScrollState | null | undefined;
  if (scrollState) {
    const wired = scrollWire(scrollState, event);
    if (wired !== undefined) return wired;
  }
  const intents = dispatch(view, event);
  if (event.type === "mouse-down") {
    return mouseDownWire(state, intents, event);
  }
  return intents;
}

// While scroll-state is set a mouse-move calls the stored function with
// the position minus the stored start position and returns its intents
// instead of routing the move (scroll_drag_delta), and a mouse-up
// returns only the effect that clears scroll-state (scroll_release);
// other events fall through to the view wire (undefined).
function scrollWire(scrollState: ScrollState, event: TamborEvent): IntentList | undefined {
  if (event.type === "mouse-move") {
    const pos = event.pos ?? ([0, 0] as Vec2);
    return scrollState.scrollf([
      pos[0] - scrollState.mpos[0],
      pos[1] - scrollState.mpos[1],
    ]);
  }
  if (event.type === "mouse-up") {
    return [["set", SCROLL_STATE_PATH, null]];
  }
  return undefined;
}

// A mouse-down that yields start-scroll intents stores the deepest one
// and its position (start_scroll_intercept), replaces the chosen intent
// by its [0, 0] call result and keeps the other intents' order with
// every start-scroll intent removed (start_scroll_replaced); one with
// no intents and a non-nil focus returns the effect that sets focus to
// nil (click_away_blurs).
function mouseDownWire(state: unknown, intents: IntentList, event: TamborEvent): IntentList {
  const chosen = lastStartScroll(intents);
  if (chosen !== undefined) return replaceStartScroll(intents, chosen, event);
  if (intents.length === 0) {
    const focus = select(state, FOCUS_PATH);
    if (focus !== undefined && focus !== null) {
      // a mouse-down with no intents and a non-nil focus returns the
      // effect that sets focus to nil (click_away_blurs, focus_effect)
      return [["set", FOCUS_PATH, null]];
    }
  }
  return intents;
}

// The chosen intent is replaced in place by the result of calling its
// function with [0, 0]; every other start-scroll intent is removed. On
// drag start the root emits a set of scroll-state to function and
// position (drag_effect).
function replaceStartScroll(
  intents: IntentList,
  chosen: { readonly index: number; readonly scrollf: Scrollf },
  event: TamborEvent,
): IntentList {
  const scrollf = chosen.scrollf;
  const out: Intent[] = [];
  for (let i = 0; i < intents.length; i++) {
    if (isStartScroll(intents[i])) {
      if (i === chosen.index) out.push(...scrollf([0, 0]));
      continue;
    }
    const kept = intents[i];
    if (kept) out.push(kept);
  }
  out.push(["set", SCROLL_STATE_PATH, { scrollf, mpos: event.pos ?? ([0, 0] as Vec2) }]);
  return out;
}

// The root view always reports has-mouse-move-global as true so
// hover-out works (global_move_always): the root wraps the view in a
// mouse-move-global handler whose own result is empty, so global moves
// are delivered to every descendant and the routed intents are
// unchanged.
export function topView(view: Elem): Elem {
  return on("mouse-move-global", () => [], view);
}

export interface TopAppOptions {
  view: ViewFn;
  /** a plain initial state, passed through to make-app */
  state?: unknown;
  /** the state handler; defaults to the builtin-applying defaultHandler */
  handler?: Handler | undefined;
  /** a custom dispatch for tests, undo history or an external store */
  dispatch?: ((effect: Effect) => unknown) | undefined;
  backend?: Backend | undefined;
}

export interface TopApp {
  /** one delivered event: route → top-handle → dispatch */
  send(event: TamborEvent): void;
  /** the current root view, wrapped for the global-move capability */
  render(): Elem;
  /** the app's state */
  getState(): unknown;
}

// The top-level app: make-app against the top event handler. The root
// passes every event's intents through the handler and passes the
// resulting intents to the dispatcher (all_events_dispatched);
// make-app with no initial state starts from an empty map
// (initial_state_default).
export function makeTopApp(options: TopAppOptions): TopApp {
  const app: App = makeApp({
    view: options.view,
    // make-app with no initial state starts from an empty map
    ...(options.state !== undefined ? { state: options.state } : { state: {} }),
    ...(options.handler !== undefined ? { handler: options.handler } : {}),
    ...(options.dispatch !== undefined ? { dispatch: options.dispatch } : {}),
    ...(options.backend !== undefined ? { backend: options.backend } : {}),
  });

  return {
    send(event: TamborEvent): void {
      // the root routes the event to the (wrapped) view and passes the
      // top-handled result to the dispatcher, exactly once per event
      app.dispatch(topEventHandler(app.getState(), topView(app.view()), event));
    },
    render: () => topView(app.view()),
    getState: () => app.getState(),
  };
}
