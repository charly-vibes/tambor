// Purpose: the todo-example scenario list consumed by the root
//   acceptance test (p_examples) — one Scenario per converted
//   TRACEABILITY row of example.todo, each built by its own small
//   scenario-runner function.
// Responsibilities: define the Scenario shape (state, view over it,
//   scripted routed events, state outcome), the app-view handler
//   queries the predicates read (delete-X handlers, checkbox handlers),
//   and one builder per todo scenario; todoScenarios() assembles the
//   list in row order.
// Rationale: openspec/specs/example-todo/spec.md is the design authority; the rows
//   are the converted todo.cljc scenarios. tambor-272 split the former
//   195-line todoScenarios() of tests/tambor.test.ts into these
//   builders so every function stays under the complexity budgets, and
//   the list lives in a helper because the acceptance test file alone
//   cannot carry it within the file-lines gate. View queries reuse
//   scanOf (tests/helpers/scan.ts) and centreOf/toggleOptionOf
//   (tests/helpers/appview.ts); rowDescriptionsOf comes from
//   tests/helpers/todo.ts.

import { expect } from "vitest";

import type { Elem, Label, Vec2, WithStrokeWidthNode } from "../../src/views/model.ts";
import type { IntentList } from "../../src/events/bubble.ts";
import {
  FILTER_PATH,
  NEW_TODO_EXTRA_PATH,
  NEXT_TEXT_PATH,
  TODOS_PATH,
  todoApp,
  todoState,
  type TodoState,
} from "../../src/examples/todo/todo.ts";
import { scanOf, type Found } from "./scan.ts";
import { centreOf, toggleOptionOf } from "./appview.ts";
import { rowDescriptionsOf } from "./todo.ts";

// One scenario of an example: a state, the example's view over it (built
// once and run unchanged on every backend), a scripted list of routed
// events, and the state outcome the corpus row states.
export interface Scenario {
  readonly name: string;
  readonly size: readonly [number, number];
  readonly state: unknown;
  readonly view: Elem;
  readonly steps: readonly {
    readonly pos?: Vec2;
    readonly key?: string;
    readonly check: (intents: IntentList) => void;
  }[];
  readonly expectState?: (after: unknown) => void;
}

// The delete-X handlers of an app view: handlers whose subtree draws a
// width-3 stroke (the delete X), in document order = visible row order.
function deleteHandlersOf(view: Elem): readonly Found[] {
  return scanOf(view).filter(
    (f) =>
      f.node.type === "handler" &&
      scanOf(f.node as Elem).some(
        (g) => g.node.type === "with-stroke-width" && (g.node as WithStrokeWidthNode).strokeWidth === 3,
      ),
  );
}

// The checkbox handlers of an app view, in visible row order.
function checkboxHandlersOf(view: Elem): readonly Found[] {
  return scanOf(view).filter(
    (f) => f.node.type === "handler" && scanOf(f.node as Elem).some((g) => g.node.type === "checkbox"),
  );
}

// "delete-X geometry / delete": click the first row's X — delete with
// the todo path; a click past it returns no delete; the list becomes
// second, third.
function todoDeleteFirstScenario(): Scenario {
  const del0 = deleteHandlersOf(todoApp(todoState(), {}))[0]!;
  return {
    name: "todo: the delete X deletes the first todo",
    size: [300, 300],
    state: todoState(),
    view: todoApp(todoState(), {}),
    steps: [
      {
        pos: [del0.x + 3, del0.y + 3],
        check: (is) => {
          expect(is).toHaveLength(1);
          expect(is[0]![0]).toBe("delete");
          const p = is[0]![1] as readonly unknown[];
          expect(p[0]).toEqual(["keypath", "todos"]);
          expect((p[1] as readonly unknown[])[0]).toBe("filter");
          expect(p[2]).toEqual(["seq-nth", 0]);
        },
      },
      {
        pos: [del0.x + 15, del0.y + 3],
        check: (is) => expect(is.some((e) => e[0] === "delete")).toBe(false),
      },
    ],
    expectState: (s) =>
      expect((s as TodoState).todos.map((t) => t.description)).toEqual(["second", "third"]),
  };
}

