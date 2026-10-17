// Purpose: the TodoMVC benchmark app (tambor-1jz) — B2 of the bench
//   core suite: the EXISTING example.todo app driven at scale (200
//   seeded todos), mounted through the same makeApp/SPA mount path as
//   the gallery demos.
// Responsibilities: todoBenchState (the todo example's initial state
//   with 200 todos, every fifth complete) and createTodoBenchApp (the
//   ordinary registry-aware makeApp mount over the todoApp view).
// Rationale: no fork of semantics: the view IS todoApp and the effects
//   are the example's own (add-todo, delete, the row edits, the filter
//   toggle) — only the initial state differs from the gallery's todo
//   demo, so the bench measures the real example app at scale rather
//   than a parallel implementation (src/examples/todo/todo.ts is the
//   design authority; the mount shape mirrors createTodoDemo in
//   src/spa/gallery.ts).

import { makeApp, type App } from "../../effects/dispatch.ts";
import { todoApp, type TodoItem, type TodoState } from "../../examples/todo/todo.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// The todo item the bench seeds: "todo <n>", every fifth complete.
function benchTodo(n: number): TodoItem {
  return { description: `todo ${n}`, "complete?": n % 5 === 0 };
}

// The seeded list: 200 todos.
function seededTodos(): readonly TodoItem[] {
  const out: TodoItem[] = [];
  for (let n = 1; n <= 200; n++) out.push(benchTodo(n));
  return out;
}

// The bench initial state: the example's defaults with 200 seeded todos
// (todoState's shape: next-todo-text "" and selected-filter "all").
export function todoBenchState(): TodoState {
  return {
    todos: seededTodos(),
    "next-todo-text": "",
    "selected-filter": "all",
  };
}

// The bench app: the ordinary registry-aware makeApp mount over the
// todoApp view — the same wire the gallery's todo demo uses.
export function createTodoBenchApp(): App {
  return makeApp({
    view: (state, context) =>
      todoApp(state as TodoState, context as { focus?: unknown }),
    state: todoBenchState(),
    backend: { containerSize: VIEWPORT },
  });
}
