// Purpose: the todo demo's expected-pass properties — the rows the stage
//   draws always equal the rows the model says the selected filter shows,
//   and the drawn text stays readable and its targets tappable (design
//   D2: properties ship green at HEAD, so a red run is a new finding).
// Responsibilities: derive the expected visible-row count from
//   `__tambor.state()` (the `todos` array under the selected filter,
//   mirroring examples/todo/todo.ts's filterFn and todoRows); count the
//   drawn rows from the delete X every todoItem renders; assert the
//   closure form from tasks.md 3.2 over consecutive states; assert the
//   visual floors from lib/visual.ts (`contrastViolations === 0` for the
//   filter/row labels, `undersizedTargets === 0` for the Add Todo button);
//   export the shared stage actions, one todo-scoped click generator and
//   the safety properties.
// Rationale: the model is the app's own state (design D5), while the
//   drawn count is the DomBackend's DOM ground truth, so the property is
//   a genuine model/DOM agreement check — not a DOM-text heuristic. The
//   closure form catches both a wrong draw at the captured state and a
//   draw that lags the model by one captured state. The visual floors
//   cover what the model cannot: an unselected filter label is gray text
//   on the page surface, and the one real <button> must clear 44x44.
//   The delete-X row marker's emitted-DOM shape lives in
//   ./lib/todo-strokes.ts; a change to the X's ink, width or geometry
//   re-derives that module and this file with it.

import { always, next, now } from "@antithesishq/bombadil";
import type { ActionGenerator } from "@antithesishq/bombadil";
import {
  actions,
  extract,
  getFingerprint,
  weighted,
} from "@antithesishq/bombadil/browser";
import type {
  ActionTemplate,
  Fingerprint,
  State,
} from "@antithesishq/bombadil/browser";
import { handle } from "./lib/model.ts";
import { deleteStrokes } from "./lib/todo-strokes.ts";
import { visualFacts } from "./lib/visual.ts";
import {
  mounted,
  readStageGeometry,
  validStagePoint,
  STAGE_SELECTOR,
  type StageGeometry,
  type StagePoint,
} from "./lib/stage.ts";

// The safety properties (noConsoleErrors, noUncaughtExceptions, ...) and
// the composite stage-scoped action generator. The individual stage
// generators are not re-exported: `stageActions` already composes them,
// and the default action generators are deliberately absent (they would
// click the demo nav and leave the selected demo).
export {
  noConsoleErrors,
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
  stageActions,
} from "./lib/actions.ts";

// --- expected rows: the model --------------------------------------------

type ExpectedRows = {
  readonly filter: string;
  readonly todos: number;
  readonly visible: number;
};

// The app's `complete?` flag (examples/todo/todo.ts): only a literal true
// counts as done, so a missing flag or a non-todo entry is not complete.
function isComplete(todo: unknown): boolean {
  return (
    typeof todo === "object" &&
    todo !== null &&
    (todo as Record<string, unknown>)["complete?"] === true
  );
}

type TodoFilter = (todo: unknown) => boolean;

// The filter fns of examples/todo/todo.ts (filterFn), as a lookup table:
// `active` shows todos whose complete? is not true, `complete` shows the
// ones whose complete? is true, and `all` — also the default for every
// other/missing name — shows all. Each visible todo renders one todoItem,
// hence one delete X.
const ALL_TODOS: TodoFilter = () => true;

const FILTER_FNS: Readonly<Record<string, TodoFilter | undefined>> = {
  all: ALL_TODOS,
  active: (todo) => !isComplete(todo),
  complete: isComplete,
};

function expectedVisibleRows(state: unknown): ExpectedRows | null {
  if (typeof state !== "object" || state === null) return null;
  const record = state as Record<string, unknown>;
  const todos = record["todos"];
  if (!Array.isArray(todos)) return null;
  const rawFilter = record["selected-filter"];
  const filter = typeof rawFilter === "string" ? rawFilter : "all";
  const shows = FILTER_FNS[filter] ?? ALL_TODOS;
  return { filter, todos: todos.length, visible: todos.filter(shows).length };
}

// One observation per captured state. Everything is JSON-safe: the demo
// name and filter are strings, the counts numbers, `paired` a boolean.
// `filter` and `todos` are diagnostics the trace records (they are what
// showed filter switches and add/delete transitions in a run); the
// property itself only compares `expected` with `rows`.
type TodoObservation = {
  readonly demo: string | null;
  readonly stagePresent: boolean;
  readonly filter: string | null;
  readonly todos: number | null;
  readonly expected: number | null;
  readonly strokes: number;
  readonly rows: number;
  readonly paired: boolean;
};

