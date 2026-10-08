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
  type Vec2,
  type WithColorNode,
  type WithStrokeWidthNode,
} from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { keyPress, mouseDown } from "../src/events/event.ts";
import type { Path } from "../src/effects/paths.ts";
import { select, updatePath } from "../src/effects/paths.ts";
import { makeApp } from "../src/effects/dispatch.ts";
import { hitTargetSize } from "../src/app/touch.ts";
import { saveImage } from "../src/examples/todo/image.ts";
import { canvasBackend, domBackend, textBackend } from "../src/examples/todo/backends.ts";
import {
  deleteX,
  FILTER_OPTIONS,
  FILTER_PATH,
  filterFn,
  NEW_TODO_EXTRA_PATH,
  NEXT_TEXT_PATH,
  todoApp,
  todoItem,
  todoList,
  todoRows,
  todoState,
  toggle,
  TODOS_PATH,
  type TodoItem,
  type TodoState,
} from "../src/examples/todo/todo.ts";
import type {
  ButtonNode,
  HandlerNode,
} from "../src/views/model.ts";

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
  // event-layer nodes (wrap/bubble) carry drawables that views/model
  // children() does not know about; their type tag is outside the Node
  // union, so it is read through a cast
  const kindOf = (node: Node): string => (node as unknown as { type?: string }).type ?? "";
  const drawablesOf = (node: Node): readonly Elem[] =>
    (node as unknown as { drawables?: readonly Elem[] }).drawables ?? [];
  const walk = (elem: Elem, ox: number, oy: number, color: boolean, handler: boolean): void => {
    if (elem == null) return;
    if (isGroup(elem)) {
      for (const child of elem) walk(child, ox, oy, color, handler);
      return;
    }
    const node = elem as Node;
    const kind = kindOf(node);
    let underColor = color;
    let underHandler = handler;
    if (kind === "wrap" || kind === "bubble") {
      for (const child of drawablesOf(node)) walk(child, ox, oy, color, handler);
      return;
    }
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
// ---------------------------------------------------------------------------
// C2 — the toggle, the filters, the app view, and the effects that keep
// every edit on the underlying list.
// ---------------------------------------------------------------------------

// The descriptions rendered in the app's list, in row order: each row's
// textarea draws exactly one label with the item's description.
// The laid-out body under an app view: the Enter middleware wraps the
// whole app as its root wrap-on node, and the body is its drawable.
function viewBody(appView: Elem): Elem {
  const w = appView as unknown as { type?: string; drawables?: readonly Elem[] };
  return w.type === "wrap" ? (w.drawables as readonly Elem[])[0]! : appView;
}

function listGroupOf(appView: Elem): Elem {
  // the app body is a vertical layout; the list is its last translated child
  const kids = viewBody(appView) as readonly Elem[];
  const last = kids[kids.length - 1] as TranslateNode;
  return last.drawable;
}

function rowDescriptionsOf(appView: Elem): readonly string[] {
  const list = listGroupOf(appView);
  if (list == null) return [];
  return scan(list)
    .filter((f) => f.node.type === "label")
    .map((f) => (f.node as Label).text);
}

function rowCountOf(appView: Elem): number {
  const list = listGroupOf(appView);
  if (list == null) return 0;
  // every list child is a row group or a translate wrapping the 5 px
  // interposed spacer
  return (list as readonly Elem[]).filter(
    (el) =>
      !(
        !Array.isArray(el) &&
        (el as TranslateNode).type === "translate" &&
        ((el as TranslateNode).drawable as Node | null) !== null &&
        !Array.isArray((el as TranslateNode).drawable) &&
        ((el as TranslateNode).drawable as Node).type === "spacer"
      ),
  ).length;
}

// The state without a selected-filter (filter_default's generator).
function stateWithoutFilter(): TodoState {
  const s = todoState();
  const rest: TodoState = { todos: s.todos, "next-todo-text": s["next-todo-text"] };
  return rest;
}

// p_toggle_render — derives_from: example.todo.toggle_render
// generator: options all, active, complete with selected active —
// predicate: active is plain and the other two are gray and clickable
it("p_toggle_render: active is plain and the other two are gray and clickable", () => {
  // The spec's example value must hold verbatim.
  const t = toggle(FILTER_OPTIONS, "active", FILTER_PATH);
  const labels = scan(t).filter((f) => f.node.type === "label");
  expect(labels.map((f) => (f.node as Label).text)).toEqual(["all", "active", "complete"]);
  const byText = (text: string) => labels.find((f) => (f.node as Label).text === text)!;
  // the selected option is a plain label
  const active = byText("active");
  expect(active.underColor).toBe(false);
  expect(active.underHandler).toBe(false);
  // every other option is a clickable label in gray [0.8, 0.8, 0.8],
  // separated by 5 px spacers
  for (const text of ["all", "complete"]) {
    const f = byText(text);
    expect(f.underColor).toBe(true);
    expect(f.underHandler).toBe(true);
    const colorWrap = findNode(t, (g) => g.node.type === "with-color" && scan(g.node as Elem).some((h) => h.node === f.node))?.node as WithColorNode;
    expect(colorWrap.color).toEqual([0.8, 0.8, 0.8]);
  }
  const spacers = scan(t).filter((f) => f.node.type === "spacer");
  expect(spacers).toHaveLength(2);
  for (const s of spacers) expect((s.node as SpacerNode).x).toBe(5);

  // Generalized property: for every choice of selected option, exactly
  // one label is plain and the rest are gray and clickable.
  fc.assert(
    fc.property(fc.constantFrom(...FILTER_OPTIONS), (selected) => {
      const tg = toggle(FILTER_OPTIONS, selected, FILTER_PATH);
      const ls = scan(tg).filter((f) => f.node.type === "label");
      const plain = ls.filter((f) => !f.underColor && !f.underHandler);
      expect(plain).toHaveLength(1);
      expect((plain[0]!.node as Label).text).toBe(selected);
      expect(ls.filter((f) => f.underColor && f.underHandler)).toHaveLength(2);
    }),
  );
});

// p_toggle — derives_from: example.todo.toggle_sets_filter
// generator: click on the active label — predicate: effect is set
// selected-filter to active, and a click on the selected label returns
// nothing
it("p_toggle: effect is set selected-filter to active, and a click on the selected label returns nothing", () => {
  // The spec's example value must hold verbatim.
  const t = toggle(FILTER_OPTIONS, "all", FILTER_PATH);
  const found = scan(t).find(
    (f) => f.node.type === "handler" && scan(f.node as Elem).some((g) => g.node.type === "label" && (g.node as Label).text === "active"),
  )!;
  const activeHandler = found.node as HandlerNode;
  const [w, h] = bounds(activeHandler);
  expect(dispatch(t, mouseDown([found.x + w / 2, found.y + h / 2]))).toEqual([
    ["set", FILTER_PATH, "active"],
  ]);
  // a click on the selected option's plain label returns nothing
  const allPlain = findNode(t, (f) => f.node.type === "label" && (f.node as Label).text === "all")!;
  const [aw, ah] = bounds(allPlain.node);
  expect(dispatch(t, mouseDown([allPlain.x + aw / 2, allPlain.y + ah / 2]))).toEqual([]);

  // Generalized property: clicking any non-selected option returns set
  // with the selected path and that option; clicking the selected
  // option returns nothing.
  fc.assert(
    fc.property(fc.constantFrom(...FILTER_OPTIONS), fc.constantFrom(...FILTER_OPTIONS), (selected, clicked) => {
      const tg = toggle(FILTER_OPTIONS, selected, FILTER_PATH);
      const found = scan(tg).find(
        (f) => f.node.type === "handler" && scan(f.node as Elem).some((g) => g.node.type === "label" && (g.node as Label).text === clicked),
      );
      if (found !== undefined) {
        // a non-selected option is gray and clickable
        const [cw, ch] = bounds(found.node as Node);
        expect(dispatch(tg, mouseDown([found.x + cw / 2, found.y + ch / 2]))).toEqual([
          ["set", FILTER_PATH, clicked],
        ]);
      } else {
        // the selected option is plain and handles nothing
        const plain = scan(tg).find(
          (f) => f.node.type === "label" && (f.node as Label).text === clicked && !f.underColor && !f.underHandler,
        );
        expect(plain).toBeDefined();
        const [pw, ph] = bounds(plain!.node);
        expect(dispatch(tg, mouseDown([plain!.x + pw / 2, plain!.y + ph / 2]))).toEqual([]);
      }
    }),
  );
});

// p_filter_default — derives_from: example.todo.filter_default
// generator: no selected-filter — predicate: the unfiltered option is
// selected and three rows render
it("p_filter_default: the unfiltered option is selected and three rows render", () => {
  // The spec's example value must hold verbatim.
  const app = todoApp(stateWithoutFilter(), {});
  expect(rowCountOf(app)).toBe(3);
  expect(rowDescriptionsOf(app)).toEqual(["first", "second", "third"]);
  // the toggle shows "all" as the plain (selected) option
  const all = scan(app).find((f) => f.node.type === "label" && (f.node as Label).text === "all")!;
  expect(all.underColor).toBe(false);
  expect(all.underHandler).toBe(false);

  // Generalized property: whatever the todos, a missing selected-filter
  // shows every row.
  fc.assert(
    fc.property(fc.array(arbTodoItem, { minLength: 0, maxLength: 5 }), (items) => {
      const view = todoApp({ todos: items, "next-todo-text": "" }, {});
      expect(rowDescriptionsOf(view)).toEqual(items.map((t) => t.description));
    }),
  );
});

// p_filter_fns — derives_from: example.todo.filter_fns
// generator: todos first, second, third with third complete —
// predicate: unfiltered shows 3, active shows first and second,
// complete shows third
it("p_filter_fns: unfiltered shows 3, active shows first and second, complete shows third", () => {
  // The spec's example value must hold verbatim.
  for (const [sel, expected] of [
    ["all", ["first", "second", "third"]],
    ["active", ["first", "second"]],
    ["complete", ["third"]],
  ] as const) {
    const view = todoApp({ ...todoState(), "selected-filter": sel }, {});
    expect(rowDescriptionsOf(view)).toEqual(expected);
  }
  // the complete view really renders only the third row
  expect(rowCountOf(todoApp({ ...todoState(), "selected-filter": "complete" }, {}))).toBe(1);

  // Generalized property: the filter fns partition the todos — active
  // shows exactly those with complete? false, complete exactly those
  // with complete? true, unfiltered everything.
  fc.assert(
    fc.property(fc.array(arbTodoItem, { minLength: 0, maxLength: 8 }), (items) => {
      const shown = (name: string) => items.filter(filterFn(name)).map((t) => t.description);
      expect(shown("all")).toEqual(items.map((t) => t.description));
      expect(shown("active")).toEqual(items.filter((t) => t["complete?"] !== true).map((t) => t.description));
      expect(shown("complete")).toEqual(items.filter((t) => t["complete?"] === true).map((t) => t.description));
    }),
  );
});

// p_unknown_filter — derives_from: example.todo.unknown_filter_all (the
// advisory: the port shows all, the original hid everything)
// generator: selected-filter bogus — predicate: three rows render
it("p_unknown_filter: three rows render", () => {
  // The spec's example value must hold verbatim.
  const view = todoApp({ ...todoState(), "selected-filter": "bogus" }, {});
  expect(rowCountOf(view)).toBe(3);
  expect(rowDescriptionsOf(view)).toEqual(["first", "second", "third"]);

  // Generalized property: any unknown filter name shows all todos.
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !["all", "active", "complete"].includes(s)),
      fc.array(arbTodoItem, { minLength: 1, maxLength: 4 }),
      (bogus, items) => {
        const view2 = todoApp({ todos: items, "next-todo-text": "", "selected-filter": bogus }, {});
        expect(rowDescriptionsOf(view2)).toEqual(items.map((t) => t.description));
      },
    ),
  );
});

