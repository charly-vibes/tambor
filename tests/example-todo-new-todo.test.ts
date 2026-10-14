// Purpose: executable contract tests for the example-todo spec's
//   new-todo row — the enter shortcut, its unfocused and other-key
//   fallthroughs, and the row's layout geometry.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: openspec/specs/example-todo/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every test carries the spec's example
//   value verbatim plus a generalized fast-check property where the row
//   states a general rule. New file (tambor-8rq): batched contract
//   attribution surfaced these bindings as never having run — the
//   pre-batching exit-code path passed zero-match invocations vacuously
//   (vitest exits 0 when --testNamePattern matches nothing), while the
//   batched attribution correctly reports no-tests-ran.

import { expect, it } from "vitest";
import fc from "fast-check";

import { dispatch } from "../src/events/dispatch.ts";
import { keyPress } from "../src/events/event.ts";
import { bounds, height, type ButtonNode, type Elem, type TranslateNode } from "../src/views/model.ts";
import {
  NEW_TODO_EXTRA_PATH,
  NEXT_TEXT_PATH,
  todoApp,
  todoState,
} from "../src/examples/todo/todo.ts";
import { findNode } from "./helpers/scan.ts";
import { viewBody } from "./helpers/todo.ts";

// p_enter — derives_from: example.todo.enter_adds
// generator: focused new-todo textarea and the enter key —
// predicate: effects equal those of the button
it("p_enter: effects equal those of the button", () => {
  // The spec's example value must hold verbatim.
  const state = { ...todoState(), "next-todo-text": "hello" };
  const view = todoApp(state, { focus: NEXT_TEXT_PATH });
  const btn = findNode(view, (f) => f.node.type === "button")!.node as ButtonNode;
  expect(dispatch(view, keyPress("enter"))).toEqual(btn.onClick?.());

  // Generalized property: for every drafted text, the focused enter key
  // returns exactly the button's effects.
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 20 }), (text) => {
      const s = { ...todoState(), "next-todo-text": text };
      const v = todoApp(s, { focus: NEXT_TEXT_PATH });
      const b = findNode(v, (f) => f.node.type === "button")!.node as ButtonNode;
      expect(dispatch(v, keyPress("enter"))).toEqual(b.onClick?.());
    }),
  );
});

// p_enter_unfocused — derives_from: example.todo.enter_unfocused_nothing
// generator: unfocused textarea and enter — predicate: no effects
it("p_enter_unfocused: no effects", () => {
  // The spec's example value must hold verbatim: no focus in context.
  const view = todoApp(todoState(), {});
  expect(dispatch(view, keyPress("enter"))).toEqual([]);

  // Generalized property: with no focus, enter never has effects,
  // whatever is drafted.
  fc.assert(
    fc.property(fc.string({ maxLength: 20 }), (text) => {
      const v = todoApp({ ...todoState(), "next-todo-text": text }, {});
      expect(dispatch(v, keyPress("enter"))).toEqual([]);
    }),
  );
});

// p_other_keys — derives_from: example.todo.other_keys_default
// generator: focused and the key x — predicate: the textarea default
// insert-text effect is returned
it("p_other_keys: the textarea default insert-text effect is returned", () => {
  // The spec's example value must hold verbatim: focused and the key x.
  const view = todoApp(todoState(), { focus: NEXT_TEXT_PATH });
  expect(dispatch(view, keyPress("x"))).toEqual([
    ["insert-text", "x", NEXT_TEXT_PATH, NEW_TODO_EXTRA_PATH],
  ]);

  // Generalized property: any other insertable key passes through to
  // the textarea's default effect unchanged — the middleware only
  // intercepts enter.
  fc.assert(
    fc.property(fc.constantFrom("a", "9", " ", "-", "z"), (key) => {
      const v = todoApp(todoState(), { focus: NEXT_TEXT_PATH });
      expect(dispatch(v, keyPress(key))).toEqual([
        ["insert-text", key, NEXT_TEXT_PATH, NEW_TODO_EXTRA_PATH],
      ]);
    }),
  );
});

// p_new_todo_layout — derives_from: example.todo.new_todo_layout
// generator: initial state — predicate: top row textarea origin is
// [10, 10] relative to the button's right edge and the toggle is below it
it("p_new_todo_layout: top row textarea origin is [10, 10] relative to the button's right edge and the toggle is below it", () => {
  // The spec's example value must hold verbatim: the initial state.
  const view = todoApp(todoState(), {});
  const body = viewBody(view) as readonly Elem[];
  const row = body[0] as readonly Elem[];
  const btn = row[0];
  const ta = row[1] as TranslateNode;
  // the textarea is translated by (10, 10) from the button's right edge
  expect([ta.x, ta.y]).toEqual([bounds(btn)[0] + 10, 10]);
  // the toggle row sits below the top row (after the 10 px spacer)
  const toggleRow = body[2] as TranslateNode;
  expect(toggleRow.y).toBeGreaterThan(height(row));

  // Generalized property: the geometry is independent of the drafted
  // text — the textarea keeps its origin relative to the button's right
  // edge and the toggle stays below, for every text.
  fc.assert(
    fc.property(fc.string({ maxLength: 20 }), (text) => {
      const v = todoApp({ ...todoState(), "next-todo-text": text }, {});
      const kids = viewBody(v) as readonly Elem[];
      const topRow = kids[0] as readonly Elem[];
      const b = topRow[0];
      const t = topRow[1] as TranslateNode;
      expect([t.x, t.y]).toEqual([bounds(b)[0] + 10, 10]);
      expect((kids[2] as TranslateNode).y).toBeGreaterThan(height(topRow));
    }),
  );
});