function readTodoObservation(state: State): TodoObservation {
  const root = state.document.querySelector(STAGE_SELECTOR);
  // The handle is absent before the mount publishes it and `demo` names
  // the demo that actually mounted; only the todo demo's state carries
  // `todos`, so an unexpected demo degrades to "no model", never to a
  // comparison against another demo's rows.
  const current = handle();
  const demo = current === null ? null : current.demo;
  const model =
    current !== null && demo === "todo"
      ? expectedVisibleRows(current.state())
      : null;
  const strokes = root === null ? 0 : deleteStrokes(root).length;
  return {
    demo,
    stagePresent: root !== null,
    filter: model === null ? null : model.filter,
    todos: model === null ? null : model.todos,
    expected: model === null ? null : model.visible,
    strokes,
    rows: Math.floor(strokes / 2),
    paired: strokes % 2 === 0,
  };
}

const todoObservation = extract<TodoObservation>(readTodoObservation);

// --- todo-scoped click targets -------------------------------------------

// The filter toggle's option labels (toggle_render): drawn as leaf spans
// whose text is exactly the option name. `Add Todo` is the one real
// <button> the todo stage draws. The delete X is aimed at the left strip
// of its 10x10 stroke box (see deleteTargetAt); both strokes share that
// box, so the pair yields one point per row.
const FILTER_OPTIONS: Readonly<Record<string, true>> = {
  all: true,
  active: true,
  complete: true,
};
const ADD_BUTTON_TEXT = "Add Todo";

// The X box's CENTRE is not clickable as a delete: todoItem draws the X
// at row-local (5, 5) (10x10) and the checkbox at (10, 4) (12x12), so the
// boxes overlap for row-local x >= 10, and pointer delivery tries children
// last-to-first — a centre click hits the checkbox and toggles complete?
// instead of deleting (found by trace: svg clicks only ever grew the
// todo count). Row-local x in [5, 10) is outside the checkbox box, so the
// point is inset from the X's left edge and vertically centred.
const DELETE_POINT_INSET = 2;

type TodoTargetKind = "add" | "delete" | "filter";

// `kind` routes the target to its weighted generator, `option` names the
// filter option for the trace, and the fingerprint + point are the Click
// payload (fingerprint = the clicked element, point = its screen point).
type TodoTarget = {
  readonly kind: TodoTargetKind;
  readonly option: string;
  readonly fingerprint: Fingerprint;
  readonly point: StagePoint;
};

function targetAt(
  element: Element,
  kind: TodoTargetKind,
  option: string,
  geometry: StageGeometry,
  point: StagePoint,
): TodoTarget | null {
  // Same admission rule as lib/actions.ts: inside the drawn root AND the
  // viewport. Rows below the fold are simply not clickable.
  if (!validStagePoint(point, geometry)) return null;
  return { kind, option, fingerprint: getFingerprint(element), point };
}

function centreOf(element: Element): StagePoint | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// The delete X's box, aimed at its left strip (see DELETE_POINT_INSET).
function deleteTargetAt(
  svg: Element,
  geometry: StageGeometry,
): TodoTarget | null {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return targetAt(svg, "delete", "", geometry, {
    x: rect.left + DELETE_POINT_INSET,
    y: rect.top + rect.height / 2,
  });
}

// A leaf element's own text; the toggle's option label is a text-only span.
function leafText(element: Element): string | null {
  return element.childElementCount > 0 ? null : (element.textContent ?? "");
}

// Filter targets in DOM order: one per drawn option label inside the root.
function filterTargets(
  root: Element,
  geometry: StageGeometry,
): TodoTarget[] {
  const targets: TodoTarget[] = [];
  for (const span of root.querySelectorAll("span")) {
    const text = leafText(span);
    if (text === null || FILTER_OPTIONS[text] !== true) continue;
    const point = centreOf(span);
    const target =
      point === null ? null : targetAt(span, "filter", text, geometry, point);
    if (target !== null) targets.push(target);
  }
  return targets;
}

// Add targets in DOM order: the stage's one `Add Todo` button.
function addTargets(root: Element, geometry: StageGeometry): TodoTarget[] {
  const targets: TodoTarget[] = [];
  for (const button of root.querySelectorAll("button")) {
    if ((button.textContent ?? "") !== ADD_BUTTON_TEXT) continue;
    const point = centreOf(button);
    const target =
      point === null ? null : targetAt(button, "add", "", geometry, point);
    if (target !== null) targets.push(target);
  }
  return targets;
}

