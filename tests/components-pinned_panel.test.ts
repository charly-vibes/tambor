// Purpose: executable contract tests for the components.pinned_panel spec.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-pinned_panel.md is the design authority;
//   each predicate here mirrors a Properties row (generator + predicate
//   text) of that spec. No vacuous predicates: every check encodes its
//   row's stated behavior. The ambient scrollview frame is simulated per
//   components.scrollview.content_translated (content draws translated by
//   [-ox, -oy], so screen = content − offset) — the scrollview component
//   itself belongs to another ticket; only its stated translation rule is
//   used here.

import { expect, it } from "vitest";
import fc from "fast-check";

import { pinnedPanel } from "../src/components/pinned_panel/index.ts";
import { call, render, type ComponentCall } from "../src/model/component.ts";
import {
  children,
  height as elemHeight,
  isGroup,
  origin,
  rectangle,
  width as elemWidth,
  type Elem,
  type Node,
  type Vec2,
} from "../src/views/model.ts";

// A generated activation range [start, start + len] (content-space y).
const startArb = fc.nat(400);
const lenArb = fc.nat(200);
const positiveLenArb = fc.nat(199).map((n) => n + 1);
const oxArb = fc.nat(80);
const slotArb: fc.Arbitrary<Vec2> = fc.tuple(fc.nat(80), fc.nat(400));
const offsetArb: fc.Arbitrary<Vec2> = fc.tuple(fc.nat(80), fc.nat(600));
// The authored body; rectangles keep the harness's origin arithmetic at
// [0, 0] (origin_default).
const bodyArb: fc.Arbitrary<Elem> = fc
  .tuple(fc.nat(60), fc.nat(200))
  .map(([w, h]) => rectangle(w, h));

interface PanelInput {
  readonly range: Vec2;
  readonly body: Elem;
  /** content position of the panel's normal-flow slot (the enclosing layout's placement) */
  readonly slot: Vec2;
  /** ambient scrollview offset, i.e. context.scroll */
  readonly offset: Vec2;
}

interface Observation {
  readonly output: Elem;
  /** local placement of the body part within the panel's output */
  readonly placement: Vec2;
  /** the body's top-left in screen coordinates (content − ambient offset) */
  readonly bodyScreen: Vec2;
  /** the body is drawn on the pinned branch */
  readonly pinned: boolean;
}

function panelCall(args: Record<string, unknown>, scroll: Vec2): ComponentCall {
  return call(pinnedPanel, args, { context: { scroll } });
}

function observeCall(c: ComponentCall, input: PanelInput): Observation {
  const output = render(c) as Elem;
  const parts: readonly Elem[] = isGroup(output) ? output : [output];
  const placed = parts[parts.length - 1] as Elem;
  const placement = origin(placed);
  const bodyOrigin = origin(input.body);
  const bodyScreen: Vec2 = [
    input.slot[0] + placement[0] + bodyOrigin[0] - input.offset[0],
    input.slot[1] + placement[1] + bodyOrigin[1] - input.offset[1],
  ];
  return {
    output,
    placement,
    bodyScreen,
    pinned: isTranslate(placed),
  };
}

function observe(input: PanelInput): Observation {
  return observeCall(
    panelCall({ "activation-range": input.range, body: input.body }, input.offset),
    input,
  );
}

function isTranslate(elem: Elem): boolean {
  return elem != null && !isGroup(elem) && (elem as Node).type === "translate";
}

function isRectangleOf(elem: Elem, w: number): boolean {
  return (
    elem != null &&
    !isGroup(elem) &&
    (elem as Node).type === "rectangle" &&
    (elem as { width: number }).width === w
  );
}

// The spacer reserving the normal-flow slot: first element of the panel's
// output, as its [width, height] extent.
function reservedSpacer(out: Elem): Vec2 {
  const parts: readonly Elem[] = isGroup(out) ? out : [out];
  const first = parts[0] as Node;
  if (first == null || isGroup(first) || first.type !== "spacer") {
    throw new Error("expected the reserved slot spacer first in the output");
  }
  return [first.x, first.y];
}

// Drawables of an elem tree in painting order (later paints on top).
function flatten(elem: Elem): readonly Elem[] {
  if (elem == null) return [];
  if (isGroup(elem)) return elem.flatMap(flatten);
  return [elem, ...children(elem).flatMap(flatten)];
}

