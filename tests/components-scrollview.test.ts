// Purpose: executable contract tests for the components-scrollview spec —
//   the clipped, scrollable content container with wheel, touch and
//   scrollbar-drag scrolling.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-scrollview.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text).
//   No vacuous predicates: every check encodes its row's stated behavior,
//   with the contrasting in-range case asserted where the row implies it.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  dragScrollf,
  momentumFrames,
  scrollview,
  wheelIntents,
} from "../src/components/scrollview/scrollview.ts";
import { clampScalar, div0, scrollMax } from "../src/components/scrollview/geometry.ts";
import { barScrollf, thumbRange } from "../src/components/scrollview/scrollbar.ts";
import { call, render, type ComponentCall } from "../src/model/component.ts";
import {
  label,
  on,
  rectangle,
  translate,
  type Elem,
  type HandlerNode,
  type RoundedRectangle,
  type TranslateNode,
  type Vec2,
} from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown, scroll } from "../src/events/event.ts";
import type { EventElem } from "../src/events/bubble.ts";
import { setPath, updatePath, type Path } from "../src/effects/paths.ts";

// The offset path a scrollview call carries for its defaulted offset
// prop; wheel and drag updates address the stored offset through it.
const OFFSET_PATH: Path = [["keypath", "offset"]];

// A scrollview call rendered to its view tree.
// An explicit $offset keeps the intents addressable at the plain
// offset path of the test state; the defaulted call's own scratch path
// is the component model's concern (component.model, C0).
function svView(opts: { offset?: Vec2; viewport: Vec2; body: Elem }): EventElem {
  return render(svCall(opts)) as EventElem;
}

function svCall(opts: { offset?: Vec2; viewport: Vec2; body: Elem }): ComponentCall {
  return call(scrollview, {
    "scroll-bounds": opts.viewport,
    body: opts.body,
    $offset: OFFSET_PATH,
    ...(opts.offset !== undefined ? { offset: opts.offset } : {}),
  });
}

// Array.isArray does not narrow readonly arrays over the event-layer
// union (same shape as dispatch.ts's local helper).
function isGroupElem(
  e: EventElem | readonly EventElem[],
): e is readonly EventElem[] {
  return Array.isArray(e);
}

// Every node of an event-layer tree, depth first.
function walk(e: EventElem): readonly EventElem[] {
  if (e == null) return [];
  if (isGroupElem(e)) return e.flatMap(walk);
  const kids: readonly EventElem[] =
    "drawable" in e
      ? [e.drawable as EventElem]
      : "drawables" in e
        ? (e.drawables as readonly EventElem[])
        : [];
  return [e, ...kids.flatMap(walk)];
}

// The translate node that carries the body (content_translated).
function findTranslate(view: EventElem, body: Elem): TranslateNode | undefined {
  return walk(view).find(
    (n) => n != null && "drawable" in n && n.drawable === body,
  ) as TranslateNode | undefined;
}

// The scrollbars of a view: a mouse-down handler node behind a
// translate, carrying a 7-thick track rectangle. The axis follows the
// track shape.
interface FoundBar {
  readonly axis: "x" | "y";
  readonly x: number;
  readonly y: number;
  readonly handler: HandlerNode;
}

function barsOf(view: EventElem): readonly FoundBar[] {
  const out: FoundBar[] = [];
  for (const n of walk(view)) {
    if (n == null || !("drawable" in n)) continue;
    const t = n as TranslateNode;
    const inner = t.drawable as EventElem;
    if (inner == null || isGroupElem(inner) || inner.type !== "handler") continue;
    const handler = inner as HandlerNode;
    if (handler.eventType !== "mouse-down") continue;
    const track = handler.drawables[0] as EventElem;
    if (track == null || isGroupElem(track) || track.type !== "rectangle") continue;
    const rect = track as { width: number; height: number };
    out.push({
      axis: rect.width <= rect.height ? "y" : "x",
      x: t.x,
      y: t.y,
      handler,
    });
  }
  return out;
}

// Apply an update intent to a state holding offset, as the dispatcher
// would (the intent is data: [type, path, fn]).
function applyUpdate(
  intents: readonly unknown[],
  state: { offset: Vec2 },
): { offset: Vec2 } {
  const eff = intents[0] as readonly unknown[];
  expect(eff[0]).toBe("update");
  return updatePath(state, eff[1] as Path, eff[2] as (old: unknown) => unknown) as {
    offset: Vec2;
  };
}

const viewportArb = fc.tuple(fc.nat(400), fc.nat(400));
const bodyArb = fc.tuple(fc.nat(400), fc.nat(400)).map(([w, h]) => rectangle(w, h));
const offsetArb = fc.tuple(fc.integer({ min: -200, max: 200 }), fc.integer({ min: -200, max: 200 }));

