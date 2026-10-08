// Purpose: the todo-item row and the filter toggle of the example.todo
//   app.
// Responsibilities: rowExtraPath / ROW_EXTRA_PATH (the per-row textarea
//   scratch), todoItem (item_layout, item_bindings, delete_emits,
//   complete_toggles), and toggle (toggle_render, toggle_sets_filter).
// Rationale: specs/example-todo.md is the design authority. Split from
//   todo.ts so no file carries both the app shell and the item
//   vocabulary (tambor-272). No behavior beyond the corpus.

import {
  label as labelNode,
  on,
  spacer,
  withColor,
  checkbox,
  translate,
  withStrokeWidth,
  path,
  type Color,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout } from "../../views/layout.ts";
import type { Path } from "../../effects/paths.ts";
import { textarea } from "../../components/textarea/textarea.ts";
import { initialTextareaExtra } from "../../components/textarea/edit.ts";
import type { TodoItem } from "./todo.ts";

export function deleteX(): Elem {
  const red: Color = [1, 0, 0];
  return [
    withStrokeWidth(3, withColor(red, path([0, 0], [10, 10]))),
    withStrokeWidth(3, withColor(red, path([10, 0], [0, 10]))),
  ];
}

// The textarea scratch of a row's description editor, addressed by the
// visible index so rows never share editing state.

export function rowExtraPath(visibleIndex: number): Path {
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