// p_contextual_source — derives_from: components.pinned_panel.contextual_offset
// generator: `panel nested under a scrollview with context.scroll set`
// predicate: offset value equals `context.scroll`, never a call-site literal
it("p_contextual_source: offset equals context.scroll, never a call-site literal", () => {
  fc.assert(
    fc.property(
      startArb,
      lenArb,
      bodyArb,
      slotArb,
      oxArb,
      fc.nat(200),
      (start, len, body, slot, ox, k) => {
        const end = start + len;
        const oy = start + k <= end ? start + k : end; // inside the range
        const range: Vec2 = [start, end];
        const scroll: Vec2 = [ox, oy];
        // the driving offset is the contextual value: the call's scroll prop
        // equals context.scroll ...
        const c = panelCall({ "activation-range": range, body }, scroll);
        expect(c.props["scroll"]).toEqual(scroll);
        // ... and exactly that value drives the render
        const obs = observeCall(c, { range, body, slot, offset: scroll });
        expect(obs.pinned).toBe(true);
        expect(obs.placement[1]).toBe(oy - end);
        expect(obs.bodyScreen).toEqual([slot[0] - ox, slot[1] - end]);
      },
    ),
  );
  fc.assert(
    fc.property(startArb, lenArb, bodyArb, slotArb, offsetArb, (start, len, body, slot, offset) => {
      const range: Vec2 = [start, start + len];
      const clean = observe({ range, body, slot, offset }).output;
      // a call site cannot override the offset with literal props
      const poisoned = observeCall(
        panelCall(
          { "activation-range": range, body, offset: [777, 777], scroll: [888, 888] },
          offset,
        ),
        { range, body, slot, offset },
      );
      expect(poisoned.output).toEqual(clean);
    }),
  );
});

// p_activation — derives_from: components.pinned_panel.activation_range_formula
// generator: `offset swept across and beyond the range`
// predicate: active exactly on `[start, end]`, inactive outside it
it("p_activation: active exactly on [start, end], inactive outside it", () => {
  fc.assert(
    fc.property(startArb, lenArb, bodyArb, slotArb, oxArb, (start, len, body, slot, ox) => {
      const end = start + len;
      for (let oy = Math.max(0, start - 2); oy <= end + 2; oy++) {
        const active = start <= oy && oy <= end;
        const obs = observe({ range: [start, end], body, slot, offset: [ox, oy] });
        expect(obs.pinned).toBe(active);
        // active: pinned at the release-boundary screen position;
        // inactive: normally translated in flow
        const expectedY = active ? slot[1] - end : slot[1] - oy;
        expect(obs.bodyScreen[1]).toBe(expectedY);
        expect(obs.bodyScreen[0]).toBe(slot[0] - ox);
      }
    }),
  );
});

// p_fixed_position — derives_from: components.pinned_panel.body_drawn_untranslated_when_active
// generator: `offset swept while active`
// predicate: body's screen position is constant across every sampled offset
it("p_fixed_position: body's screen position is constant across every sampled offset", () => {
  fc.assert(
    fc.property(
      startArb,
      positiveLenArb,
      bodyArb,
      slotArb,
      oxArb,
      (start, len, body, slot, ox) => {
        const end = start + len;
        let first: Vec2 | undefined;
        for (let i = 0; i <= 4; i++) {
          const oy = start + (len * i) / 4;
          const { bodyScreen } = observe({
            range: [start, end],
            body,
            slot,
            offset: [ox, oy],
          });
          if (first === undefined) {
            first = bodyScreen;
          } else {
            expect(bodyScreen).toEqual(first);
          }
        }
      },
    ),
  );
});

// p_spacer_constant — derives_from: components.pinned_panel.spacer_matches_body_extent
// generator: `panel toggled active and inactive`
// predicate: total scrollview content height is unchanged by activation state
it("p_spacer_constant: total scrollview content height is unchanged by activation state", () => {
  fc.assert(
    fc.property(startArb, lenArb, bodyArb, slotArb, oxArb, (start, len, body, slot, ox) => {
      const end = start + len;
      const activeObs = observe({
        range: [start, end],
        body,
        slot,
        offset: [ox, start + Math.floor(len / 2)], // inside the range
      });
      const inactiveObs = observe({
        range: [start, end],
        body,
        slot,
        offset: [ox, end + 1], // outside the range
      });
      expect(elemHeight(activeObs.output)).toBe(elemHeight(inactiveObs.output));
      // the spacer reserving the slot is present, with its full extent,
      // in both states
      for (const obs of [activeObs, inactiveObs]) {
        expect(reservedSpacer(obs.output)).toEqual([elemWidth(body), end - start]);
      }
    }),
  );
});

