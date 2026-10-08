// Purpose: executable contract tests for the example-todo spec's
//   effects — add, delete, complete-toggle, and the filtered paths that
//   keep every edit on the underlying list.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/example-todo.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every test carries the spec's example
//   value verbatim plus a generalized fast-check property where the row
//   states a general rule. Split out of the former monolithic
//   tests/example-todo.test.ts (tambor-272).

import { expect, it } from "vitest";
import fc from "fast-check";

import type { ButtonNode, Elem } from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import type { Path } from "../src/effects/paths.ts";
import { select, updatePath } from "../src/effects/paths.ts";
import { makeApp } from "../src/effects/dispatch.ts";
import {
  filterFn,
  NEXT_TEXT_PATH,
  todoApp,
  todoItem,
  todoRows,
  todoState,
  TODOS_PATH,
  type TodoItem,
  type TodoState,
} from "../src/examples/todo/todo.ts";
import { findNode } from "./helpers/scan.ts";
import { $todo0, $todo1, arbTodoItem, rowDescriptionsOf, todoPathOf } from "./helpers/todo.ts";

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
