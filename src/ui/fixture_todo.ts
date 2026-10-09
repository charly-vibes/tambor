// Purpose: the mobile todo fixture of the ui-mobile layer — the
//   example.todo app re-laid-out by the mobile mapping rules: the root
//   is built from the container size (viewport_responsive), long
//   content sits inside a horizontal scrollview
//   (no_horizontal_overflow), and the primary action sits in the bottom
//   third (thumb_zone_actions).
// Responsibilities: the example.todo geometry the corpus pins — the
//   delete X (two 3 px red strokes, bounds 10 by 10), the todo-item row
//   (delete X at (5, 5), checkbox at (10, 4), a 10 px spacer, the
//   textarea), the toggle row and the todo-list spacing — plus the
//   mobile root: toggle, rows, and a bottom bar carrying the Add Todo
//   primary action; wide textareas are placed inside a real scrollview
//   region whose wrapper the overflow scan exempts.
// Rationale: the geometry and intents are openspec/specs/example-todo/spec.md's own
//   rows (delete_x_geometry, item_layout, toggle_render, list_spacing,
//   add_button) — this module adapts their arrangement to the mobile
//   viewport, never their semantics. The mobile arrangement is
//   ui-mobile.md's design authority: thumb_zone_actions moves the
//   primary action to a bottom bar, and no_horizontal_overflow places
//   unbounded content (a long description) inside a horizontal
//   scrollview. Test fixture for the ui-mobile contracts; the
//   example.todo contracts themselves remain their own spec's property
//   set. No behavior beyond the corpus.

import {
  bounds,
  button,
  checkbox,
  label as labelNode,
  on,
  path,
  spacer,
  translate,
  withColor,
  withStrokeWidth,
  type Color,
  type Elem,
  type Vec2,
} from "../views/model.ts";
import { horizontalLayout } from "../views/layout.ts";
import type { Path } from "../effects/paths.ts";
import { call, render } from "../model/component.ts";
import { scrollview } from "../components/scrollview/scrollview.ts";
import { textarea } from "../components/textarea/textarea.ts";
import { initialTextareaExtra } from "../components/textarea/edit.ts";
import { locate } from "./overflow.ts";

// The todo item shape of the example (example.todo).
export interface TodoItem {
  readonly description: string;
  readonly "complete?"?: boolean;
}

// The todo app state shape of the example.
export interface TodoState {
  readonly todos: readonly TodoItem[];
  readonly "next-todo-text": string;
  readonly "selected-filter": string;
}

// The example's initial data: first (open), second (open), third
// (complete) — or any items the caller supplies.
export function todoState(items: readonly TodoItem[] = []): TodoState {
  return {
    todos: items,
    "next-todo-text": "",
    "selected-filter": "all",
  };
}

// The delete X: two strokes of width 3 in red [1, 0, 0] from [0, 0] to
// [10, 10] and from [10, 0] to [0, 10]; bounds [10, 10]
// (delete_x_geometry).
export function deleteX(): Elem {
  const red: Color = [1, 0, 0];
  return [
    withStrokeWidth(3, withColor(red, path([0, 0], [10, 10]))),
    withStrokeWidth(3, withColor(red, path([10, 0], [0, 10]))),
  ];
}

// The paths a fixture row edits (filtered_paths_original keeps every
// path on the underlying list; the fixture uses the plain list path).
export const TODOS_PATH: Path = [["keypath", "todos"]];
export const NEXT_TEXT_PATH: Path = [["keypath", "next-todo-text"]];

// A textarea bound to a description path, unfocused, with the corpus's
// default one-cell measure (item_bindings).
function fixtureTextarea(text: string, textPath: Path): Elem {
  return textarea({
    text,
    textPath,
    extraPath: [["keypath", "extra"], ["keypath", "textarea"]],
    focus: null,
    state: initialTextareaExtra(),
    font: null,
    indexForPosition: () => 0,
    now: 0,
  }) as Elem;
}

// The todo-item row of the example: delete X at (5, 5) whose pointer
// down returns delete with the todo path, checkbox at (10, 4), a 10 px
// spacer, and the textarea (item_layout, delete_emits).
export function todoItem(todo: TodoItem, todoPath: Path): Elem {
  const x = on("mouse-down", () => [["delete", todoPath]], deleteX());
  const ta = fixtureTextarea(todo.description, [
    ...todoPath,
    ["keypath", "description"],
  ]);
  return horizontalLayout([
    translate(5, 5, x),
    translate(10, 4, checkbox(todo["complete?"] === true)),
    spacer(10, 0),
    ta,
  ])!;
}

// The scroll offset path of a fixture h-scroll region; the fixture
// never scrolls it (offset [0, 0]).
const HS_OFFSET: Path = [["keypath", "::extra"], ["keypath", "hscroll"]];

