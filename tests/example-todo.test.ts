// Purpose: executable contract tests for the example-todo spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/example-todo.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every test carries the spec's example
//   value verbatim plus a generalized fast-check property where the row
//   states a general rule.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  bounds,
  children,
  height,
  isGroup,
  type CheckboxNode,
  type Elem,
  type Label,
  type Node,
  type PathNode,
  type SpacerNode,
  type TranslateNode,
  type WithColorNode,
  type WithStrokeWidthNode,
} from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import type { Path } from "../src/effects/paths.ts";
import {
  deleteX,
  filterFn,
  todoItem,
  todoList,
  TODOS_PATH,
  type TodoItem,
} from "../src/examples/todo/todo.ts";

// ---------------------------------------------------------------------------
// Test helpers.
// ---------------------------------------------------------------------------

// One node found in a tree walk: the node, its absolute origin, and the
// ancestor context the corpus predicates name (gray wrapper, clickability).
interface Found {
  readonly node: Node;
  readonly x: number;
  readonly y: number;
  readonly underColor: boolean;
  readonly underHandler: boolean;
}

function scan(root: Elem): readonly Found[] {
  const out: Found[] = [];
  const walk = (elem: Elem, ox: number, oy: number, color: boolean, handler: boolean): void => {
    if (elem == null) return;
    if (isGroup(elem)) {
      for (const child of elem) walk(child, ox, oy, color, handler);
      return;
    }
    const node = elem as Node;
    let underColor = color;
    let underHandler = handler;
    if (node.type === "with-color") underColor = true;
    if (node.type === "handler") underHandler = true;
    out.push({ node, x: ox, y: oy, underColor, underHandler });
    let dx = 0;
    let dy = 0;
    if (node.type === "translate") {
      dx = node.x;
      dy = node.y;
    }
    for (const child of children(node)) walk(child, ox + dx, oy + dy, underColor, underHandler);
  };
  walk(root, 0, 0, false, false);
  return out;
}

function findNode(root: Elem, pred: (f: Found) => boolean): Found | undefined {
  return scan(root).find(pred);
}

// The last step of a path (what the binding ends in).
function lastStep(path: Path): unknown {
  return path[path.length - 1];
}

// The example todo paths under the unfiltered (all) filter.
const $todo0: Path = [...TODOS_PATH, ["filter", filterFn("all")], ["seq-nth", 0]];
const $todo1: Path = [...TODOS_PATH, ["filter", filterFn("all")], ["seq-nth", 1]];

// The example's todo item shape.
const arbTodoItem: fc.Arbitrary<TodoItem> = fc.record({
  description: fc.string({ minLength: 1, maxLength: 12 }),
  "complete?": fc.boolean(),
});

function todoPathOf(i: number): Path {
  return [...TODOS_PATH, ["filter", filterFn("all")], ["seq-nth", i]];
}

// ---------------------------------------------------------------------------
// C1 — the item views: delete-X geometry, todo-item layout and bindings,
// delete emission, todo-list spacing.
// ---------------------------------------------------------------------------

// p_delete_x — derives_from: example.todo.delete_x_geometry
// generator: render delete-X — predicate: two path nodes with width 3,
// red, endpoints as stated, and bounds [10, 10]
it("p_delete_x: two path nodes with width 3, red, endpoints as stated, and bounds [10, 10]", () => {
  // The spec's example value must hold verbatim.
  const x = deleteX();
  expect(bounds(x)).toEqual([10, 10]);
  const strokes = scan(x).filter((f) => f.node.type === "with-stroke-width");
  expect(strokes).toHaveLength(2);
  const segments = strokes.map((f) => {
    const sw = f.node as WithStrokeWidthNode;
    expect(sw.strokeWidth).toBe(3);
    const col = sw.drawables[0] as WithColorNode | undefined;
    expect(col?.type).toBe("with-color");
    expect(col?.color).toEqual([1, 0, 0]);
    const p = col?.drawables[0] as PathNode | undefined;
    expect(p?.type).toBe("path");
    return p?.points;
  });
  expect(segments).toEqual([
    [
      [0, 0],
      [10, 10],
    ],
    [
      [10, 0],
      [0, 10],
    ],
  ]);
});