// p_add_button — derives_from: example.todo.add_button
// generator: next-todo-text hello — predicate: effects are add-todo
// with todos path and hello, then set next-todo-text to the empty string
it("p_add_button: effects are add-todo with todos path and hello, then set next-todo-text to the empty string", () => {
  // The spec's example value must hold verbatim.
  const view = todoApp({ ...todoState(), "next-todo-text": "hello" }, {});
  const btn = findNode(view, (f) => f.node.type === "button")!.node as ButtonNode;
  expect(btn.onClick?.()).toEqual([
    ["add-todo", TODOS_PATH, "hello"],
    ["set", NEXT_TEXT_PATH, ""],
  ]);

  // Generalized property: for every drafted text, the button returns
  // add-todo with the todos path and that text, then set next-todo-text
  // to the empty string.
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 20 }), (text) => {
      const v = todoApp({ ...todoState(), "next-todo-text": text }, {});
      const b = findNode(v, (f) => f.node.type === "button")!.node as ButtonNode;
      expect(b.onClick?.()).toEqual([
        ["add-todo", TODOS_PATH, text],
        ["set", NEXT_TEXT_PATH, ""],
      ]);
    }),
  );
});

// p_add — derives_from: example.todo.add_appends
// generator: apply add-todo hello — predicate: list ends with
// description hello and complete? false
it("p_add: list ends with description hello and complete? false", () => {
  // The spec's example value must hold verbatim.
  const app = makeApp({ view: () => null, state: todoState() });
  app.dispatch([["add-todo", TODOS_PATH, "hello"]]);
  const todos = (app.getState() as TodoState).todos;
  expect(todos).toHaveLength(4);
  expect(todos[todos.length - 1]).toEqual({ description: "hello", "complete?": false });

  // Generalized property: applying add-todo appends a todo with that
  // description and complete? false to the end, keeping the rest.
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 20 }), fc.array(arbTodoItem, { maxLength: 4 }), (text, items) => {
      const app2 = makeApp({ view: () => null, state: { todos: items, "next-todo-text": "" } });
      app2.dispatch([["add-todo", TODOS_PATH, text]]);
      const out = (app2.getState() as TodoState).todos;
      expect(out).toHaveLength(items.length + 1);
      expect(out[out.length - 1]).toEqual({ description: text, "complete?": false });
      expect(out.slice(0, -1)).toEqual(items);
    }),
  );
});