// "complete": click the second checkbox — only second becomes complete.
function todoCompleteSecondScenario(): Scenario {
  const cbs = checkboxHandlersOf(todoApp(todoState(), {}));
  return {
    name: "todo: the second checkbox completes only the second",
    size: [300, 300],
    state: todoState(),
    view: todoApp(todoState(), {}),
    steps: [
      {
        pos: [cbs[1]!.x + 1, cbs[1]!.y + 1],
        check: (is) => {
          expect(is).toHaveLength(1);
          expect(is[0]![0]).toBe("update");
          const p = is[0]![1] as readonly unknown[];
          expect(p[p.length - 1]).toEqual(["keypath", "complete?"]);
          expect(p[2]).toEqual(["seq-nth", 1]);
        },
      },
    ],
    expectState: (s) =>
      expect((s as TodoState).todos).toEqual([
        { description: "first", "complete?": false },
        { description: "second", "complete?": true },
        { description: "third", "complete?": true },
      ]),
  };
}

// "toggle and filter fns": click active — set selected-filter; a click
// on the selected label returns nothing.
function todoFilterClickScenario(): Scenario {
  const view = todoApp(todoState(), {});
  const activeOpt = toggleOptionOf(view, "active");
  const allPlain = scanOf(view).find(
    (f) =>
      f.node.type === "label" && (f.node as Label).text === "all" && !f.underColor && !f.underHandler,
  )!;
  return {
    name: "todo: clicking active selects it; clicking the selected one does nothing",
    size: [300, 300],
    state: todoState(),
    view,
    steps: [
      {
        pos: centreOf(activeOpt),
        check: (is) => expect(is).toEqual([["set", FILTER_PATH, "active"]]),
      },
      {
        pos: centreOf(allPlain),
        check: (is) => expect(is).toEqual([]),
      },
    ],
    expectState: (s) => {
      expect((s as TodoState)["selected-filter"]).toBe("active");
      // the next render under active shows first and second
      expect(rowDescriptionsOf(todoApp(s as TodoState, {}))).toEqual(["first", "second"]);
    },
  };
}

// "filtered list edits original list" (delete branch): under active,
// delete visible 1 — the original list becomes first, third.
function todoDeleteVisibleScenario(): Scenario {
  const withActive: TodoState = { ...todoState(), "selected-filter": "active" };
  const delHandlers = deleteHandlersOf(todoApp(withActive, {}));
  return {
    name: "todo: deleting visible 1 under active edits the original list",
    size: [300, 300],
    state: withActive,
    view: todoApp(withActive, {}),
    steps: [
      {
        pos: [delHandlers[1]!.x + 3, delHandlers[1]!.y + 3],
        check: (is) => {
          expect(is).toHaveLength(1);
          expect(is[0]![0]).toBe("delete");
          const p = is[0]![1] as readonly unknown[];
          expect(p[2]).toEqual(["seq-nth", 1]);
        },
      },
    ],
    expectState: (s) =>
      expect((s as TodoState).todos.map((t) => t.description)).toEqual(["first", "third"]),
  };
}

// "filtered list edits original list" (uncheck branch): under complete,
// uncheck the only visible todo — third is open and the next render
// shows no rows.
function todoUncheckVisibleScenario(): Scenario {
  const withComplete: TodoState = { ...todoState(), "selected-filter": "complete" };
  const cbHandlers = checkboxHandlersOf(todoApp(withComplete, {}));
  return {
    name: "todo: unchecking the only visible todo under complete empties the next render",
    size: [300, 300],
    state: withComplete,
    view: todoApp(withComplete, {}),
    steps: [
      {
        pos: [cbHandlers[0]!.x + 1, cbHandlers[0]!.y + 1],
        check: (is) => {
          expect(is).toHaveLength(1);
          expect(is[0]![0]).toBe("update");
          const p = is[0]![1] as readonly unknown[];
          expect(p[2]).toEqual(["seq-nth", 0]);
          expect(p[p.length - 1]).toEqual(["keypath", "complete?"]);
        },
      },
    ],
    expectState: (s) => {
      expect((s as TodoState).todos[2]).toEqual({ description: "third", "complete?": false });
      // the next render under complete shows no rows
      expect(rowDescriptionsOf(todoApp(s as TodoState, {}))).toEqual([]);
    },
  };
}

