// Purpose: executable contract tests for the ui-mobile spec's touch
//   mapping rows — touch-to-pointer mapping, hit slop, slop overlap,
//   and hover suppression on touch.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/ui-mobile/spec.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text).
//   tambor-272: redistributed from the former monolithic
//   tests/ui-mobile.test.ts — test names are byte-identical contract
//   bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  bounds,
  button,
  on,
  rectangle,
  translate,
  type ButtonNode,
  type Elem,
  type HandlerNode,
  type Node,
  type Vec2,
} from "../src/views/model.ts";
import type { EventElem } from "../src/events/bubble.ts";
import { dispatch } from "../src/events/dispatch.ts";
import {
  mouseDown,
  mouseMove,
  type PointerMoment,
} from "../src/events/event.ts";
import { render, type ComponentCall } from "../src/model/component.ts";
import { makeHeadlessApp, type HeadlessApp } from "../src/app/app.ts";
import { select, type Path } from "../src/effects/paths.ts";
import { button as hoverButton } from "../src/components/hover/hover.ts";
import { counter } from "../src/views/counter.ts";

// The ui-mobile layer under test (src/ui/).
import {
  mapTouchDown,
  mapTouchMove,
  touchTap,
} from "../src/ui/touch.ts";
import { slopDispatch, touchTargets } from "../src/ui/slop.ts";
import { findAll } from "./helpers/scan.ts";
import { todoItem } from "../src/ui/fixture_todo.ts";

const ROOT_EXTRA: Path = [["keypath", "::extra"]];

// A components-hover button wired against the root ::extra scratch, as
// in tests/components-hover.test.ts: the view re-binds the call on every
// render so hover? edits land in the app state.
function hoverWired(text: string): { app: HeadlessApp; $hover: Path } {
  const probe: ComponentCall = hoverButton(text, () => []);
  const $hover = probe.props["$hover?"] as Path;
  const app = makeHeadlessApp({
    view: (s) => {
      const root = (s ?? {}) as Record<string, unknown>;
      const callsite = {
        extra: (root["::extra"] as Record<string, unknown>) ?? {},
        $extra: ROOT_EXTRA,
      };
      return render(hoverButton(text, () => [], callsite)) as Elem;
    },
    state: {},
  });
  return { app, $hover };
}

function viewOf(app: HeadlessApp): EventElem {
  return app.render() as EventElem;
}

// ---------------------------------------------------------------------------
// p_touch_map — touch_maps_to_pointer
// ---------------------------------------------------------------------------

// p_touch_map — derives_from: ui.mobile.touch_maps_to_pointer
// generator: a tap on the more button
// predicate: the same effect as a mouse click is returned
it("p_touch_map: the same effect as a mouse click is returned", () => {
  const NUM_PATH: Path = [["keypath", "num"]];
  const view = (): EventElem => {
    const rows = counter(10);
    const btn = rows[0] as ButtonNode;
    return [button(btn.text, () => [["counter-increment", NUM_PATH]]), rows[1]];
  };
  // The spec's example: a tap on the more button.
  const btn = (view() as readonly unknown[])[0] as ButtonNode;
  const [w, h] = bounds(btn);
  const at: Vec2 = [Math.floor(w / 2), Math.floor(h / 2)];
  const down: PointerMoment = { pos: at, time: 0 };
  const up: PointerMoment = { pos: at, time: 100 };
  const touchEvents = touchTap(down, up);
  expect(touchEvents).toHaveLength(2);
  expect(touchEvents[0]!.type).toBe("mouse-down");
  expect(touchEvents[0]!.pos).toEqual(at);
  const fromTouch = slopDispatch(view(), touchEvents[0]!);
  const fromMouse = dispatch(view(), mouseDown(at));
  expect(fromTouch).toEqual(fromMouse);
  expect(fromTouch).toEqual([["counter-increment", NUM_PATH]]);

  // Generalized property: for every tap point inside the drawn bounds,
  // the mapped touch tap returns exactly what a mouse click returns.
  fc.assert(
    fc.property(fc.nat(Math.max(0, w - 1)), fc.nat(Math.max(0, h - 1)), (x, y) => {
      const p: Vec2 = [x, y];
      const events = touchTap({ pos: p, time: 0 }, { pos: p, time: 50 });
      expect(slopDispatch(view(), events[0]!)).toEqual(dispatch(view(), mouseDown(p)));
    }),
  );
});

// ---------------------------------------------------------------------------
// p_slop — hit_slop
// ---------------------------------------------------------------------------