// p_delete — derives_from: example.todo.delete_removes_item
// generator: todos first, second, third and delete the first —
// predicate: list becomes second, third
it("p_delete: list becomes second, third", () => {
  // The spec's example value must hold verbatim.
  const app = makeApp({ view: () => null, state: todoState() });
  app.dispatch([["delete", $todo0]]);
  expect((app.getState() as TodoState).todos.map((t) => t.description)).toEqual(["second", "third"]);

  // Generalized property: deleting the visible index i removes exactly
  // that todo from the underlying list, keeping the order of the rest.
  fc.assert(
    fc.property(
      fc.array(arbTodoItem, { minLength: 1, maxLength: 6 }),
      fc.nat(5),
      (items, picked) => {
        const i = picked % items.length;
        const app2 = makeApp({ view: () => null, state: { todos: items, "next-todo-text": "" } });
        app2.dispatch([["delete", todoPathOf(i)]]);
        const out = (app2.getState() as TodoState).todos;
        expect(out.map((t) => t.description)).toEqual(
          items.filter((_, j) => j !== i).map((t) => t.description),
        );
      },
    ),
  );
});

// p_complete — derives_from: example.todo.complete_toggles
// generator: click the second checkbox — predicate: only the second
// todo becomes complete
it("p_complete: only the second todo becomes complete", () => {
  // The spec's example value must hold verbatim.
  const row = todoItem({ description: "second", "complete?": false }, $todo1);
  const app = makeApp({ view: () => null, state: todoState() });
  app.dispatch(dispatch(row, mouseDown([11, 5])));
  expect((app.getState() as TodoState).todos).toEqual([
    { description: "first", "complete?": false },
    { description: "second", "complete?": true },
    { description: "third", "complete?": true },
  ]);

  // Generalized property: toggling the checkbox of the visible index i
  // flips exactly that todo's complete flag in the underlying list.
  fc.assert(
    fc.property(
      fc.array(arbTodoItem, { minLength: 1, maxLength: 6 }),
      fc.nat(5),
      (items, picked) => {
        const i = picked % items.length;
        const r = todoItem(items[i]!, todoPathOf(i));
        const app2 = makeApp({ view: () => null, state: { todos: items, "next-todo-text": "" } });
        app2.dispatch(dispatch(r, mouseDown([11, 5])));
        const out = (app2.getState() as TodoState).todos;
        expect(out).toEqual(
          items.map((t, j) => (j === i ? { description: t.description, "complete?": t["complete?"] !== true } : t)),
        );
      },
    ),
  );
});

