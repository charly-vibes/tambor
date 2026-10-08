// Purpose: executable contract tests for the interop-model spec — the
//   explicit-path tier: path building, the each helper, and the
//   no-macro acceptance scenarios.
// Responsibilities: encode each converted row's generator and predicate as a
//   vitest + fast-check property, one test per converted property.
// Rationale: specs/interop-model.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text). No vacuous
//   predicates: every check encodes its row's stated behavior. The
//   acceptance tiers apply the emitted batches through the explicit path
//   machinery (state.paths), which owns filter-navigator deletion.

import { expect, it } from "vitest";

import { concatPath, each, filterNav } from "../src/interop/paths.ts";
import { defui } from "../src/interop/defui.ts";
import { deletePath, select, updatePath, type Path } from "../src/effects/paths.ts";
import { activePred, checkboxOf, effectPath, fire, not, shape } from "./helpers/interop-standins.ts";

// ---------------------------------------------------------------------------
// p_explicit_paths — derives_from: interop.model.paths_explicit_api
// generator: todos with an active filter
// predicate: the each helper gives the second visible item the path todos, filter, 1
// ---------------------------------------------------------------------------

it("p_explicit_paths: the each helper gives the second visible item the path todos, filter, 1", () => {
  const todos = [
    { description: "first", "complete?": false },
    { description: "second", "complete?": true },
    { description: "third", "complete?": false },
  ];
  const state = { todos };
  const $visible: Path = concatPath([["keypath", "todos"]], [filterNav(activePred)]);
  const visible = todos.filter(activePred);
  const seen: Array<[unknown, Path]> = [];
  each(visible, $visible, (todo, path) => {
    seen.push([todo, path]);
    return null;
  });
  expect(seen).toHaveLength(2);
  // the second visible item is "third", and its path is todos, filter, 1
  expect(seen[1]?.[0]).toBe(todos[2]);
  expect(seen[1]?.[1]).toEqual([["keypath", "todos"], ["filter", activePred], ["nth", 1]]);
  // and the handed path selects the same value from the state
  expect(select(state, seen[1]?.[1] as Path)).toBe(todos[2]);
});

// ---------------------------------------------------------------------------
// p_no_macro — derives_from: interop.model.no_macro_acceptance
// generator: todos first, second, third with third complete and an active filter
// predicate: deleting visible index 1 leaves first and third, and toggling
//   visible index 0 changes only first
// ---------------------------------------------------------------------------

// The explicit-path todo app: every state change is an effect carrying a
// path built only from concatPath / filterNav / each — no macro.
function todoRowsWithoutMacro(state: { todos: Record<string, unknown>[] }): readonly Record<string, unknown>[] {
  const visible = state.todos.filter(activePred);
  return each(visible, concatPath([["keypath", "todos"]], [filterNav(activePred)]), (todo, $todo) => ({
    text: todo && (todo as Record<string, unknown>)["description"],
    delete: () => [["delete", $todo]],
    checkbox: {
      "checked?": (todo as Record<string, unknown>)["complete?"],
      "on-mouse-down": () => [["update", concatPath($todo, [["keypath", "complete?"]]), not]],
    },
  })) as readonly Record<string, unknown>[];
}

it("p_no_macro: deleting visible index 1 leaves first and third, and toggling visible index 0 changes only first", () => {
  const state = {
    todos: [
      { description: "first", "complete?": false },
      { description: "second", "complete?": false },
      { description: "third", "complete?": true },
    ],
  };
  const rows = todoRowsWithoutMacro(state);
  expect(rows.map((r) => r["text"])).toEqual(["first", "second"]);
  // user taps delete on visible index 1 ("second") — leaves first and third
  const afterDelete = deletePath(state, effectPath(fire(rows[1]?.["delete"])));
  expect((afterDelete as typeof state).todos.map((t) => t["description"])).toEqual(["first", "third"]);
  // toggling visible index 0 changes only first
  const afterToggle = updatePath(state, effectPath(fire(checkboxOf(rows[0])?.["on-mouse-down"])), not);
  expect((afterToggle as typeof state).todos.map((t) => t["complete?"])).toEqual([true, false, true]);
});

// ---------------------------------------------------------------------------
// p_macro_optional — derives_from: interop.model.macro_optional_tier
// generator: the todo app written with and without the macro
// predicate: both produce deep-equal views and effects
// ---------------------------------------------------------------------------

it("p_macro_optional: the todo app written with and without the macro produce deep-equal views and effects", () => {
  const state = {
    todos: [
      { description: "first", "complete?": false },
      { description: "second", "complete?": false },
      { description: "third", "complete?": true },
    ],
  };
  const pred = activePred;

  // with the macro: components are written against destructured props with
  // auto-derived dollar bindings — the sugar desugars to the explicit API
  const TodoList = defui("todo-list", ["todos", "$todos", "selected-filter"], (props) => {
    const todos = props["todos"] as Record<string, unknown>[];
    const $todos = props["$todos"] as Path;
    const visible = todos.filter(pred);
    const TodoItem = defui("todo-item", ["todo", "$todo"], (p) => ({
      text: (p["todo"] as Record<string, unknown>)["description"],
      delete: () => [["delete", p["$todo"]]],
      checkbox: {
        "checked?": (p["todo"] as Record<string, unknown>)["complete?"],
        "on-mouse-down": () => [["update", concatPath(p["$todo"] as Path, [["keypath", "complete?"]]), not]],
      },
    }));
    // (the $todo path arrives from the each helper; the sugar derives $k only
    // when the caller did not pass it — an explicit pass always wins)
    return each(visible, concatPath($todos, [filterNav(pred)]), (todo, $todo) =>
      TodoItem({ todo, $todo }),
    ) as readonly Record<string, unknown>[];
  });
  const withMacro = TodoList({ todos: state.todos, "selected-filter": "active" }) as readonly Record<string, unknown>[];

  // without the macro: the same app hand-wired over the explicit path functions
  const withoutMacro = todoRowsWithoutMacro(state);

  // both produce deep-equal views (handlers compared as function slots —
  // two independently built views cannot share closure identity)
  expect(shape(withMacro)).toEqual(shape(withoutMacro));
  // and deep-equal effects: the same interactions emit identical batches
  expect(fire(withMacro[1]?.["delete"])).toEqual(fire(withoutMacro[1]?.["delete"]));
  expect(fire(checkboxOf(withMacro[0])?.["on-mouse-down"])).toEqual(
    fire(checkboxOf(withoutMacro[0])?.["on-mouse-down"]),
  );
  // and the emitted batches really apply: deleting visible 1 leaves first and third
  const afterDelete = deletePath(state, effectPath(fire(withMacro[1]?.["delete"])));
  expect((afterDelete as typeof state).todos.map((t) => t["description"])).toEqual(["first", "third"]);
});