// p_slop — derives_from: ui.mobile.hit_slop
// generator: todo delete X with a touch 15 px right of its centre
// predicate: the delete effect fires while drawn bounds stay 10 by 10
it("p_slop: the delete effect fires while drawn bounds stay 10 by 10", () => {
  const TODO_PATH: Path = [["keypath", "todos"], ["keypath", "0"]];
  const row = todoItem({ description: "second" }, TODO_PATH) as EventElem;
  // The delete X is the row's first interactive target (leftmost
  // mouse-down handler in scan order).
  const targets = touchTargets(row).filter((t) => t.node.type === "handler");
  expect(targets.length).toBeGreaterThan(0);
  const x = targets.reduce((a, b) => (b.origin[0] < a.origin[0] ? b : a));
  const [xw, xh] = bounds((x.node as HandlerNode).drawables[0] as Node);
  const cx = x.origin[0] + xw / 2;
  const cy = x.origin[1] + xh / 2;
  // 15 px right of the centre: outside the 10 by 10 drawn bounds.
  const touch = mapTouchDown([cx + 15, cy]);
  expect(slopDispatch(row, touch)).toEqual([["delete", TODO_PATH]]);
  // The drawn bounds stay 10 by 10 — no padded node entered the view.
  expect(bounds((x.node as HandlerNode).drawables[0] as Node)).toEqual([10, 10]);
  expect(xw).toBe(10);
  expect(xh).toBe(10);

  // Generalized property: every touch inside the 44 by 44 slop region
  // centred on the X fires the delete effect; drawn bounds never grow.
  fc.assert(
    fc.property(
      fc.integer({ min: -20, max: 20 }),
      fc.integer({ min: -20, max: 20 }),
      (dx, dy) => {
        const intents = slopDispatch(row, mapTouchDown([cx + dx, cy + dy]));
        expect(intents).toEqual([["delete", TODO_PATH]]);
      },
    ),
  );
  // Far outside every slop region no target is hit.
  expect(slopDispatch(row, mapTouchDown([cx, cy + 40]))).toEqual([]);
});

// ---------------------------------------------------------------------------
// p_overlap — slop_resolves_overlap
// ---------------------------------------------------------------------------

// p_overlap — derives_from: ui.mobile.slop_resolves_overlap
// generator: two 20 px targets 10 px apart
// predicate: a touch between them picks the nearer centre
it("p_overlap: a touch between them picks the nearer centre", () => {
  const left = on("mouse-down", () => [["left"]], rectangle(20, 20));
  const right = on("mouse-down", () => [["right"]], rectangle(20, 20));
  const tree: EventElem = [translate(0, 0, left), translate(30, 0, right)];
  // Both slop regions contain the gap; the nearer centre wins.
  fc.assert(
    fc.property(
      fc.integer({ min: 19, max: 31 }).filter((x) => x !== 25),
      (x) => {
        const intents = slopDispatch(tree, mapTouchDown([x, 10]));
        expect(intents).toEqual([[x < 25 ? "left" : "right"]]);
      },
    ),
  );
  // The exact midpoint is a documented tie: the first target in tree
  // order wins, deterministically.
  expect(slopDispatch(tree, mapTouchDown([25, 10]))).toEqual([["left"]]);
});

// ---------------------------------------------------------------------------
// p_no_hover — hover_off_on_touch
// ---------------------------------------------------------------------------

// p_no_hover — derives_from: ui.mobile.hover_off_on_touch
// generator: touch moves over a button
// predicate: hover? is never set
it("p_no_hover: hover? is never set", () => {
  const { app, $hover } = hoverWired("tap me");
  const btn = findAll(viewOf(app), "button")[0] as ButtonNode;
  const [w, h] = bounds(btn);
  // Touch moves over the button never set hover?.
  fc.assert(
    fc.property(
      fc.nat(Math.max(0, w)),
      fc.nat(Math.max(0, h + 2)),
      (x, y) => {
        app.send(mapTouchMove([x, y]));
        expect(select(app.getState(), $hover)).not.toBe(true);
      },
    ),
  );
  // Contrasting case: a mouse move does set it — the assertion above
  // is not vacuous.
  app.send(mouseMove([0, 0]));
  expect(select(app.getState(), $hover)).toBe(true);
  // And the mapped touch event carries the touch pointer type, which
  // is what keeps the hover machinery off.
  expect(mapTouchMove([0, 0]).pointerType).toBe("touch");
});