// Delete targets in DOM order, one per row: both diagonals of a row's X
// share one box, so the rounded left-strip point is the dedupe key.
function deleteTargets(root: Element, geometry: StageGeometry): TodoTarget[] {
  const targets: TodoTarget[] = [];
  const seen: Set<string> = new Set();
  for (const stroke of deleteStrokes(root)) {
    const box = stroke.parentElement;
    if (box === null) continue;
    const target = deleteTargetAt(box, geometry);
    if (target === null) continue;
    const key = `${Math.round(target.point.x)}:${Math.round(target.point.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }
  return targets;
}

// Runs inside the page once per captured state, like every extractor. The
// emitted order is the concatenation order below: option labels, then the
// add button, then row deletes.
function collectTodoTargets(state: State): TodoTarget[] {
  const root = state.document.querySelector(STAGE_SELECTOR);
  if (root === null) return [];
  const geometry = readStageGeometry(state);
  return [
    ...filterTargets(root, geometry),
    ...addTargets(root, geometry),
    ...deleteTargets(root, geometry),
  ];
}

const todoTargets = extract<TodoTarget[]>(collectTodoTargets);

// One generator per target kind, weighted so filters, adds and deletes all
// get sampled in a short run (a uniform pool over every row would starve
// the two singleton targets as the list grows).
function clickGeneratorOf(
  kind: TodoTargetKind,
): ActionGenerator<ActionTemplate> {
  const generate = actions((): ActionTemplate[] => {
    if (!mounted.current) return [];
    const selected = todoObservation.current.filter;
    return todoTargets.current
      .filter(
        (target) =>
          target.kind === kind &&
          // the selected option's label carries no handler (toggle_render),
          // so its click yields no intent — not a transition worth a step.
          (kind !== "filter" || selected === null || target.option !== selected),
      )
      .map((target) => ({
        Click: { fingerprint: target.fingerprint, point: target.point },
      }));
  });
  return generate.when(mounted);
}

// The todo transitions this property needs to see: filter switches (the
// selected option is excluded), add clicks, and row deletes.
export const todoActions = weighted([
  [4, clickGeneratorOf("filter")],
  [4, clickGeneratorOf("add")],
  [6, clickGeneratorOf("delete")],
]).when(mounted);

// --- the property ---------------------------------------------------------

// Agreement holds only when the model is readable and the drawn strokes
// form whole pairs. `expected !== null` implies the demo was `todo`.
function agrees(observed: TodoObservation): boolean {
  if (observed.expected === null) return true;
  return observed.paired && observed.rows === observed.expected;
}

// Closure form (tasks.md 3.2): remember the observation at evaluation time,
// then require the NEXT captured state to agree with its own model. The
// first state must already agree (the `now` body returns false), and the
// `next` check catches a draw that lags the model by one capture. The
// transition deltas need no separate clause: if both states agree with
// their models, `drawn_n - drawn_prev` equals `expected_n - expected_prev`
// by arithmetic.
//
// Guards: a state before the demo mounts, or without the debug handle,
// cannot be compared and passes vacuously — the property observes, it does
// not fabricate an expectation. The demo gate keeps another demo's stage
// (after a hypothetical nav) from being judged against the todo model.
export const todoRowsMatchModel = always(
  now(() => {
    const observed = todoObservation.current;
    if (!observed.stagePresent || observed.demo !== "todo") return true;
    if (!agrees(observed)) return false;
    return next(() => {
      const current = todoObservation.current;
      if (!current.stagePresent || current.demo !== "todo") return true;
      return agrees(current);
    });
  }),
);

// --- visual floors --------------------------------------------------------

// Readability (lib/visual.ts): every drawn label must clear WCAG AA
// against the surface behind it. The todo stage's gray is the risk case —
// an unselected filter option renders as gray TEXT (no fill), so it is
// measured against the page surface, not against another demo's ink.
// Gated on mount: the pre-mount placeholder has no stage and the
// extractor's zeroed counts must not fail the property.
export const textReadable = always(
  now(() => {
    const facts = visualFacts.current;
    return !facts.stagePresent || facts.contrastViolations === 0;
  }),
);

// Reachability: the stage's one real <button> (`Add Todo`) is drawn at the
// corpus button_bounds, so a sub-44px box is an emitted-DOM regression.
export const touchTargets = always(
  now(() => {
    const facts = visualFacts.current;
    return !facts.stagePresent || facts.undersizedTargets === 0;
  }),
);