// p_default — derives_from: components.scrollview.default_offset
// generator: no offset prop
// predicate: offset equals [0, 0]
it("p_default: no offset prop → offset equals [0, 0]", () => {
  expect(
    call(scrollview, { "scroll-bounds": [200, 200], body: label("hi") }).props.offset,
  ).toEqual([0, 0]);
  fc.assert(
    fc.property(viewportArb, bodyArb, (viewport, body) => {
      expect(
        call(scrollview, { "scroll-bounds": viewport, body }).props.offset,
      ).toEqual([0, 0]);
    }),
  );
});

// p_translate — derives_from: components.scrollview.content_translated
// generator: random offsets
// predicate: body origin equals the negated offset
it("p_translate: random offsets → body origin equals the negated offset", () => {
  fc.assert(
    fc.property(offsetArb, viewportArb, bodyArb, (offset, viewport, body) => {
      const t = findTranslate(svView({ offset, viewport, body }), body);
      expect(t).toBeDefined();
      expect(t!.x).toBe(-offset[0]);
      expect(t!.y).toBe(-offset[1]);
    }),
  );
});

// p_range — derives_from: components.scrollview.range_formula
// generator: viewport 200 over content 500 and 100
// predicate: max offset is 300 and 0
it("p_range: viewport 200 over content 500 and 100 → max offset is 300 and 0", () => {
  expect(scrollMax([500, 100], [200, 200])).toEqual([300, 0]);
  // the range_formula law holds for every total and viewport
  fc.assert(
    fc.property(fc.tuple(fc.nat(600), fc.nat(600)), viewportArb, (total, viewport) => {
      expect(scrollMax(total, viewport)).toEqual([
        Math.max(0, total[0] - viewport[0]),
        Math.max(0, total[1] - viewport[1]),
      ]);
    }),
  );
  // clamp(v) is max(0, min(max, v))
  fc.assert(
    fc.property(fc.integer({ min: -10, max: 500 }), fc.nat(500), (v, max) => {
      expect(clampScalar(v, max)).toBe(Math.max(0, Math.min(max, v)));
    }),
  );
});

// p_wheel_child — derives_from: components.scrollview.wheel_defers_to_children
// generator: a child that handles scroll
// predicate: the child's intents are returned
it("p_wheel_child: a child that handles scroll → the child's intents are returned", () => {
  const body = on("scroll", () => [["child-scroll"]], rectangle(300, 300));
  const view = svView({ viewport: [200, 200], body });
  expect(dispatch(view, scroll([10, 10]))).toEqual([["child-scroll"]]);
});

// p_wheel — derives_from: components.scrollview.wheel_updates_offset
// generator: offset 0 and delta 50, offset at max and delta 50
// predicate: first updates to 50, second returns nothing
it("p_wheel: offset 0 and delta 50 updates to 50, offset at max and delta 50 returns nothing", () => {
  const total: Vec2 = [500, 100];
  const viewport: Vec2 = [200, 200];
  const first = wheelIntents([0, 0], [50, 0], total, viewport, OFFSET_PATH);
  expect(first.length).toBe(1);
  expect(applyUpdate(first, { offset: [0, 0] })).toEqual({ offset: [50, 0] });
  // offset at max: the clamped new offset is unchanged → nothing
  expect(wheelIntents([300, 0], [50, 0], total, viewport, OFFSET_PATH)).toEqual([]);
  // generalized: the update always sets both axes to clamp(old + delta)
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 100 })),
      fc.tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 })),
      (offset, delta) => {
        const intents = wheelIntents(offset, delta, total, viewport, OFFSET_PATH);
        const next: Vec2 = [
          clampScalar(offset[0] + delta[0], 300),
          clampScalar(offset[1] + delta[1], 0),
        ];
        if (next[0] === offset[0] && next[1] === offset[1]) {
          expect(intents).toEqual([]);
        } else {
          expect(intents.length).toBe(1);
          expect(applyUpdate(intents, { offset })).toEqual({ offset: next });
        }
      },
    ),
  );
});

// p_stale — derives_from: components.scrollview.stale_offset_snaps
// generator: stored offset above max then a small scroll
// predicate: render keeps it, the update clamps it
it("p_stale: stored offset above max → render keeps it, the update clamps it", () => {
  const body = rectangle(500, 500);
  const viewport: Vec2 = [200, 200];
  const t = findTranslate(svView({ offset: [1000, 5], viewport, body }), body);
  expect(t).toBeDefined();
  expect(t!.x).toBe(-1000); // render keeps the stale offset
  expect(t!.y).toBe(-5);
  const intents = wheelIntents([1000, 5], [0, 10], [500, 500], viewport, OFFSET_PATH);
  expect(intents.length).toBe(1);
  // the update clamps against the stored value: x snaps back to max,
  // y moves by the delta
  expect(applyUpdate(intents, { offset: [1000, 5] })).toEqual({ offset: [300, 15] });
});

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

