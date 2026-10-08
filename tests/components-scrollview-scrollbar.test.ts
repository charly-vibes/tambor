// Purpose: executable contract tests for the components-scrollview spec —
//   the scrollbars (bars_conditional, thumb_geometry, bar_drag,
//   div0_safe).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-scrollview.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text).
//   No vacuous predicates: every check encodes its row's stated behavior,
//   with the contrasting in-range case asserted where the row implies it.
//   Shared harness helpers live in tests/helpers/scrollview.ts; the
//   scrollbar scan below keeps every walker at cyclomatic ≤ 3 by
//   pushing each decision into its own small named function
//   (tambor-272 redistributed the former monolithic
//   tests/components-scrollview.test.ts into topic files).

import { expect, it } from "vitest";
import fc from "fast-check";

import { barScrollf, thumbRange } from "../src/components/scrollview/scrollbar.ts";
import { clampScalar, div0, scrollMax } from "../src/components/scrollview/geometry.ts";
import { rectangle, type HandlerNode, type RoundedRectangle, type TranslateNode, type Vec2 } from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import { setPath, type Path } from "../src/effects/paths.ts";
import type { EventElem } from "../src/events/bubble.ts";
import { OFFSET_PATH, isNode, svCall, svView, walk } from "./helpers/scrollview.ts";

// The scrollbars of a view: a mouse-down handler node behind a
// translate, carrying a 7-thick track rectangle. The axis follows the
// track shape.
interface FoundBar {
  readonly axis: "x" | "y";
  readonly x: number;
  readonly y: number;
  readonly handler: HandlerNode;
}

// The mouse-down handler behind a translate, when that is one.
function handlerIn(t: TranslateNode): HandlerNode | undefined {
  const inner = t.drawable as EventElem;
  if (!isNode(inner) || inner.type !== "handler") return undefined;
  return inner as HandlerNode;
}

// The track rectangle behind a mouse-down handler, when that is one.
function trackOf(handler: HandlerNode): { width: number; height: number } | undefined {
  const track = handler.drawables[0] as EventElem;
  if (!isNode(track) || track.type !== "rectangle") return undefined;
  return track as { width: number; height: number };
}

// The bar axis follows the track shape: taller than wide is vertical.
function axisOf(rect: { width: number; height: number }): "x" | "y" {
  return rect.width <= rect.height ? "y" : "x";
}

function barOf(t: TranslateNode): FoundBar | undefined {
  const handler = handlerIn(t);
  if (handler == null) return undefined;
  const rect = trackOf(handler);
  if (rect == null) return undefined;
  return { axis: axisOf(rect), x: t.x, y: t.y, handler };
}

function barsOf(view: EventElem): readonly FoundBar[] {
  return walk(view)
    .filter((n): n is TranslateNode => n != null && "drawable" in n)
    .map(barOf)
    .filter((b): b is FoundBar => b != null);
}

// p_bars — derives_from: components.scrollview.bars_conditional
// generator: content larger on one axis only
// predicate: exactly one bar is present at the right place
it("p_bars: content larger on one axis only → exactly one bar at the right place", () => {
  const viewport: Vec2 = [200, 200];
  // taller than the viewport: the vertical bar, at x = width
  const tall = barsOf(svView({ viewport, body: rectangle(50, 500) }));
  expect(tall.length).toBe(1);
  expect(tall[0]!.axis).toBe("y");
  expect(tall[0]!.x).toBe(200);
  expect(tall[0]!.y).toBe(0);
  // wider than the viewport: the horizontal bar, at y = height
  const wide = barsOf(svView({ viewport, body: rectangle(500, 50) }));
  expect(wide.length).toBe(1);
  expect(wide[0]!.axis).toBe("x");
  expect(wide[0]!.x).toBe(0);
  expect(wide[0]!.y).toBe(200);
  // content fits both axes: no bars
  expect(barsOf(svView({ viewport, body: rectangle(150, 150) }))).toEqual([]);
  // generalized: every tall-only shape keeps exactly the vertical bar
  fc.assert(
    fc.property(fc.nat(200), fc.integer({ min: 201, max: 600 }), (cw, ch) => {
      const found = barsOf(svView({ viewport, body: rectangle(cw, ch) }));
      expect(found.length).toBe(1);
      expect(found[0]!.axis).toBe("y");
      expect(found[0]!.x).toBe(200);
    }),
  );
});