// p_item_layout — derives_from: example.todo.item_layout
// generator: one todo — predicate: x offsets are increasing in the
// stated order and the checkbox origin is [10, 4] relative to the row
it("p_item_layout: x offsets are increasing in the stated order and the checkbox origin is [10, 4] relative to the row", () => {
  // The spec's example value must hold verbatim.
  const row = todoItem({ description: "second", "complete?": false }, $todo1);
  expect(isGroup(row)).toBe(true);
  const kids = (row as readonly Elem[]).map((el) => el as TranslateNode);
  // stated order: delete X, checkbox, spacer, textarea
  const xs = kids.map((k) => k.x);
  expect(xs[0]).toBe(5);
  expect(xs[1]).toBe(10);
  for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
  // the checkbox origin is [10, 4] relative to the row
  const cb = kids[1] as TranslateNode;
  expect([cb.x, cb.y]).toEqual([10, 4]);
  // the checkbox draw wrapped in its pointer-down handler
  expect((cb.drawable as Node).type).toBe("handler");
  expect((children(cb.drawable as Node)[0] as Node).type).toBe("checkbox");
  // a 10 px spacer between the checkbox and the textarea
  const sp = (kids[2] as TranslateNode).drawable as SpacerNode;
  expect([sp.type, sp.x, sp.y]).toEqual(["spacer", 10, 0]);
  expect((kids[3] as TranslateNode).drawable).toMatchObject({ type: "handler" });

  // Generalized property: the checkbox origin is [10, 4] relative to the
  // row and the x offsets increase in the stated order for every todo.
  fc.assert(
    fc.property(arbTodoItem, (todo) => {
      const r = todoItem(todo, $todo0) as readonly Elem[];
      const ks = r.map((el) => el as TranslateNode);
      const offsets = ks.map((k) => k.x);
      expect(offsets[0]).toBe(5);
      expect(offsets[1]).toBe(10);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!);
      }
      expect([ks[1]!.x, ks[1]!.y]).toEqual([10, 4]);
    }),
  );
});

// p_item_bindings — derives_from: example.todo.item_bindings
// generator: todo second with complete? false — predicate: checkbox is
// unchecked and textarea text is second, and the paths end in complete?
// and description
it("p_item_bindings: checkbox is unchecked and textarea text is second, and the paths end in complete? and description", () => {
  // The spec's example value must hold verbatim.
  const todo: TodoItem = { description: "second", "complete?": false };
  const row = todoItem(todo, $todo1);
  const cb = findNode(row, (f) => f.node.type === "checkbox")?.node as CheckboxNode;
  expect(cb.checked).toBe(false);
  const lbl = findNode(row, (f) => f.node.type === "label")?.node as Label;
  expect(lbl.text).toBe("second");
  // the checkbox binding path ends in complete?
  const cbIntents = dispatch(row, mouseDown([11, 5]));
  expect(cbIntents).toHaveLength(1);
  expect(cbIntents[0]?.[0]).toBe("update");
  expect(lastStep(cbIntents[0]?.[1] as Path)).toEqual(["keypath", "complete?"]);
  // the textarea binding path ends in description
  const taIntents = dispatch(row, mouseDown([34, 2]));
  expect(taIntents[0]?.[0]).toBe("request-focus");
  expect(lastStep(taIntents[0]?.[1] as Path)).toEqual(["keypath", "description"]);

  // Generalized property: for every todo the checkbox reflects the
  // complete flag and the two binding paths end in complete? and
  // description.
  fc.assert(
    fc.property(arbTodoItem, (t) => {
      const r = todoItem(t, $todo0);
      const checked = findNode(r, (f) => f.node.type === "checkbox")?.node as CheckboxNode;
      expect(checked.checked).toBe(t["complete?"] === true);
      const text = findNode(r, (f) => f.node.type === "label")?.node as Label;
      expect(text.text).toBe(t.description);
      const intents = dispatch(r, mouseDown([11, 5]));
      expect(lastStep(intents[0]?.[1] as Path)).toEqual(["keypath", "complete?"]);
      const focus = dispatch(r, mouseDown([34, 2]));
      expect(lastStep(focus[0]?.[1] as Path)).toEqual(["keypath", "description"]);
    }),
  );
});