// p_clip — derives_from: components.scrollview.clip_events
// generator: pointer outside the viewport over clipped content
// predicate: no intents
it("p_clip: pointer outside the viewport over clipped content → no intents", () => {
  const body: Elem = [
    on("mouse-down", () => [["near"]], rectangle(150, 150)),
    translate(0, 300, on("mouse-down", () => [["far"]], rectangle(150, 150))),
  ];
  const view = svView({ viewport: [200, 200], body });
  // inside the viewport the content is routed normally
  expect(dispatch(view, mouseDown([10, 10]))).toEqual([["near"]]);
  // outside the viewport the clipped content receives nothing
  expect(dispatch(view, mouseDown([10, 350]))).toEqual([]);
  fc.assert(
    fc.property(
      fc
        .tuple(fc.integer({ min: -100, max: 400 }), fc.integer({ min: -100, max: 400 }))
        // the vertical bar sits outside the viewport too; the row is
        // about clipped *content*, so the bar region is excluded
        .filter(
          ([x, y]) =>
            (x < 0 || x >= 200 || y < 0 || y >= 200) &&
            !(x >= 200 && x < 207 && y >= 0 && y < 200),
        ),
      (pos) => {
        expect(dispatch(view, mouseDown(pos))).toEqual([]);
      },
    ),
  );
});

// p_touch_scroll — derives_from: components.scrollview.touch_drag_scrolls
// generator: touch drag of 30 px
// predicate: offset changes by 30 within range
it("p_touch_scroll: touch drag of 30 px → offset changes by 30 within range", () => {
  const f = dragScrollf([50, 50], [500, 500], [200, 200], OFFSET_PATH);
  const intents = f([0, 30]);
  expect(intents.length).toBe(1);
  expect(applyUpdate(intents, { offset: [50, 50] })).toEqual({ offset: [50, 80] });
  // generalized: the drag delta is applied within the range
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 300 })),
      fc.tuple(fc.integer({ min: -60, max: 60 }), fc.integer({ min: -60, max: 60 })),
      (offset, delta) => {
        const g = dragScrollf(offset, [500, 500], [200, 200], OFFSET_PATH);
        const applied = applyUpdate(g(delta), { offset });
        expect(applied).toEqual({
          offset: [
            clampScalar(offset[0] + delta[0], 300),
            clampScalar(offset[1] + delta[1], 300),
          ],
        });
      },
    ),
  );
});

// p_momentum — derives_from: components.scrollview.momentum
// generator: flick then rest
// predicate: offset keeps changing then settles, and is static under reduced motion
it("p_momentum: flick then rest → offset keeps changing then settles, static under reduced motion", () => {
  const frames = momentumFrames([0, 0], [0, 40], [500, 500], [200, 200], false);
  // keeps changing
  expect(frames.length).toBeGreaterThanOrEqual(2);
  let prev: Vec2 = [0, 0];
  for (const f of frames) {
    expect(f[0]).toBeGreaterThanOrEqual(0);
    expect(f[0]).toBeLessThanOrEqual(300);
    expect(f[1]).toBeGreaterThanOrEqual(0);
    expect(f[1]).toBeLessThanOrEqual(300);
    expect(f).not.toEqual(prev);
    prev = f;
  }
  // settles at the range end
  expect(frames[frames.length - 1]).toEqual([0, 300]);
  // static under reduced motion
  expect(momentumFrames([0, 0], [0, 40], [500, 500], [200, 200], true)).toEqual([]);
  // a gentle flick settles by decay, not by hitting the end
  const decayed = momentumFrames([0, 0], [0, 0.5], [100000, 100000], [200, 200], false);
  expect(decayed.length).toBeGreaterThanOrEqual(2);
  expect(decayed.length).toBeLessThan(600);
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 300 })),
      fc.tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 })),
      (start, velocity) => {
        const fs = momentumFrames(start, velocity, [500, 500], [200, 200], false);
        let p: Vec2 = start;
        for (const f of fs) {
          expect(f[0]).toBeGreaterThanOrEqual(0);
          expect(f[0]).toBeLessThanOrEqual(300);
          expect(f[1]).toBeGreaterThanOrEqual(0);
          expect(f[1]).toBeLessThanOrEqual(300);
          expect(f).not.toEqual(p);
          p = f;
        }
      },
    ),
  );
});
