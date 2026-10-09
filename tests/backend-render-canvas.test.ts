// Purpose: backend.render contract tests for the canvas drawing engine —
//   deterministic draws, balanced transform stacks, dpr backing-store
//   sizing, resize repaints, raf coalescing, touch-action styling and
//   headless (no-DOM) rendering.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property,
//   plus the local generators (the pixel-equality comparison and the
//   random view arbitrary over the view model's nodes).
// Rationale: openspec/specs/backend-render/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). tambor-272 redistributes the former monolithic
//   tests/backend-render.test.ts into topic files; the pixel comparison
//   is decomposed (firstMismatch) and the view arbitrary is
//   depth-bounded (no fc.letrec) so every function stays within the
//   tambor-272 complexity budgets.

import { afterAll, expect, it, vi } from "vitest";
import fc from "fast-check";

import { CanvasBackend } from "../src/render/canvas.ts";
import type { Font } from "../src/render/backend.ts";
import { computedStyle, createCanvas } from "../src/render/domsim.ts";
import { CONTAINER_SIZE_KEY, type ViewFn } from "../src/effects/dispatch.ts";
import { mobileTodoView, todoState } from "../src/ui/fixture_todo.ts";
import {
  label as labelNode,
  path,
  rectangle,
  translate,
  withColor,
  withStyle,
  withStrokeWidth,
  type Elem,
} from "../src/views/model.ts";
import {
  rotate,
  scale,
  scissor,
  type AnyDraw,
} from "../src/render/primitives.ts";

afterAll(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- helpers

// The first index where two pixel buffers differ, or -1 when equal.
function firstMismatch(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

// Byte equality for pixel buffers: vitest's toEqual on large typed
// arrays is pathologically slow, so the determinism predicate compares
// manually.
function sameData(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  return a.length === b.length && firstMismatch(a, b) < 0;
}

// A random view over the view model's nodes, deterministic under the
// default measure (the p_determinism / p_stack generators). The
// recursion is bounded by depth, not fc.letrec, so generation never
// overflows the stack.
const elemLeaf: fc.Arbitrary<Elem> = fc.oneof(
  fc.constant(null),
  fc.constant(labelNode("hello")),
  fc.nat(60).chain((w) => fc.nat(60).map((h) => rectangle(w, h))),
  fc.tuple(fc.nat(50), fc.nat(50), fc.nat(50)).map(
    ([a, b, c]) => path([0, 0], [a, b], [c, a]),
  ),
  fc.tuple(fc.nat(40), fc.nat(40)).map(([x, y]) => translate(x, y, labelNode("t"))),
) as fc.Arbitrary<Elem>;

function elemNode(depth: number): fc.Arbitrary<Elem> {
  if (depth <= 0) return elemLeaf;
  const inner = (): fc.Arbitrary<Elem> => elemNode(depth - 1);
  return fc.oneof(
    elemLeaf,
    fc.tuple(inner(), inner()).map(([a, b]): Elem => [a, b]),
    fc.tuple(fc.nat(20), fc.nat(20), inner()).map(([x, y, d]): Elem => translate(x, y, d)),
    fc.tuple(fc.nat(2), fc.nat(2), inner()).map(
      ([r, g, d]): Elem => withColor([r / 3, g / 3, 1], d),
    ),
    inner().map((d): Elem => withStyle("stroke", d)),
    fc.tuple(fc.nat(4), inner()).map(([sw, d]): Elem => withStrokeWidth(1 + sw, d)),
  ) as fc.Arbitrary<Elem>;
}

const arbElem: fc.Arbitrary<Elem> = elemNode(3);

// The same views, additionally nested through the backend-side
// wrappers, so the stack balancing covers rotate, scale and scissor.
const arbView: fc.Arbitrary<AnyDraw> = fc.oneof(
  arbElem as fc.Arbitrary<AnyDraw>,
  fc.nat(90).chain((theta) => arbElem.map((v): AnyDraw => rotate(theta, v))),
  fc.nat(3).chain((s) => arbElem.map((v): AnyDraw => scale(1 + s, 1 + s, v))),
  fc.tuple(fc.nat(40), fc.nat(40)).chain(([w, h]) =>
    arbElem.map((v): AnyDraw => scissor(0, 0, w, h, v)),
  ),
) as fc.Arbitrary<AnyDraw>;

// ---------------------------------------------------------------- tests

// p_determinism — derives_from: backend.render.draw_deterministic
// generator: random views — predicate: two draws produce equal pixels
it("p_determinism: two draws of a random view produce equal pixels", () => {
  fc.assert(
    fc.property(arbView, (view) => {
      const backend = new CanvasBackend({ containerSize: [120, 120] });
      backend.draw(view);
      const first = new Uint8ClampedArray(backend.image.data);
      backend.draw(view);
      expect(sameData(backend.image.data, first)).toBe(true);
    }),
  );
});

// p_stack — derives_from: backend.render.transform_stack_balanced
// generator: random nested views — predicate: stack depth is 0 after draw
it("p_stack: stack depth is 0 after drawing a random nested view", () => {
  fc.assert(
    fc.property(arbView, (view) => {
      const backend = new CanvasBackend({ containerSize: [120, 120] });
      backend.draw(view);
      expect(backend.stackDepth).toBe(0);
    }),
  );
});

// p_index — derives_from: backend.render.index_for_position_inverse
// generator: text hello at x from -5 to 200
// predicate: index is 0 at the left, 5 at the right and never decreases
it("p_index: text hello at x from -5 to 200 gives 0 at the left, 5 at the right and never decreases", () => {
  const backend = new CanvasBackend({ containerSize: [220, 20] });
  const font: Font = { size: 1 };
  const at = (x: number): number => backend.indexForPosition(font, "hello", x, 0);

  // the boundaries of the sweep
  expect(at(-5)).toBe(0);
  expect(at(200)).toBe(5);

  // never decreases: for every ordered pair x1 <= x2 in [-5, 200]
  fc.assert(
    fc.property(
      fc.integer({ min: -5, max: 200 }).chain((x1) =>
        fc.integer({ min: x1, max: 200 }).map((x2) => [x1, x2] as const),
      ),
      ([x1, x2]) => {
        expect(at(x1)).toBeLessThanOrEqual(at(x2));
      },
    ),
  );
});

// p_dpr — derives_from: backend.render.dpr_scaled
// generator: dpr in 1, 2, 3 — predicate: backing size equals css size times dpr
it("p_dpr: backing size equals css size times dpr for dpr in 1, 2, 3", () => {
  fc.assert(
    fc.property(fc.constantFrom(1, 2, 3), (dpr) => {
      const backend = new CanvasBackend({ containerSize: [320, 480], dpr });
      const surface = createCanvas();
      backend.attach(surface);
      // the backing store scales by dpr …
      expect(surface.attrs.width).toBe(320 * dpr);
      expect(surface.attrs.height).toBe(480 * dpr);
      expect(backend.image.width).toBe(320 * dpr);
      // … and the css size is unchanged
      expect(surface.style.width).toBe("320px");
      expect(surface.style.height).toBe("480px");
    }),
  );
});

// p_resize — derives_from: backend.render.resize_redraws
// generator: random viewport sizes
// predicate: a redraw follows each resize with the new size in context
it("p_resize: a redraw follows each resize with the new size in context", () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 1, max: 400 }), fc.integer({ min: 1, max: 400 })),
      ([w, h]) => {
        const seenSizes: unknown[] = [];
        const view: ViewFn = (_state, context) => {
          seenSizes.push(context[CONTAINER_SIZE_KEY]);
          return rectangle(w, h);
        };
        const backend = new CanvasBackend({ containerSize: [50, 50], view, state: {} });
        const before = backend.drawCount;
        backend.resize([w, h]);
        expect(backend.drawCount).toBeGreaterThan(before);
        expect(backend.containerSize).toEqual([w, h]);
        expect(seenSizes[seenSizes.length - 1]).toEqual([w, h]);
      },
    ),
  );
});