// p_delete_emits — derives_from: example.todo.delete_emits
// generator: click at [8, 8] and at [20, 8] on a row — predicate: the
// first returns delete with the todo path and the second does not
it("p_delete_emits: the first returns delete with the todo path and the second does not", () => {
  // The spec's example value must hold verbatim.
  const row = todoItem({ description: "first", "complete?": false }, $todo0);
  const inside = dispatch(row, mouseDown([8, 8]));
  expect(inside).toEqual([["delete", $todo0]]);
  const outside = dispatch(row, mouseDown([20, 8]));
  expect(outside.some((intent) => intent[0] === "delete")).toBe(false);

  // Generalized property: for every todo, a pointer down at [8, 8]
  // returns exactly delete with the todo path and one at [20, 8]
  // returns no delete.
  fc.assert(
    fc.property(arbTodoItem, (todo) => {
      const r = todoItem(todo, $todo0);
      expect(dispatch(r, mouseDown([8, 8]))).toEqual([["delete", $todo0]]);
      expect(dispatch(r, mouseDown([20, 8])).some((i) => i[0] === "delete")).toBe(false);
    }),
  );
});

// p_spacing — derives_from: example.todo.list_spacing
// generator: three todos — predicate: row offsets differ by row height
// plus 5 plus the gap
it("p_spacing: row offsets differ by row height plus 5 plus the gap", () => {
  // The spec's example value must hold verbatim: the initial three todos.
  const rows = [
    todoItem({ description: "first", "complete?": false }, $todo0),
    todoItem({ description: "second", "complete?": false }, $todo1),
    todoItem({ description: "third", "complete?": true }, todoPathOf(2)),
  ];
  const placed = todoList(rows) as readonly Elem[];
  // rows keep their order; a 5 px spacer is interposed between rows
  expect(placed[0]).toBe(rows[0]);
  const rowYs: number[] = [];
  const spacerYs: number[] = [];
  for (const el of placed.slice(1)) {
    const t = el as TranslateNode;
    if ((t.drawable as Node).type === "spacer") spacerYs.push(t.y);
    else rowYs.push(t.y);
  }
  expect(spacerYs).toHaveLength(2);
  expect(rowYs).toHaveLength(2);
  const gap = 1;
  expect(rowYs[0]! - 0).toBe(height(rows[0] as Node) + 5 + gap);
  expect(spacerYs[0]).toBe(height(rows[0] as Node) + gap);
  expect(rowYs[1]! - rowYs[0]!).toBe(height(rows[1] as Node) + 5 + gap);
  expect(spacerYs[1]).toBe(rowYs[0]! + height(rows[1] as Node) + gap);

  // Generalized property: for every run of todos the row offsets differ
  // by row height plus 5 plus the gap, with one 5 px spacer between
  // consecutive rows; zero rows lay out to nothing.
  fc.assert(
    fc.property(
      fc.array(arbTodoItem, { minLength: 0, maxLength: 6 }),
      fc.constantFrom(1, 2, 3),
      (items, gapN) => {
        const rs = items.map((t, i) => todoItem(t, todoPathOf(i)));
        const pl = todoList(rs, gapN);
        if (items.length === 0) {
          expect(pl).toBeNull();
          return;
        }
        const out = pl as readonly Elem[];
        expect(out[0]).toBe(rs[0]);
        const ys: number[] = [];
        const sps: number[] = [];
        for (const el of out.slice(1)) {
          const t = el as TranslateNode;
          if ((t.drawable as Node).type === "spacer") sps.push(t.y);
          else ys.push(t.y);
        }
        expect(sps).toHaveLength(items.length - 1);
        expect(ys).toHaveLength(items.length - 1);
        // consecutive row offsets differ by the previous row's height
        // plus 5 plus the gap; the spacer fills the 5 px band after it
        let prevY = 0;
        for (let i = 1; i < rs.length; i++) {
          const prevH = height(rs[i - 1] as Elem);
          expect(ys[i - 1]! - prevY).toBe(prevH + 5 + gapN);
          expect(sps[i - 1]! - prevY).toBe(prevH + gapN);
          prevY = ys[i - 1]!;
        }
      },
    ),
  );
});