// Purpose: the example.todo app (specs/example-todo.md) — the todo
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
// Rationale: specs/example-todo.md is the design authority — never
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
import { wrapOn, type EventElem, type IntentList } from "../../events/bubble.ts";
import { textarea } from "../../components/textarea/textarea.ts";
import { initialTextareaExtra } from "../../components/textarea/edit.ts";

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

// The delete X: two strokes of width 3 in red [1, 0, 0] from [0, 0] to
// [10, 10] and from [10, 0] to [0, 10]; bounds [10, 10]
// (delete_x_geometry). A plain view — it handles nothing itself.
export function deleteX(): Elem {
  const red: Color = [1, 0, 0];
  return [
    withStrokeWidth(3, withColor(red, path([0, 0], [10, 10]))),
    withStrokeWidth(3, withColor(red, path([10, 0], [0, 10]))),
  ];
}

// The textarea scratch of a row's description editor, addressed by the
// visible index so rows never share editing state.
function rowExtraPath(visibleIndex: number): Path {
  return [
    ["keypath", "::extra"],
    ["keypath", `textarea-${visibleIndex}`],
  ];
}

// The default scratch for a standalone row (tests, single-item views).
const ROW_EXTRA_PATH: Path = [
  ["keypath", "::extra"],
  ["keypath", "textarea-0"],
];

// The todo-item row (item_layout, item_bindings, delete_emits,
// complete_toggles): the delete X translated by (5, 5) whose pointer
// down returns exactly delete with the todo path, the checkbox
// translated by (10, 4) bound to the todo's complete flag, a 10 px
// spacer, and the textarea bound to the description — the binding
// paths run through the todo path.
export function todoItem(todo: TodoItem, $todo: Path, extraPath: Path = ROW_EXTRA_PATH): Elem {
  const del = on("mouse-down", () => [["delete", $todo]], deleteX());
  const complete: Path = [...$todo, ["keypath", "complete?"]];
  const cb = on(
    "mouse-down",
    () => [["update", complete, (flag: unknown) => !(flag as boolean)]],
    checkbox(todo["complete?"] === true),
  );
  const ta = textarea({
    text: todo.description,
    textPath: [...$todo, ["keypath", "description"]],
    extraPath,
    focus: null,
    state: initialTextareaExtra(),
    font: null,
    indexForPosition: () => 0,
    now: 0,
  });
  // the checkbox draws 12 wide, so the 10 px spacer follows at its
  // right edge and the textarea after it
  const spacerX = 10 + 12;
  return [
    translate(5, 5, del),
    translate(10, 4, cb),
    translate(spacerX, 0, spacer(10, 0)),
    translate(spacerX + 10, 0, ta),
  ];
}

// The gray of the unselected toggle options (toggle_render).
const GRAY: Color = [0.8, 0.8, 0.8];

// The toggle (toggle_render, toggle_sets_filter): the option labels,
// the selected one plain and the others gray and clickable, separated
// by 5 px spacers; clicking a non-selected option returns set with the
// selected path and that option, and the selected option itself handles
// nothing.
export function toggle(
  options: readonly string[],
  selected: string,
  $selected: Path,
): Elem {
  const out: Elem[] = [];
  options.forEach((opt, i) => {
    if (i > 0) out.push(spacer(5, 0));
    if (opt === selected) {
      out.push(labelNode(opt));
    } else {
      out.push(
        on("mouse-down", () => [["set", $selected, opt]], withColor(GRAY, labelNode(opt))),
      );
    }
  });
  return horizontalLayout(out);
}

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

// The new-todo textarea with the Enter shortcut (enter_adds,
// enter_unfocused_nothing, other_keys_default): wrap-on middleware — on
// the enter key, when the focused textarea's default handler returns
// its insert-newline intent, the same two effects as the Add Todo
// button are returned instead; any other key passes through to the
// textarea's default effects unchanged.
function newTodoTextarea(state: TodoState, focus: unknown): Elem {
  return textarea({
    text: state["next-todo-text"],
    textPath: NEXT_TEXT_PATH,
    extraPath: NEW_TODO_EXTRA_PATH,
    focus,
    state: initialTextareaExtra(),
    font: null,
    indexForPosition: () => 0,
    now: 0,
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
// the Add Todo button's two effects.
export function todoApp(state: TodoState, context: { focus?: unknown } = {}): Elem {
  const focus = context.focus ?? null;
  const btn = button("Add Todo", () => addTodoEffects(state));
  // the textarea is translated by (10, 10) beside the button's right edge
  const ta = translate(bounds(btn)[0] + 10, 10, newTodoTextarea(state, focus));
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