// "delete / complete / add": the Add Todo button emits add-todo then
// set next-todo-text "".
function todoAddButtonScenario(): Scenario {
  const drafted: TodoState = { ...todoState(), "next-todo-text": "hello" };
  const addBtn = scanOf(todoApp(drafted, {})).find((f) => f.node.type === "button")!;
  return {
    name: "todo: the Add Todo button adds then clears the draft",
    size: [300, 300],
    state: drafted,
    view: todoApp(drafted, {}),
    steps: [
      {
        pos: centreOf(addBtn),
        check: (is) =>
          expect(is).toEqual([["add-todo", TODOS_PATH, "hello"], ["set", NEXT_TEXT_PATH, ""]]),
      },
    ],
    expectState: (s) => {
      const todos = (s as TodoState).todos;
      expect(todos).toHaveLength(4);
      expect(todos[todos.length - 1]).toEqual({ description: "hello", "complete?": false });
      expect((s as TodoState)["next-todo-text"]).toBe("");
    },
  };
}

// "Enter via wrap-on": the focused textarea's Enter emits the button's
// effects.
function todoEnterScenario(): Scenario {
  const drafted: TodoState = { ...todoState(), "next-todo-text": "hello" };
  return {
    name: "todo: Enter on the focused new-todo textarea equals the button",
    size: [300, 300],
    state: drafted,
    view: todoApp(drafted, { focus: NEXT_TEXT_PATH }),
    steps: [
      {
        key: "enter",
        check: (is) =>
          expect(is).toEqual([["add-todo", TODOS_PATH, "hello"], ["set", NEXT_TEXT_PATH, ""]]),
      },
    ],
    expectState: (s) => expect((s as TodoState).todos).toHaveLength(4),
  };
}

// "Enter via wrap-on" (pass-through): any other key passes through to
// the textarea interpreter as insert-text.
function todoOtherKeyScenario(): Scenario {
  const drafted: TodoState = { ...todoState(), "next-todo-text": "hello" };
  return {
    name: "todo: any other key passes through to the textarea",
    size: [300, 300],
    state: drafted,
    view: todoApp(drafted, { focus: NEXT_TEXT_PATH }),
    steps: [
      {
        key: "x",
        check: (is) =>
          expect(is).toEqual([["insert-text", "x", NEXT_TEXT_PATH, NEW_TODO_EXTRA_PATH]]),
      },
    ],
    expectState: (s) => expect((s as TodoState).todos).toHaveLength(3),
  };
}

// --- the scenario list of example.todo (TRACEABILITY: todo.cljc) ---

// "delete-X geometry / delete": click the first row's X — delete with the
// todo path; a click past it returns no delete; the list becomes second,
// third. "complete": click the second checkbox — only second becomes
// complete. "toggle and filter fns": click active — set selected-filter;
// a click on the selected label returns nothing. "filtered list edits
// original list": under active, delete visible 1 — original becomes
// first, third; under complete, uncheck the only visible todo — third is
// open and the next render shows no rows. "delete / complete / add": the
// Add Todo button emits add-todo then set next-todo-text "". "Enter via
// wrap-on": the focused textarea's Enter emits the button's effects, and
// any other key passes through as insert-text.
export function todoScenarios(): readonly Scenario[] {
  return [
    todoDeleteFirstScenario(),
    todoCompleteSecondScenario(),
    todoFilterClickScenario(),
    todoDeleteVisibleScenario(),
    todoUncheckVisibleScenario(),
    todoAddButtonScenario(),
    todoEnterScenario(),
    todoOtherKeyScenario(),
  ];
}
