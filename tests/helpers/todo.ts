// Purpose: shared todo-app fixtures and view queries for the
//   example-todo contract tests.
// Responsibilities: the todo-item fast-check arbitrary, the unfiltered
//   todo paths, and the app-view body/list/description queries the
//   predicates read.
// Rationale: specs/example-todo.md is the design authority; tambor-272
//   split the former monolithic tests/example-todo.test.ts into
//   topic-clustered files, and helpers used by two or more of them live
//   here instead of being duplicated. Every walker stays within the
//   tambor-272 complexity budgets by pushing each decision into its own
//   small named function.

import fc from "fast-check";

import type { Elem, Label, TranslateNode } from "../../src/views/model.ts";
import type { Path } from "../../src/effects/paths.ts";
import {
  filterFn,
  TODOS_PATH,
  todoState,
  type TodoItem,
  type TodoState,
} from "../../src/examples/todo/todo.ts";
import { scanOf } from "./scan.ts";

// The example's todo item shape.
export const arbTodoItem: fc.Arbitrary<TodoItem> = fc.record({
  description: fc.string({ minLength: 1, maxLength: 12 }),
  "complete?": fc.boolean(),
});

// The example todo paths under the unfiltered (all) filter.
export const $todo0: Path = [...TODOS_PATH, ["filter", filterFn("all")], ["seq-nth", 0]];
export const $todo1: Path = [...TODOS_PATH, ["filter", filterFn("all")], ["seq-nth", 1]];

// The unfiltered path of the visible todo at index i.
export function todoPathOf(i: number): Path {
  return [...TODOS_PATH, ["filter", filterFn("all")], ["seq-nth", i]];
}

// The laid-out body under an app view: the Enter middleware wraps the
// whole app as its root wrap-on node, and the body is its drawable.
export function viewBody(appView: Elem): Elem {
  const w = appView as unknown as { type?: string; drawables?: readonly Elem[] };
  return w.type === "wrap" ? (w.drawables as readonly Elem[])[0]! : appView;
}

// The laid-out list: the app body's last translated child.
export function listGroupOf(appView: Elem): Elem {
  const kids = viewBody(appView) as readonly Elem[];
  const last = kids[kids.length - 1] as TranslateNode;
  return last.drawable;
}

// The descriptions rendered in the app's list, in row order: each row's
// textarea draws exactly one label with the item's description.
export function rowDescriptionsOf(appView: Elem): readonly string[] {
  const list = listGroupOf(appView);
  if (list == null) return [];
  return scanOf(list)
    .filter((f) => f.node.type === "label")
    .map((f) => (f.node as Label).text);
}

// The state without a selected-filter (filter_default's generator).
export function stateWithoutFilter(): TodoState {
  const s = todoState();
  const rest: TodoState = { todos: s.todos, "next-todo-text": s["next-todo-text"] };
  return rest;
}