// p_raf — derives_from: backend.render.raf_coalesced
// generator: N requests per frame — predicate: one draw per frame
it("p_raf: N requests per frame produce one draw per frame", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 }), (n1, n2) => {
      const backend = new CanvasBackend({ containerSize: [80, 80] });
      backend.draw(labelNode("raf"));
      const frames: (() => void)[] = [];
      vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
        frames.push(cb);
        return frames.length;
      });
      try {
        for (let i = 0; i < n1; i++) backend.requestDraw();
        expect(frames).toHaveLength(1);
        expect(backend.drawCount).toBe(1);
        // one flush = one frame = one draw, however many requests
        frames.splice(0).forEach((cb) => cb());
        expect(backend.drawCount).toBe(2);
        for (let i = 0; i < n2; i++) backend.requestDraw();
        expect(frames).toHaveLength(1);
        frames.splice(0).forEach((cb) => cb());
        expect(backend.drawCount).toBe(3);
      } finally {
        vi.unstubAllGlobals();
      }
    }),
  );
});

// p_touch_action — derives_from: backend.render.touch_action_none
// generator: mounted canvas — predicate: computed touch-action is none
it("p_touch_action: a mounted canvas has computed touch-action none", () => {
  const backend = new CanvasBackend({ containerSize: [320, 480] });
  const surface = createCanvas();
  backend.attach(surface);
  expect(computedStyle(surface)["touch-action"]).toBe("none");
});

// p_headless — derives_from: backend.render.headless_render
// generator: the todo-app initial state in a runtime with no DOM
// predicate: an image of non-zero size is produced
it("p_headless: the todo-app initial state in a runtime with no DOM produces an image of non-zero size", () => {
  // no surface is ever attached: a runtime with no DOM
  const state = todoState();
  const { view } = mobileTodoView(state, [400, 600]);
  const backend = new CanvasBackend({ containerSize: [400, 600] });
  backend.draw(view);
  expect(backend.image.width).toBeGreaterThan(0);
  expect(backend.image.height).toBeGreaterThan(0);
  // and the image contains rendered content
  expect(backend.image.inkBounds()).not.toBeNull();
});