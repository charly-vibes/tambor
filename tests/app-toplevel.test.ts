// Purpose: executable contract tests for the app-toplevel spec — the
//   top-level event handler that routes every delivered event through
//   the view, passes the resulting intents to the dispatcher, manages
//   drag-scrolling and clears focus on a click that hits nothing.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/app-toplevel.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every check encodes its row's stated
//   behavior. The reserved namespaces use the "::" prefix — the port of
//   Clojure's namespaced keywords, the same encoding component-model
//   already landed for the root ::extra/::context scratch.

import { beforeAll, expect, it, vitest } from "vitest";
import fc from "fast-check";

import {
  CONTEXT_KEY,
  EXTRA_KEY,
  FOCUS_PATH,
  SCROLL_STATE_PATH,
  TOP_EXTRA_KEY,
  makeTopApp,
  type ScrollState,
  type Scrollf,
  type TopApp,
} from "../src/app/top.ts";
import { defaultHandler, type Effect } from "../src/effects/dispatch.ts";
import { select, type Path } from "../src/effects/paths.ts";
import { hasMouseMoveGlobal } from "../src/events/dispatch.ts";
import {
  clipboard,
  drop,
  keyEvent,
  keyPress,
  mouseDown,
  mouseEnterGlobal,
  mouseMove,
  mouseMoveGlobal,
  mouseUp,
  scroll,
  type TamborEvent,
} from "../src/events/event.ts";
import { label, on, spacer, type Elem, type Vec2 } from "../src/views/model.ts";
import { verticalScrollbar } from "../src/components/scrollview/scrollbar.ts";

// tap> logs unknown effect types; keep the test output clean.
beforeAll(() => {
  vitest.spyOn(console, "log").mockImplementation(() => {});
});

// A one-intent view node for an event kind: the handler fires inside a
// 100x100 body and returns a marker intent naming its kind.
function probeView(kind: string): Elem {
  return on(kind, () => [["probe", kind]], spacer(100, 100));
}

// An app whose handler records every applied effect and then applies
// the builtins, so the state flows like the real wiring: the handler is
// the dispatcher's target, and set effects land in the state.
function spyApp(
  view: Elem,
  state?: unknown,
): { app: TopApp; effects: Effect[] } {
  const effects: Effect[] = [];
  const app = makeTopApp({
    view: () => view,
    ...(state !== undefined ? { state } : {}),
    handler: (s, batch, ctx) => {
      effects.push(...batch);
      return defaultHandler(s, batch, ctx);
    },
  });
  return { app, effects };
}

// Deep path equality for effect assertions.
function pathEq(a: unknown, b: Path): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// p_all_dispatched — derives_from: app.toplevel.all_events_dispatched
// generator: scripted events of each type
// predicate: the handler is called once per event
it("p_all_dispatched: the handler is called once per event", () => {
  // move, mouse event, drop, scroll, key event, key press, global
  // move, enter, clipboard — every kind the backend delivers to the root
  const scripted: readonly [string, TamborEvent][] = [
    ["mouse-move", mouseMove([5, 5])],
    ["mouse-down", mouseDown([5, 5])],
    ["mouse-up", mouseUp([5, 5])],
    ["drop", drop([5, 5])],
    ["scroll", scroll([5, 5])],
    ["key-event", keyEvent("a")],
    ["key-press", keyPress("a")],
    ["mouse-move-global", mouseMoveGlobal([5, 5])],
    ["mouse-enter-global", mouseEnterGlobal([5, 5])],
    ["clipboard", clipboard("data")],
  ];
  for (const [kind, event] of scripted) {
    const { app, effects } = spyApp(probeView(kind));
    app.send(event);
    // routed exactly once: the routed result is the handler's only batch
    expect(effects).toEqual([["probe", kind]]);
  }
});

// p_global_move — derives_from: app.toplevel.global_move_always
// generator: a view with no hover
// predicate: has-mouse-move-global is true
it("p_global_move: has-mouse-move-global is true", () => {
  // a view with no hover: a plain label reports false on its own
  const bare = label("hi");
  expect(hasMouseMoveGlobal(bare)).toBe(false);
  const { app } = spyApp(bare);
  // the root always reports it true, so hover-out works
  expect(hasMouseMoveGlobal(app.render())).toBe(true);
});

// p_start_scroll — derives_from: app.toplevel.start_scroll_intercept
// generator: two nested start-scroll intents
// predicate: scroll-state holds the last one and the position
it("p_start_scroll: scroll-state holds the last one and the position", () => {
  fc.assert(
    fc.property(fc.nat(99), fc.nat(99), (x, y) => {
      const pos: Vec2 = [x, y];
      const f1: Scrollf = () => [["f1"]];
      const f2: Scrollf = () => [["f2"]];
      // two nested start-scroll intents on one mouse-down
      const { app } = spyApp(
        on(
          "mouse-down",
          () => [["start-scroll", f1], ["start-scroll", f2]],
          spacer(100, 100),
        ),
      );
      app.send(mouseDown(pos));
      // the deepest start-scroll intent — the last one — wins, and the
      // stored position is the event position
      const scrollState = select(app.getState(), SCROLL_STATE_PATH) as ScrollState;
      expect(scrollState.scrollf).toBe(f2);
      expect(scrollState.mpos).toEqual(pos);
    }),
  );
});