// p_filtered_paths — derives_from: example.todo.filtered_paths_original
// generator: active filter and a delete click on visible index 1 —
// predicate: original list becomes first, third
it("p_filtered_paths: original list becomes first, third", () => {
  // The spec's example value must hold verbatim.
  const state: TodoState = { ...todoState(), "selected-filter": "active" };
  const rows = todoRows(state);
  expect(rows).toHaveLength(2);
  const intents = dispatch(rows[1] as Elem, mouseDown([8, 8]));
  // the delete path is todos then filter then seq-nth(1)
  expect(intents).toHaveLength(1);
  expect(intents[0]![0]).toBe("delete");
  const p = intents[0]![1] as Path;
  expect(p[0]).toEqual(["keypath", "todos"]);
  expect((p[1] as readonly unknown[])[0]).toBe("filter");
  expect(p[2]).toEqual(["seq-nth", 1]);
  const app = makeApp({ view: () => null, state });
  app.dispatch(intents);
  expect((app.getState() as TodoState).todos.map((t) => t.description)).toEqual(["first", "third"]);

  // Generalized property: for every todos array (unique descriptions)
  // and visible index j, the path todos then filter then seq-nth(j)
  // reaches the matching original element — select reads it, update
  // changes only it with the order of the rest kept, and delete removes
  // exactly it from the underlying list.
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 5 }),
      fc.nat(5),
      (rest, picked) => {
        // "zz" guarantees at least one visible (even-length) item
        const descriptions = ["zz", ...rest];
        const items: TodoItem[] = descriptions.map((d) => ({
          description: d,
          "complete?": d.length % 2 === 1,
        }));
        const visible = items.filter((t) => t["complete?"] !== true);
        const j = picked % visible.length;
        const target = visible[j]!;
        const pred = filterFn("active");
        const path: Path = [TODOS_PATH[0] as Path[0], ["filter", pred], ["seq-nth", j]];
        const st: TodoState = { todos: items, "next-todo-text": "", "selected-filter": "active" };
        // select reaches the matching original element
        expect(select(st, path)).toEqual(target);
        // update changes only that element, order of the rest kept
        const updated = updatePath(st, path, (t) => ({ ...(t as TodoItem), description: "z" }));
        expect((updated as TodoState).todos).toEqual(
          items.map((t) =>
            t === target ? { description: "z", "complete?": t["complete?"] } : t,
          ),
        );
        // the row's own delete intent carries that path
        const rows2 = todoRows(st);
        const intents2 = dispatch(rows2[visible.indexOf(target)] as Elem, mouseDown([8, 8]));
        expect(intents2).toHaveLength(1);
        expect(intents2[0]![0]).toBe("delete");
        expect((intents2[0]![1] as Path)[2]).toEqual(["seq-nth", visible.indexOf(target)]);
        // applying it removes exactly that element
        const app2 = makeApp({ view: () => null, state: st });
        app2.dispatch(intents2);
        const out = (app2.getState() as TodoState).todos;
        expect(out).toHaveLength(items.length - 1);
        expect(out.map((t) => t.description).sort()).toEqual(
          items.filter((t) => t !== target).map((t) => t.description).sort(),
        );
      },
    ),
  );
});