// The mobile root built from a container size (viewport_responsive).
export interface MobileTodoView {
  readonly view: Elem;
  /** identity test marking the horizontal scroll region wrappers */
  readonly exempt: (node: unknown) => boolean;
  /** the absolute rect of every textarea in the root */
  readonly textareaRects: readonly {
    readonly origin: Vec2;
    readonly size: Vec2;
  }[];
}

// The mobile todo root: the toggle row and the list in a content area,
// and a bottom bar carrying the Add Todo primary action in the bottom
// third (thumb_zone_actions). A description wider than the remaining
// row width is placed inside a horizontal scrollview
// (no_horizontal_overflow).
// The filter toggle row: selected plain, others gray, 5 px spacers
// (toggle_render).
function toggleRow(state: TodoState): Elem {
  const options = ["all", "active", "complete"] as const;
  const gray: Color = [0.8, 0.8, 0.8];
  const children: Elem[] = [];
  options.forEach((opt, i) => {
    if (i > 0) children.push(spacer(5, 0));
    children.push(
      opt === state["selected-filter"] ? labelNode(opt) : withColor(gray, labelNode(opt)),
    );
  });
  return horizontalLayout(children)!;
}

// Unbounded content goes inside a horizontal scrollview; otherwise the
// textarea is placed directly.
function rowRegion(
  ta: Elem,
  taW: number,
  taH: number,
  regionX: number,
  avail: number,
  exemptSet: Set<unknown>,
): Elem {
  if (taW <= avail) return translate(regionX, 0, ta);
  const sv = render(
    call(scrollview, {
      "scroll-bounds": [avail, taH],
      body: ta,
      $offset: HS_OFFSET,
      offset: [0, 0],
    }),
  ) as Elem;
  const region = translate(regionX, 0, sv);
  exemptSet.add(region);
  return region;
}

// One mobile row: the delete/checkbox prefix and the description
// textarea, wrapped in a horizontal scrollview when the content
// overflows the viewport. The rows are placed manually: a scroll
// region's layout bounds are its content's, not its viewport's, so the
// mobile layer owns the row heights instead of reading them through the
// event-layer region (list_spacing).
function todoRow(
  state: TodoState,
  i: number,
  vw: number,
  margin: number,
  exemptSet: Set<unknown>,
): { elem: Elem; height: number; ta: Elem } {
  const todo = state.todos[i] as TodoState["todos"][number];
  const todoPath: Path = [...TODOS_PATH, ["keypath", String(i)]];
  const ta = fixtureTextarea(todo.description, [...todoPath, ["keypath", "description"]]);
  const x = on("mouse-down", () => [["delete", todoPath]], deleteX());
  const prefix = horizontalLayout([
    translate(5, 5, x),
    translate(10, 4, checkbox(todo["complete?"] === true)),
    spacer(10, 0),
  ])!;
  const prefixW = bounds(prefix)[0];
  const [taW, taH] = bounds(ta);
  const regionX = prefixW + 1;
  const avail = Math.max(0, vw - 2 * margin - regionX);
  const region = rowRegion(ta, taW, taH, regionX, avail, exemptSet);
  return {
    elem: [prefix, region],
    height: Math.max(bounds(prefix)[1], taH),
    ta,
  };
}

// The bottom bar: the primary action in the thumb zone
// (thumb_zone_actions); its effects are the example's own (add_button).
function addTodoBar(state: TodoState, vh: number, margin: number): Elem {
  const barTextarea = fixtureTextarea(state["next-todo-text"], NEXT_TEXT_PATH);
  const barInner = horizontalLayout([
    button("Add Todo", () => [
      ["add-todo", TODOS_PATH, state["next-todo-text"]],
      ["set", NEXT_TEXT_PATH, ""],
    ]),
    spacer(10, 0),
    barTextarea,
  ])!;
  const barH = bounds(barInner)[1];
  return translate(margin, vh - margin - barH, barInner);
}

export function mobileTodoView(state: TodoState, size: Vec2): MobileTodoView {
  const [vw, vh] = size;
  const margin = 10;
  const exemptSet = new Set<unknown>();

  const toggle = toggleRow(state);
  const rows = state.todos.map((_, i) => todoRow(state, i, vw, margin, exemptSet));
  const taNodes = rows.map((r) => r.ta);
  const toggleH = bounds(toggle)[1];
  const placed: Elem[] = [translate(0, 0, toggle)];
  let y = toggleH + 1 + 5 + 1;
  for (const row of rows) {
    placed.push(translate(0, y, row.elem));
    y += row.height + 5 + 1;
  }

  const content = translate(margin, margin, placed);
  const bar = addTodoBar(state, vh, margin);
  const view: Elem = [content, bar];

  // every textarea's absolute rect, for the avoidance property
  const rects: { origin: Vec2; size: Vec2 }[] = [];
  for (const ta of taNodes) {
    const found = locate(view, ta);
    if (found) rects.push({ origin: found, size: bounds(ta) });
  }

  return {
    view,
    exempt: (node) => exemptSet.has(node),
    textareaRects: rects,
  };
}