// p_thumb — derives_from: components.scrollview.thumb_geometry
// generator: total 500 view 200 offset 100
// predicate: thumb spans 0.2 to 0.6 of the track
it("p_thumb: total 500 view 200 offset 100 → thumb spans 0.2 to 0.6 of the track", () => {
  expect(thumbRange(100, 200, 500)).toEqual([0.2, 0.6]);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 299 }), (offset) => {
      const [s, e] = thumbRange(offset, 200, 500);
      expect(s).toBeCloseTo(offset / 500, 12);
      expect(e).toBeCloseTo((offset + 200) / 500, 12);
    }),
  );
  // the drawn thumb: thickness 7, rounded ends, at its track fraction
  const view = svView({ offset: [0, 100], viewport: [200, 200], body: rectangle(50, 500) });
  const bar = barsOf(view)[0]!;
  const thumbWrap = bar.handler.drawables[1] as TranslateNode;
  expect(thumbWrap.y).toBeCloseTo(0.2 * 200, 9);
  const thumb = thumbWrap.drawable as RoundedRectangle;
  expect(thumb.type).toBe("rounded-rectangle");
  expect(thumb.width).toBe(7);
  expect(thumb.radius).toBe(3.5);
  expect(thumb.height).toBeCloseTo((0.6 - 0.2) * 200, 9);
});

// p_bar_drag — derives_from: components.scrollview.bar_drag
// generator: press then delta
// predicate: the function returns the set offset effect
it("p_bar_drag: press then delta → the function returns the set offset effect", () => {
  const viewport: Vec2 = [200, 200];
  const body = rectangle(50, 500);
  const view = svView({ viewport, body });
  // press on the vertical bar (x = 200..207): local track y = 100
  const intents = dispatch(view, mouseDown([203, 100]));
  expect(intents.length).toBe(1);
  expect(intents[0]![0]).toBe("start-scroll");
  const scrollf = intents[0]![1] as (delta: Vec2) => readonly unknown[];
  // the drag maps the pointer delta to the set offset effect:
  // offset = clamp(div0(position, viewport) * max)
  const expectedPath = svCall({ viewport, body }).props.$offset;
  expect(scrollf([0, 100])).toEqual([["set", expectedPath, [0, 300]]]);
  expect(scrollf([0, 0])).toEqual([["set", expectedPath, [0, 150]]]);
  // the set effect applies to the state as the dispatcher would
  const eff = scrollf([0, 100])[0]! as readonly unknown[];
  expect(setPath({ offset: [0, 0] }, eff[1] as Path, eff[2])).toEqual({ offset: [0, 300] });
  // generalized: the mapped offset is clamp(div0(position, viewport) * max)
  fc.assert(
    fc.property(fc.nat(300), fc.integer({ min: -300, max: 300 }), (pressY, dy) => {
      const f = barScrollf({
        axis: "y",
        press: [3, pressY],
        viewport: [200, 200],
        max: [0, 300],
        offset: [0, 0],
        $offset: OFFSET_PATH,
      });
      const effect = f([0, dy])[0] as readonly unknown[];
      expect(effect[0]).toBe("set");
      const value = effect[2] as Vec2;
      expect(value[0]).toBe(0);
      expect(value[1]).toBe(clampScalar(((pressY + dy) / 200) * 300, 300));
    }),
  );
});

// p_div0 — derives_from: components.scrollview.div0_safe
// generator: viewport 0
// predicate: offset is 0 and finite
it("p_div0: viewport 0 → offset is 0 and finite", () => {
  expect(div0(5, 0)).toBe(0);
  expect(div0(0, 0)).toBe(0);
  const f = barScrollf({
    axis: "y",
    press: [3, 123],
    viewport: [0, 0],
    max: scrollMax([500, 100], [0, 0]),
    offset: [0, 0],
    $offset: OFFSET_PATH,
  });
  const effect = f([0, 0])[0] as readonly unknown[];
  expect(effect[0]).toBe("set");
  const value = effect[2] as Vec2;
  expect(Number.isFinite(value[0]) && Number.isFinite(value[1])).toBe(true);
  expect(value[1]).toBe(0);
  fc.assert(
    fc.property(fc.nat(500), fc.integer({ min: -100, max: 100 }), (pressY, dy) => {
      const g = barScrollf({
        axis: "y",
        press: [3, pressY],
        viewport: [0, 0],
        max: [500, 100],
        offset: [0, 0],
        $offset: OFFSET_PATH,
      });
      const v = (g([0, dy])[0] as readonly unknown[])[2] as Vec2;
      expect(Number.isFinite(v[1])).toBe(true);
      expect(v[1]).toBe(0);
    }),
  );
});