// p_filtered_toggle — derives_from: example.todo.filtered_paths_original
// generator: complete filter and unchecking the only visible todo —
// predicate: third becomes open and the next render under complete
// shows no rows
it("p_filtered_toggle: third becomes open and the next render under complete shows no rows", () => {
  // The spec's example value must hold verbatim.
  const state: TodoState = { ...todoState(), "selected-filter": "complete" };
  const rows = todoRows(state);
  expect(rows).toHaveLength(1);
  const intents = dispatch(rows[0] as Elem, mouseDown([11, 5]));
  expect(intents[0]![0]).toBe("update");
  const p = intents[0]![1] as Path;
  expect(p[0]).toEqual(["keypath", "todos"]);
  expect((p[1] as readonly unknown[])[0]).toBe("filter");
  expect(p[2]).toEqual(["seq-nth", 0]);
  const app = makeApp({ view: () => null, state });
  app.dispatch(intents);
  expect((app.getState() as TodoState).todos[2]).toEqual({ description: "third", "complete?": false });
  // the next render under complete shows no rows
  const next = todoRows(app.getState() as TodoState);
  expect(next).toHaveLength(0);
  expect(rowDescriptionsOf(todoApp(app.getState() as TodoState, {}))).toEqual([]);
});

// ---------------------------------------------------------------------------
// C3 — the host: save-image, the three backends, and touch targets.
// ---------------------------------------------------------------------------

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
  const del = scan(view).find(
    (f) =>
      f.node.type === "handler" &&
      scan(f.node as Elem).some(
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
      const d = scan(v).find(
        (f) =>
          f.node.type === "handler" &&
          scan(f.node as Elem).some(
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
  const del = scan(view).find(
    (f) => f.node.type === "handler" && scan(f.node as Elem).some((g) => g.node.type === "with-stroke-width"),
  )!.node;
  const cb = scan(view).find((f) => f.node.type === "handler" && scan(f.node as Elem).some((g) => g.node.type === "checkbox"))!.node;
  const optHandlers = scan(view).filter(
    (f) => f.node.type === "handler" && scan(f.node as Elem).some((g) => g.node.type === "label" && ["all", "active", "complete"].includes((g.node as Label).text)),
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
      const interactive = scan(v).filter((f) => f.node.type === "handler");
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