// p_start_replaced — derives_from: app.toplevel.start_scroll_replaced
// generator: start-scroll amid other intents
// predicate: order is kept and no start-scroll intent survives
it("p_start_replaced: order is kept and no start-scroll intent survives", () => {
  const f1: Scrollf = () => [["r1"]];
  const f2: Scrollf = () => [["r2a"], ["r2b"]];
  // start-scroll amid other intents; the deepest (last) one is chosen
  const { app, effects } = spyApp(
    on(
      "mouse-down",
      () => [
        ["mark", 1],
        ["start-scroll", f1],
        ["mark", 2],
        ["start-scroll", f2],
        ["mark", 3],
      ],
      spacer(100, 100),
    ),
  );
  app.send(mouseDown([7, 3]));
  // the marks keep their order, every start-scroll intent is gone, the
  // chosen one is replaced in place by its [0, 0] call result, and the
  // set scroll-state effect rides last
  expect(effects).toEqual([
    ["mark", 1],
    ["mark", 2],
    ["r2a"],
    ["r2b"],
    ["mark", 3],
    ["set", SCROLL_STATE_PATH, { scrollf: f2, mpos: [7, 3] }],
  ]);
});

// p_scroll_drag — derives_from: app.toplevel.scroll_drag_delta
// generator: move from [0, 0] to [3, 7]
// predicate: the function receives [3, 7]
it("p_scroll_drag: the function receives [3, 7]", () => {
  const got: Vec2[] = [];
  const scrollf: Scrollf = (delta) => {
    got.push(delta);
    return [["dragged"]];
  };
  let routedMoves = 0;
  const view = on(
    "mouse-move",
    () => {
      routedMoves++;
      return [["routed-move"]];
    },
    on("mouse-down", () => [["start-scroll", scrollf]], spacer(100, 100)),
  );
  const { app, effects } = spyApp(view);
  // the drag start itself calls the function with [0, 0]
  app.send(mouseDown([0, 0]));
  expect(got).toEqual([[0, 0]]);
  got.length = 0;
  effects.length = 0;
  // while scroll-state is set, the move is not routed to the view: the
  // stored function receives the position minus the start position and
  // its intents are what the dispatcher sees
  app.send(mouseMove([3, 7]));
  expect(got).toEqual([[3, 7]]);
  expect(routedMoves).toBe(0);
  expect(effects).toEqual([["dragged"]]);
});

// p_scroll_release — derives_from: app.toplevel.scroll_release
// generator: mouse-up in a drag
// predicate: the only effect is set scroll-state to nil
it("p_scroll_release: the only effect is set scroll-state to nil", () => {
  const scrollf: Scrollf = () => [["never"]];
  let routedUps = 0;
  const view = on(
    "mouse-up",
    () => {
      routedUps++;
      return [["up-intent"]];
    },
    on("mouse-down", () => [["start-scroll", scrollf]], spacer(100, 100)),
  );
  const { app, effects } = spyApp(view);
  app.send(mouseDown([2, 2]));
  effects.length = 0;
  app.send(mouseUp([2, 2]));
  // the mouse-up is not routed: the only effect clears scroll-state
  expect(effects).toEqual([["set", SCROLL_STATE_PATH, null]]);
  expect(routedUps).toBe(0);
  // and the drag is over
  expect(select(app.getState(), SCROLL_STATE_PATH)).toBeNull();
});

// p_click_away — derives_from: app.toplevel.click_away_blurs
// generator: click on empty space with focus set
// predicate: the effect sets focus to nil
it("p_click_away: the effect sets focus to nil", () => {
  fc.assert(
    fc.property(
      fc.nat(9),
      fc.nat(9),
      fc.jsonValue().filter((v) => v !== null),
      (x, y, focus) => {
        // empty space: no handlers, so the mouse-down yields no intents
        const { app, effects } = spyApp(
          spacer(10, 10),
          { [CONTEXT_KEY]: { focus } },
        );
        app.send(mouseDown([x, y]));
        expect(effects).toEqual([["set", FOCUS_PATH, null]]);
        // the state's focus is nil afterwards
        expect(select(app.getState(), FOCUS_PATH)).toBeNull();
      },
    ),
  );
});

