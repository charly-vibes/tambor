// Purpose: the example.todo app (openspec/specs/example-todo/spec.md) — the todo
//   views: the delete X, the todo-item row, the todo-list spacing, and
//   the filter fns and paths that keep every visible item's edits on
//   the underlying list.
// Responsibilities: deleteX (two 3 px red strokes, bounds [10, 10]);
//   todoItem (delete X at translate(5, 5) whose pointer down returns
//   delete with the todo path, a checkbox at translate(10, 4) bound to
//   the complete flag, a 10 px spacer and a textarea bound to the
//   description); todoList (a vertical layout with a spacer of height 5
//   interposed between rows, row offsets differing by row height plus 5
//   plus the gap); the filter fns (unfiltered shows every todo, active
//   shows complete? false, complete shows complete? true, an unknown
//   filter shows all) and the visible-row builder whose item paths are
//   todos then filter then seq-nth(j).
// Rationale: openspec/specs/example-todo/spec.md is the design authority — never
//   improvise semantics beyond its constraint rows. The central
//   subtlety is that the list shown is filter(filter-fn, todos), yet
//   every item path still reaches the original list: each row's $todo
//   is the todos path then the filter navigator then seq-nth of the
//   visible index, so select, set, toggle and delete reach the matching
//   original element (state.paths filter navigators). Pointer handlers
//   receive the local position and the event (the K5 additive ruling).
//   No behavior beyond the corpus.