// p_no_jump — derives_from: components.pinned_panel.release_continuous
// generator: `offset stepped across activation-range.end`
// predicate: screen position immediately before and after the step are equal
it("p_no_jump: screen position immediately before and after the step are equal", () => {
  fc.assert(
    fc.property(
      startArb,
      positiveLenArb,
      bodyArb,
      slotArb,
      oxArb,
      fc.nat(4).map((n) => n + 1),
      (start, len, body, slot, ox, step) => {
        const end = start + len;
        const range: Vec2 = [start, end];
        // the active branch at the release boundary (offset.y == end is active)
        const atEndActive = observe({ range, body, slot, offset: [ox, end] }).bodyScreen;
        // the inactive (normally-translated) branch computed at the same
        // offset: a range excluding `end` renders the same body, slot and
        // offset through the inactive branch, whose position does not
        // depend on the range at all
        const atEndInactive = observe({
          range: [end + 1, end + 1],
          body,
          slot,
          offset: [ox, end],
        }).bodyScreen;
        expect(atEndInactive).toEqual(atEndActive);
        // stepping across the boundary moves the body by exactly the step —
        // no discontinuity the size of the activation range
        const after = observe({ range, body, slot, offset: [ox, end + step] }).bodyScreen;
        expect(after[0]).toBe(atEndActive[0]);
        expect(after[1]).toBe(atEndActive[1] - step);
      },
    ),
  );
});

// p_nested_priority — derives_from: components.pinned_panel.nested_panel_priority
// generator: `two overlapping panels, no z prop`
// predicate: the later-in-tree panel paints on top
it("p_nested_priority: the later-in-tree panel paints on top", () => {
  fc.assert(
    fc.property(
      startArb,
      positiveLenArb,
      slotArb,
      oxArb,
      fc.nat(60),
      fc.nat(30),
      (start, len, slot, ox, wA, extra) => {
        const end = start + len;
        const scroll: Vec2 = [ox, end]; // both panels simultaneously active
        const bodyA = rectangle(wA, len);
        const bodyB = rectangle(wA + 1 + extra, len);
        const obsA = observe({ range: [start, end], body: bodyA, slot, offset: scroll });
        const obsB = observe({ range: [start, end], body: bodyB, slot, offset: scroll });
        // both pinned, overlapping on screen
        expect(obsA.pinned).toBe(true);
        expect(obsB.pinned).toBe(true);
        expect(obsB.bodyScreen).toEqual(obsA.bodyScreen);
        // no z prop: painting order is tree order — the later panel's body
        // paints on top
        const flat = flatten([obsA.output, obsB.output]);
        const indexA = flat.findIndex((n) => isRectangleOf(n, wA));
        const indexB = flat.findIndex((n) => isRectangleOf(n, wA + 1 + extra));
        expect(indexA).toBeGreaterThanOrEqual(0);
        expect(indexB).toBeGreaterThan(indexA);
      },
    ),
  );
});

// p_pure — derives_from: components.pinned_panel.render_pure
// generator: `same offset supplied twice`
// predicate: identical output view value both times
it("p_pure: identical output view value both times", () => {
  fc.assert(
    fc.property(startArb, lenArb, bodyArb, slotArb, offsetArb, (start, len, body, slot, offset) => {
      const range: Vec2 = [start, start + len];
      // two call sites with identical semantic inputs; the z prop does not
      // enter the geometry, so the differing z values only keep the render
      // cache from collapsing the two calls into one computation — both
      // outputs are freshly computed and must still be identical
      const first = observeCall(
        panelCall({ "activation-range": range, body, z: 1 }, offset),
        { range, body, slot, offset },
      );
      const second = observeCall(
        panelCall({ "activation-range": range, body, z: 2 }, offset),
        { range, body, slot, offset },
      );
      expect(second.output).toEqual(first.output);
      expect(second.bodyScreen).toEqual(first.bodyScreen);
    }),
  );
});