// p_focus_kept — derives_from: app.toplevel.focus_kept_on_hit
// generator: click on a handler with focus set
// predicate: focus is untouched
it("p_focus_kept: focus is untouched", () => {
  fc.assert(
    fc.property(
      fc.nat(9),
      fc.nat(9),
      fc.jsonValue().filter((v) => v !== null),
      (x, y, focus) => {
        const { app, effects } = spyApp(
          on("mouse-down", () => [["hit"]], spacer(10, 10)),
          { [CONTEXT_KEY]: { focus } },
        );
        app.send(mouseDown([x, y]));
        // the hit's intents pass through and no focus effect is emitted
        expect(effects).toEqual([["hit"]]);
        expect(select(app.getState(), FOCUS_PATH)).toEqual(focus);
      },
    ),
  );
});

// p_namespaces — derives_from: app.toplevel.state_namespaces
// generator: app state with user keys
// predicate: reserved keys never collide with user keys
it("p_namespaces: reserved keys never collide with user keys", () => {
  // the reserved namespaces are the ::-namespaced keys — the port of
  // Clojure's namespaced keywords — so an ordinary user key can never
  // collide with one
  expect([EXTRA_KEY, CONTEXT_KEY, TOP_EXTRA_KEY]).toEqual([
    "::extra",
    "::context",
    "::top-extra",
  ]);
  // user keys never start with the reserved "::" namespace
  const userKey = fc.string().filter((k) => !k.startsWith("::"));
  fc.assert(
    fc.property(fc.array(fc.tuple(userKey, fc.nat()), { maxLength: 20 }), (kvs) => {
      const user = Object.fromEntries(kvs);
      const app = makeTopApp({ view: () => spacer(0, 0), state: user });
      const st = app.getState() as Record<string, unknown>;
      // every user key survives untouched under its own key
      for (const [k, v] of Object.entries(user)) {
        expect(select(st, [["keypath", k]])).toBe(v);
      }
    }),
  );
  // the reserved namespaces hold the reserved state: a drag start puts
  // scroll-state inside ::top-extra and a click-away leaves focus
  // inside ::context, without touching user keys
  const scrollf: Scrollf = () => [];
  const user = { count: 1, name: "x" };
  const drag = spyApp(
    on("mouse-down", () => [["start-scroll", scrollf]], spacer(10, 10)),
    { ...user, [CONTEXT_KEY]: { focus: "somewhere" } },
  );
  drag.app.send(mouseDown([1, 1]));
  const st = drag.app.getState() as Record<string, unknown>;
  expect(st.count).toBe(1);
  expect(st.name).toBe("x");
  expect(select(st, SCROLL_STATE_PATH)).toEqual({ scrollf, mpos: [1, 1] });
  expect(select(st, FOCUS_PATH)).toBe("somewhere");
  // no user key collided with a reserved key: the reserved entries are
  // the only ::-prefixed keys
  expect(Object.keys(st).filter((k) => !k.startsWith("::"))).toEqual(
    Object.keys(user),
  );
});

// p_initial — derives_from: app.toplevel.initial_state_default
// generator: make-app with no state
// predicate: state equals an empty map
it("p_initial: state equals an empty map", () => {
  const { app } = spyApp(spacer(0, 0));
  expect(app.getState()).toEqual({});
});

// p_drag_effect — derives_from: app.toplevel.drag_effect
// generator: a scrollbar press
// predicate: the set scroll-state effect is emitted
it("p_drag_effect: the set scroll-state effect is emitted", () => {
  fc.assert(
    fc.property(fc.nat(6), fc.nat(99), (dx, y) => {
      // a real scrollbar: the bar sits at x = viewport width, 7 wide
      const viewport: Vec2 = [40, 100];
      const bar = verticalScrollbar({
        offset: [0, 0],
        total: [40, 200],
        viewport,
        $offset: [["keypath", "offset"]] as Path,
      });
      const { app, effects } = spyApp(bar);
      // press the bar: the mouse-down at the bar yields start-scroll
      const press: Vec2 = [viewport[0] + dx, y];
      app.send(mouseDown(press));
      // on drag start the root emits the set of scroll-state to the
      // drag function and the press position
      const emitted = effects.filter(
        (e) => e[0] === "set" && pathEq(e[1], SCROLL_STATE_PATH),
      );
      expect(emitted.length).toBe(1);
      const [type, path, value] = emitted[0]!;
      expect(type).toBe("set");
      expect(path).toEqual(SCROLL_STATE_PATH);
      const scrollState = value as ScrollState;
      expect(typeof scrollState.scrollf).toBe("function");
      expect(scrollState.mpos).toEqual(press);
    }),
  );
});

// p_focus_effect — derives_from: app.toplevel.focus_effect
// generator: click-away
// predicate: the set focus nil effect is emitted
it("p_focus_effect: the set focus nil effect is emitted", () => {
  fc.assert(
    fc.property(fc.nat(9), fc.nat(9), (x, y) => {
      const { app, effects } = spyApp(
        spacer(10, 10),
        { [CONTEXT_KEY]: { focus: ["text", 3] } },
      );
      app.send(mouseDown([x, y]));
      // on click-away the root emits the set of focus to nil
      expect(effects).toEqual([["set", FOCUS_PATH, null]]);
    }),
  );
});
