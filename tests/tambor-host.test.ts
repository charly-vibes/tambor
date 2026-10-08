// Purpose: executable contract test for the tambor root spec's
//   host-agnostic row — the todo example driven from TypeScript and
//   from ClojureScript, emitting the same effects with no conversion
//   calls.
// Responsibilities: encode the p_host row as a vitest test (tambor-5bc
//   ruling): the todo example is driven twice — once in TypeScript,
//   through the example's own handlers and the native effect
//   dispatcher; once as a ClojureScript program, whose data (keywords,
//   persistent maps) crosses the boundary unconverted through the
//   five-function data-ops seam.
// Rationale: specs/tambor.md is the design authority (tambor.host_
//   agnostic); the seam stand-ins live in tests/helpers/interop-
//   standins.ts. Split out of the former monolithic tests/tambor.test.ts
//   (tambor-272); the tree scans come from tests/helpers/scan.ts and the
//   app-view queries from tests/helpers/appview.ts, reused rather than
//   duplicated.

import { expect, it, vi } from "vitest";

import type { ButtonNode } from "../src/views/model.ts";
import { makeApp } from "../src/effects/dispatch.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import type { IntentList } from "../src/events/bubble.ts";
import {
  FILTER_OPTIONS,
  FILTER_PATH,
  NEXT_TEXT_PATH,
  TODOS_PATH,
  todoApp,
  todoItem,
  todoState,
  toggle,
  type TodoState,
} from "../src/examples/todo/todo.ts";
import { makeOpsApp } from "../src/interop/app.ts";
import {
  PMap,
  cljsOps,
  kw,
  not,
  pmap,
  toJs,
} from "./helpers/interop-standins.ts";
import { scanOf } from "./helpers/scan.ts";
import { centreOf, toggleOptionOf } from "./helpers/appview.ts";

// ---------------------------------------------------------------------
// p_host — derives_from: tambor.host_agnostic
// generator: the todo example from TypeScript and ClojureScript
// predicate: the same effects result with no conversion calls
// ---------------------------------------------------------------------
//
// Executable encoding (tambor-5bc ruling): the todo example is driven
// twice — once in TypeScript, through the example's own handlers and the
// native effect dispatcher; once as a ClojureScript program, whose data
// (keywords, persistent maps) crosses the boundary unconverted through
// the five-function data-ops seam. The same interactions emit the same
// effects (per tag), and applying them lands both hosts on deep-equal
// state, with the host data still host data (no conversion calls).
it("p_host: the same effects result with no conversion calls", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    // --- the todo example in TypeScript: its own handlers emit the batches
    const drafted: TodoState = { ...todoState(), "next-todo-text": "hello" };
    const tsView = todoApp(drafted, {});
    const btn = scanOf(tsView).find((f) => f.node.type === "button")!.node as ButtonNode;
    // interaction 1 — the Add Todo button
    const tsAdd = btn.onClick?.() as IntentList;
    expect(tsAdd).toEqual([["add-todo", TODOS_PATH, "hello"], ["set", NEXT_TEXT_PATH, ""]]);
    // interaction 2 — the second todo's checkbox
    const secondRow = todoItem(
      { description: "second", "complete?": false },
      [["keypath", "todos"], ["seq-nth", 1]],
    );
    const tsComplete = dispatch(secondRow, mouseDown([11, 5]));
    expect(tsComplete[0]![0]).toBe("update");
    // interaction 3 — the third todo's delete X
    const thirdRow = todoItem(
      { description: "third", "complete?": true },
      [["keypath", "todos"], ["seq-nth", 2]],
    );
    const tsDelete = dispatch(thirdRow, mouseDown([8, 8]));
    expect(tsDelete).toEqual([["delete", [["keypath", "todos"], ["seq-nth", 2]]]]);
    // interaction 4 — the active toggle option
    const toggleView = toggle(FILTER_OPTIONS, "all", FILTER_PATH);
    const activeOpt = toggleOptionOf(toggleView, "active");
    const tsFilter = dispatch(toggleView, mouseDown(centreOf(activeOpt)));
    expect(tsFilter).toEqual([["set", FILTER_PATH, "active"]]);

    const tsApp = makeApp({ view: () => null, state: todoState() });
    for (const batch of [tsAdd, tsComplete, tsDelete, tsFilter]) tsApp.dispatch(batch);

    // --- the same todo example in ClojureScript: keyword tags, keyword
    // keys, persistent-map todos — host data straight through the seam
    const kwTodos = kw(null, "todos");
    const kwComplete = kw(null, "complete?");
    const kwNext = kw(null, "next-todo-text");
    const kwFilter = kw(null, "selected-filter");
    const hostTodo = (description: string, complete: boolean): PMap =>
      pmap([["description", description], [kwComplete, complete]]);
    const cljsInitial = (): PMap =>
      pmap([
        ["todos", [hostTodo("first", false), hostTodo("second", false), hostTodo("third", true)]],
        [kwNext, ""],
        [kwFilter, "all"],
      ]);
    // the add-todo effect is host-written, like any ClojureScript
    // program's own effects: append a persistent-map todo
    const registry = new Map<string, (state: unknown, ...args: unknown[]) => unknown>();
    registry.set("add-todo", (state, ...args) => {
      const [path, text] = args as [readonly unknown[], string];
      const key = path[0];
      const todos = cljsOps.get(state, key) as unknown[];
      return cljsOps.assoc(state, key, [...todos, hostTodo(text, false)]);
    });
    const initial = cljsInitial();
    const firstTodo = (cljsOps.get(initial, kwTodos) as unknown[])[0];
    const opsApp = makeOpsApp({ state: initial, ops: cljsOps, registry });

    // the same interactions, emitted in the host's idiom: the same tags
    const hostBatches: readonly (readonly unknown[])[][] = [
      [[kw(null, "add-todo"), [kwTodos], "hello"], [kw(null, "set"), [kwNext], ""]],
      [[kw(null, "update"), [kwTodos, 1, kwComplete], not]],
      [[kw(null, "delete"), [kwTodos, 2]]],
      [[kw(null, "set"), [kwFilter], "active"]],
    ];
    const tsBatches: readonly IntentList[] = [tsAdd, tsComplete, tsDelete, tsFilter];
    // the same effects result: identical effect tags per interaction
    for (const [ts, host] of tsBatches.map((ts, i) => [ts, hostBatches[i]!] as const)) {
      expect(ts.map((e) => e[0])).toEqual(host.map((e) => cljsOps.tag(e[0])));
    }
    for (const batch of hostBatches) opsApp.dispatch(batch);

    // applying either side's batches lands both hosts on the same state
    const tsFinal = tsApp.getState() as TodoState;
    const hostFinal = opsApp.getState();
    expect(toJs(hostFinal)).toEqual(tsFinal);

    // ...with no conversion calls: the host data crossed the boundary
    // unconverted — the state is still a persistent map, its todos are
    // still persistent maps, and the untouched branch (first) kept its
    // reference identity through every dispatch
    expect(hostFinal).toBeInstanceOf(PMap);
    const finalTodos = cljsOps.get(hostFinal, kwTodos) as unknown[];
    expect(finalTodos).toHaveLength(3);
    expect(finalTodos[0]).toBe(firstTodo);
    expect(finalTodos[2]).toBeInstanceOf(PMap);
  } finally {
    logSpy.mockRestore();
  }
});
