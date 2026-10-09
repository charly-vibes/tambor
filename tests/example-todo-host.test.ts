// Purpose: executable contract tests for the example-todo spec's host
//   concerns — save-image rendering, the three backends' portability,
//   and the touch hit targets.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: openspec/specs/example-todo/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every test carries the spec's example
//   value verbatim plus a generalized fast-check property where the row
//   states a general rule. Split out of the former monolithic
//   tests/example-todo.test.ts (tambor-272).

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  bounds,
  type Elem,
  type Label,
  type Node,
  type Vec2,
  type WithStrokeWidthNode,
} from "../src/views/model.ts";
import { hitTargetSize } from "../src/app/touch.ts";
import { saveImage } from "../src/examples/todo/image.ts";
import { canvasBackend, domBackend, textBackend } from "../src/examples/todo/backends.ts";
import { todoApp, todoState, type TodoState } from "../src/examples/todo/todo.ts";
import type { Path } from "../src/effects/paths.ts";
import { scanOf } from "./helpers/scan.ts";
import { arbTodoItem } from "./helpers/todo.ts";

// p_image — derives_from: example.todo.image_render
// generator: initial state and no DOM — predicate: an image buffer of
// non-zero size is produced
it("p_image: an image buffer of non-zero size is produced", () => {
  // The spec's example value must hold verbatim.
  const img = saveImage(todoApp(todoState(), {}));
  expect(img.width).toBeGreaterThan(0);
  expect(img.height).toBeGreaterThan(0);
  expect(img.data).toHaveLength(img.width * img.height * 4);
  // non-vacuous: the app actually drew into the buffer
  expect(Array.from(img.data).some((v) => v !== 0)).toBe(true);

  // Generalized property: whatever the todos, the app renders to a
  // non-zero image with content.
  fc.assert(
    fc.property(fc.array(arbTodoItem, { minLength: 0, maxLength: 4 }), (items) => {
      const im = saveImage(todoApp({ todos: items, "next-todo-text": "hi" }, {}));
      expect(im.width).toBeGreaterThan(0);
      expect(im.height).toBeGreaterThan(0);
      expect(Array.from(im.data).some((v) => v !== 0)).toBe(true);
    }),
  );
});

// p_portable — derives_from: example.todo.backend_portable
// generator: the three backends — predicate: each renders the app and
// routes a click to the same effect
it("p_portable: each renders the app and routes a click to the same effect", () => {
  // The spec's example value must hold verbatim: the same todo-app
  // definition (one view, one state) runs on canvas, dom and
  // text-terminal without change.
  const view = todoApp(todoState(), {});
  const backends = [canvasBackend(), domBackend(), textBackend()];
  // the click: a pointer down at row-local [8, 8] — handler-local
  // [3, 3] inside the delete X, clear of the overlapping checkbox
  const del = scanOf(view).find(
    (f) =>
      f.node.type === "handler" &&
      scanOf(f.node as Elem).some(
        (g) => g.node.type === "with-stroke-width" && (g.node as WithStrokeWidthNode).strokeWidth === 3,
      ),
  )!;
  expect(del.x).toBe(5);
  const pos: Vec2 = [del.x + 3, del.y + 3];
  const effects = backends.map((b) => {
    const target = b.render(view);
    // each backend renders the app to its own target, non-empty
    expect(target).toBeDefined();
    return b.routeClick(view, pos);
  });
  // the routed click is the same delete effect everywhere
  for (const e of effects) {
    expect(e).toHaveLength(1);
    expect(e[0]![0]).toBe("delete");
    const p = e[0]![1] as Path;
    expect(p[0]).toEqual(["keypath", "todos"]);
    expect((p[1] as readonly unknown[])[0]).toBe("filter");
    expect(p[2]).toEqual(["seq-nth", 0]);
  }
  expect(effects[1]).toEqual(effects[0]);
  expect(effects[2]).toEqual(effects[0]);

  // Generalized property: for every todo state, a click on the first
  // row's delete X routes to the same effect list on all three backends.
  fc.assert(
    fc.property(arbTodoItem, fc.string({ minLength: 1, maxLength: 6 }), (first, second) => {
      const st: TodoState = {
        todos: [first, { description: second, "complete?": false }],
        "next-todo-text": "",
      };
      const v = todoApp(st, {});
      const d = scanOf(v).find(
        (f) =>
          f.node.type === "handler" &&
          scanOf(f.node as Elem).some(
            (g) => g.node.type === "with-stroke-width" && (g.node as WithStrokeWidthNode).strokeWidth === 3,
          ),
      )!;
      const click: Vec2 = [d.x + 3, d.y + 3];
      const outs = [canvasBackend(), domBackend(), textBackend()].map((b) => b.routeClick(v, click));
      expect(outs[1]).toEqual(outs[0]);
      expect(outs[2]).toEqual(outs[0]);
      expect(outs[0]!.length).toBe(1);
      expect(outs[0]![0]![0]).toBe("delete");
    }),
  );
});

// p_todo_touch — derives_from: example.todo.todo_touch_targets
// generator: touch device — predicate: each hit area is at least 44 by
// 44 and the visual bounds are unchanged
it("p_todo_touch: each hit area is at least 44 by 44 and the visual bounds are unchanged", () => {
  // The spec's example value must hold verbatim: the app's delete X,
  // checkbox and toggle labels on a touch device.
  const view = todoApp(todoState(), {});
  const del = scanOf(view).find(
    (f) => f.node.type === "handler" && scanOf(f.node as Elem).some((g) => g.node.type === "with-stroke-width"),
  )!.node;
  const cb = scanOf(view).find((f) => f.node.type === "handler" && scanOf(f.node as Elem).some((g) => g.node.type === "checkbox"))!.node;
  const optHandlers = scanOf(view).filter(
    (f) => f.node.type === "handler" && scanOf(f.node as Elem).some((g) => g.node.type === "label" && ["all", "active", "complete"].includes((g.node as Label).text)),
  );
  expect(optHandlers.length).toBeGreaterThanOrEqual(2);
  // the delete X draws 10 by 10 and the checkbox 12 by 12 — unchanged
  expect(bounds(del)).toEqual([10, 10]);
  expect(bounds(cb)).toEqual([12, 12]);
  for (const [node, drawn] of [
    [del, [10, 10]],
    [cb, [12, 12]],
    ...optHandlers.map((f) => [f.node, bounds(f.node)] as const),
  ] as const) {
    const [hw, hh] = hitTargetSize(node, true);
    expect(hw).toBeGreaterThanOrEqual(44);
    expect(hh).toBeGreaterThanOrEqual(44);
    // a mouse host keeps the drawn size — the visual bounds unchanged
    expect(hitTargetSize(node, false)).toEqual(drawn);
  }

  // Generalized property: for every todo state, each delete X, checkbox
  // and toggle label has a hit area of at least 44 by 44 on touch while
  // its drawn size is unchanged.
  fc.assert(
    fc.property(fc.array(arbTodoItem, { minLength: 1, maxLength: 4 }), (items) => {
      const v = todoApp({ todos: items, "next-todo-text": "" }, {});
      const interactive = scanOf(v).filter((f) => f.node.type === "handler");
      expect(interactive.length).toBeGreaterThan(0);
      for (const f of interactive) {
        const [hw, hh] = hitTargetSize(f.node, true);
        expect(hw).toBeGreaterThanOrEqual(44);
        expect(hh).toBeGreaterThanOrEqual(44);
        expect(hitTargetSize(f.node, false)).toEqual(bounds(f.node));
      }
    }),
  );
});