import {
  bounds,
  button,
  checkbox,
  height,
  label as labelNode,
  on,
  path,
  spacer,
  translate,
  withColor,
  withStrokeWidth,
  type Color,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { Path, Pred } from "../../effects/paths.ts";
import { defeffect } from "../../effects/dispatch.ts";
import { wrapOn, type IntentList } from "../../events/bubble.ts";
import { textarea } from "../../components/textarea/textarea.ts";
import { initialTextareaExtra } from "../../components/textarea/edit.ts";
import { rowExtraPath, todoItem, toggle } from "./items.ts";

export { deleteX, todoItem, toggle } from "./items.ts";

// The todo item shape of the example.
export interface TodoItem {
  readonly description: string;
  readonly "complete?"?: boolean;
}

// The todo app state shape of the example; selected-filter defaults to
// the unfiltered option when absent (filter_default).
export interface TodoState {
  readonly todos: readonly TodoItem[];
  readonly "next-todo-text": string;
  readonly "selected-filter"?: string;
}

// The example's initial data: first (open), second (open), third
// (complete).
export function todoState(): TodoState {
  return {
    todos: [
      { description: "first", "complete?": false },
      { description: "second", "complete?": false },
      { description: "third", "complete?": true },
    ],
    "next-todo-text": "",
    "selected-filter": "all",
  };
}

// add-todo (add_appends): appends a todo with the carried description
// and complete? false to the end of the underlying list. Registered
// like any other effect, so app.dispatch applies it.
defeffect("add-todo", (dispatch, ...raw: unknown[]) => {
  const target = raw[0] as Path;
  const text = raw[1] as string;
  dispatch([
    "update",
    target,
    (todos: unknown) => [
      ...(todos as readonly TodoItem[]),
      { description: text, "complete?": false },
    ],
  ]);
});

// The state paths the app edits.
export const TODOS_PATH: Path = [["keypath", "todos"]];
export const NEXT_TEXT_PATH: Path = [["keypath", "next-todo-text"]];
export const FILTER_PATH: Path = [["keypath", "selected-filter"]];

// The toggle's options.
export const FILTER_OPTIONS = ["all", "active", "complete"] as const;

// The filter fns: unfiltered shows every todo, active shows todos with
// complete? false and complete shows todos with complete? true; an
// unknown filter name (or a missing one) shows all — the port's
// unknown_filter_all advisory, where the original fell back to a
// keyword that hides everything (filter_default, filter_fns,
// unknown_filter_all).
export function filterFn(name: string | undefined): Pred {
  switch (name) {
    case "active":
      return (t) => (t as TodoItem)["complete?"] !== true;
    case "complete":
      return (t) => (t as TodoItem)["complete?"] === true;
    default:
      return () => true;
  }
}

// The delete X and the item/toggle vocabulary live in ./items.ts;
// re-exported here (delete_x_geometry).

// The scratch of the new-todo textarea.
export const NEW_TODO_EXTRA_PATH: Path = [
  ["keypath", "::extra"],
  ["keypath", "textarea-new-todo"],
];

// The two effects the Add Todo button and the Enter shortcut both
// return (add_button, enter_adds).
function addTodoEffects(state: TodoState): IntentList {
  return [
    ["add-todo", TODOS_PATH, state["next-todo-text"]],
    ["set", NEXT_TEXT_PATH, ""],
  ];
}

// Deep equality for paths (the focus rule's comparison, reused to pin
// the Enter middleware to the new-todo textarea only).
function pathEqual(a: Path, b: Path): boolean {
  if (a.length !== b.length) return false;
  return a.every((step, i) => {
    const other = b[i] as readonly unknown[];
    if (!Array.isArray(step) || !Array.isArray(other)) return false;
    return step.length === other.length && step.every((v, j) => v === other[j]);
  });
}

// The todo-app view (new_todo_layout, filter_default): the Add Todo
// button and a new-todo textarea with an Enter shortcut — the textarea
// translated by (10, 10) beside the button's right edge — then a 10 px
// spacer, the toggle, a 10 px spacer, and the filtered list. The
// context focus flows to the textareas; a missing selected-filter
// defaults to the unfiltered option. The Enter middleware wraps the
// whole app as its root wrap-on node (event.bubble wrap_on_middleware):
// the laid-out body stays plain view nodes, and on the enter key the
// focused new-todo textarea's insert-newline intent is replaced with
// the Add Todo button's two effects (enter_adds,
// enter_unfocused_nothing, other_keys_default — any other key passes
// through to the textarea's default effects unchanged).
export function todoApp(state: TodoState, context: { focus?: unknown } = {}): Elem {
  const focus = context.focus ?? null;
  const btn = button("Add Todo", () => addTodoEffects(state));
  // the textarea is translated by (10, 10) beside the button's right edge
  const ta = translate(bounds(btn)[0] + 10, 10, textarea({
    text: state["next-todo-text"],
    textPath: NEXT_TEXT_PATH,
    extraPath: NEW_TODO_EXTRA_PATH,
    focus,
    state: initialTextareaExtra(),
    font: null,
    indexForPosition: () => 0,
    now: 0,
  }));
  const top: Elem = [btn, ta];
  const toggleRow = toggle(FILTER_OPTIONS, state["selected-filter"] ?? "all", FILTER_PATH);
  const list: Elem = todoList(todoRows(state));
  const body: Elem = verticalLayout([top, spacer(0, 10), toggleRow, spacer(0, 10), list]) ?? top;
  // the wrap-on root is an event-layer node: dispatch walks it, while
  // the laid-out body beneath stays plain view nodes — never sized by
  // views/model bounds
  return wrapOn(
    [
      [
        "key-press",
        (defaultHandler, key) => {
          if (key !== "enter") return defaultHandler();
          const inner = defaultHandler();
          const intent = inner.find(
            (candidate) =>
              Array.isArray(candidate) &&
              candidate[0] === "insert-newline" &&
              pathEqual(candidate[1] as Path, NEXT_TEXT_PATH),
          );
          if (intent === undefined) return inner;
          // enter_adds: the button's two effects replace the newline
          return [
            ...inner.filter((candidate) => candidate !== intent),
            ...addTodoEffects(state),
          ];
        },
      ],
    ],
    body,
  ) as unknown as Elem;
}
// The todo-list: a vertical layout with a spacer of height 5
// interposed between rows, so row offsets differ by row height plus 5
// plus the gap (list_spacing). Zero rows lay out to nothing
// (layout_empty_nil).
export function todoList(rows: readonly Elem[], gap = 1): readonly Elem[] | null {
  if (rows.length === 0) return null;
  const out: Elem[] = [rows[0] as Elem];
  let y = height(rows[0] as Elem) + gap;
  for (const row of rows.slice(1)) {
    out.push(translate(0, y, spacer(0, 5)));
    y += 5;
    out.push(translate(0, y, row));
    y += height(row) + gap;
  }
  return out;
}

// The rows the app shows: the todos under the selected filter's
// predicate, each carrying the path todos then filter then seq-nth of
// the visible index, so edits reach the matching original element
// (filtered_paths_original).
export function todoRows(state: TodoState, $todos: Path = TODOS_PATH): readonly Elem[] {
  const pred = filterFn(state["selected-filter"]);
  return state.todos
    .map((todo, i) => ({ todo, i }))
    .filter(({ todo }) => pred(todo))
    .map(({ todo, i }, visible) =>
      // the item shown at visible index j has the path todos then
      // filter then seq-nth(j): the filter navigator's sub-sequence is
      // the matching elements, so seq-nth(j) reaches the j-th visible
      // item at its original position
      todoItem(todo, [...$todos, ["filter", pred], ["seq-nth", visible]], rowExtraPath(visible)),
    );
}
