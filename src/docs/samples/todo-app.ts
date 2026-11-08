// Purpose: the quickstart sample (add-docs-site task 9.4) — the todo
//   app composed from tambor's real exports: todoState builds the
//   initial data, todoApp renders the app view, and the default handler
//   applies the add-todo effect against the state. node imports it
//   directly through native type stripping, so it uses erasable syntax
//   only and explicit .ts extension specifiers.
// Responsibilities: export `run` — the documented entry the quickstart
//   prose composes toward — returning one renderable todo app from a
//   fresh state; the extra exports (state, view, addTodo) the guide's
//   steps name in order as the arc state → view → effect.
// Rationale: openspec/specs/example-todo/spec.md is the design
//   authority — no behavior beyond the corpus: todoState seeds the
//   three todos (filter_default), todoApp renders the app view
//   (new_todo_layout), and add-todo appends a todo with the carried
//   description and complete? false to the end of the underlying list
//   (add_appends), applied through the default handler exactly as the
//   dispatcher applies it.

import { defaultHandler } from "../../effects/dispatch.ts";
import type { Effect } from "../../effects/dispatch.ts";
import {
  todoApp,
  todoState,
  TODOS_PATH,
  type TodoState,
} from "../../examples/todo/todo.ts";
import type { Elem } from "../../views/model.ts";

// The seed data the quickstart starts from: first (open), second
// (open), third (complete).
export function state(): TodoState {
  return todoState();
}

// The app view over a state — the working result the quickstart
// reaches. Rendering is a pure function, so the same view runs on the
// canvas, DOM and text-terminal backends unchanged.
export function view(current: TodoState = todoState()): Elem {
  return todoApp(current);
}

// The add-todo effect applied against a state through the default
// handler: appends a todo with the carried description and complete?
// false to the end of the underlying list (add_appends).
export function addTodo(current: TodoState, description: string): TodoState {
  const effects: readonly Effect[] = [["add-todo", TODOS_PATH, description]];
  return defaultHandler(current, effects, {}) as TodoState;
}

// The documented entry: one working todo app from a fresh state.
export function run(): Elem {
  return view(state());
}