// Purpose: the file-selector example — the acceptance port of membrane's
//   src/membrane/example/file_selector.clj.
// Responsibilities: itemRow draws one item row — a horizontal layout of
//   a non-interactive checkbox translated by (5, 5), a 5 px spacer and
//   the name label — and its pointer down returns the built-in update
//   of its selected? path with logical not; itemSelector shows a
//   textarea bound to the filter, then the case-insensitively matching
//   rows, each wrapped in an on-update intercept that replaces the
//   row's built-in update with one update of the selected path that
//   removes the name if present and adds it otherwise; fileSelector is
//   the runner: a headless app over the item-selector whose stop reads
//   the final selection from the state, as file-selector does.
// Rationale: specs/example-file_selector.md is the design authority —
//   never improvise semantics beyond its constraint rows. The filter is
//   matched against the lower-cased name as given (the filter itself is
//   not lower-cased, filter_matches); str-filter defaults to the empty
//   string, which shows all items, and selected defaults to the empty
//   set (filter_defaults); a row's selected? is whether the name is a
//   member of the selected set (selected_membership); changing the
//   filter does not change the selected set
//   (selection_persists_under_filter). The intercepted update's
//   arguments are received positionally per event.bubble
//   intercept_args_spread and ignored — the replacement is the
//   set-membership update (intercept_builtin_effects). The filter
//   textarea is unfocused with a fresh extra map per render, the same
//   wiring the todo fixture uses (src/ui/fixture_todo.ts); the corpus
//   exercises the filter as a value, never the textarea's editing.

import {
  checkbox,
  label,
  on,
  spacer,
  translate,
  type Elem,
  type HandlerNode,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { Path } from "../../effects/paths.ts";
import { select } from "../../effects/paths.ts";
import { makeApp, type Effect } from "../../effects/dispatch.ts";
import { dispatch as dispatchEvent } from "../../events/dispatch.ts";
import type { TamborEvent } from "../../events/event.ts";
import type { IntentList } from "../../events/bubble.ts";
import { textarea } from "../../components/textarea/textarea.ts";
import { initialTextareaExtra, type TextareaExtra } from "../../components/textarea/edit.ts";

// Logical not — the row's built-in update function (row_default_toggle).
const not = (old: unknown): unknown => !old;

// The state paths of the runner: the selected set and the filter text.
export const SELECTED_PATH: Path = [["keypath", "selected"]];
export const STR_FILTER_PATH: Path = [["keypath", "str-filter"]];

// One item row: the checkbox drawn over a non-interactive ui checkbox
// (checkbox_view_only) translated by (5, 5), then a 5 px spacer, then
// the name label (row_layout). A pointer down returns the built-in
// update of the selected? path with logical not (row_default_toggle).
export function itemRow(
  itemName: string,
  selected: boolean,
  $selected: Path,
): HandlerNode {
  const layout = horizontalLayout([
    translate(5, 5, checkbox(selected)),
    spacer(5, 0),
    label(itemName),
  ])!;
  return on(
    "mouse-down",
    () => [["update", $selected, not]] as IntentList,
    layout,
  );
}

// The props of an item selector; every prop is optional and defaults
// per filter_defaults.
export interface ItemSelectorProps {
  /** the selected set; defaults to the empty set */
  readonly selected?: ReadonlySet<string>;
  /** the filter text; defaults to the empty string, which shows all items */
  readonly strFilter?: string;
  /** the selected path the intercepted update carries */
  readonly $selected?: Path;
  /** the filter path the textarea's text is bound to */
  readonly $strFilter?: Path;
}

// The toggle function of one item name: removes the name from the set
// if present and adds it otherwise (set_intercept).
function toggleSelected(itemName: string): (selected: unknown) => ReadonlySet<string> {
  return (selected) => {
    const next = new Set(selected as ReadonlySet<string>);
    if (next.has(itemName)) {
      next.delete(itemName);
    } else {
      next.add(itemName);
    }
    return next;
  };
}

// The item selector: a textarea bound to the filter above the
// case-insensitively matching rows. Each row is wrapped in an on-update
// intercept that replaces the row's built-in update — the intercepted
// arguments arrive positionally and are ignored — with one update of
// the selected path that removes the name if present and adds it
// otherwise (set_intercept, intercept_builtin_effects).
export function itemSelector(
  itemNames: readonly string[],
  props: ItemSelectorProps = {},
): readonly Elem[] {
  const selected = props.selected ?? new Set<string>();
  const strFilter = props.strFilter ?? "";
  const $selected = props.$selected ?? SELECTED_PATH;
  const $strFilter = props.$strFilter ?? STR_FILTER_PATH;

  // the filter textarea, unfocused, with a fresh extra map per render —
  // the same wiring the todo fixture uses; the text is bound to the
  // filter path
  const filterBox: Elem = textarea({
    text: strFilter,
    textPath: $strFilter,
    extraPath: [["keypath", "extra"], ["keypath", "textarea"]],
    focus: null,
    state: initialTextareaExtra() as TextareaExtra,
    font: null,
    indexForPosition: () => 0,
    now: 0,
  }) as Elem;

  const rows = itemNames
    .filter((name) => name.toLowerCase().includes(strFilter))
    .map((itemName) =>
      on(
        "update",
        (..._args: readonly unknown[]): IntentList => [
          ["update", $selected, toggleSelected(itemName)],
        ],
        itemRow(itemName, selected.has(itemName), [["keypath", "selected?"]]),
      ),
    );

  return verticalLayout([filterBox, ...rows])!;
}

// A running file selector: the app wire plus the stop that
// reads the final selection from the state (result_is_state).
export interface FileSelectorSession {
  /** one routed event: dispatch the view tree and apply the intents */
  send(event: TamborEvent): void;
  /** the current view tree */
  render(): Elem;
  /** apply effects against the state in order */
  dispatch(effects: readonly Effect[]): void;
  /** the app's state */
  getState(): unknown;
  /** the final selection, read from the state after the app stops */
  stop(): ReadonlySet<string>;
}

// The file-selector runner: a make-app instance whose state holds
// item-names, str-filter (empty) and selected (empty); the view reads
// the state at render time, and send routes an event through the view
// tree and applies the resulting intents. Stopping returns the
// selection from the state, as file-selector does (result_is_state).
export function fileSelector(itemNames: readonly string[]): FileSelectorSession {
  const app = makeApp({
    state: {
      "item-names": itemNames,
      "str-filter": "",
      selected: new Set<string>(),
    },
    view: (state) => {
      const s = state as Record<string, unknown>;
      return itemSelector(s["item-names"] as readonly string[], {
        selected: s.selected as ReadonlySet<string>,
        strFilter: s["str-filter"] as string,
        $selected: SELECTED_PATH,
        $strFilter: STR_FILTER_PATH,
      });
    },
  });

  return {
    send: (event) => {
      const intents = dispatchEvent(app.view(), event);
      if (intents.length > 0) app.dispatch(intents);
    },
    render: () => app.view(),
    dispatch: (effects) => app.dispatch(effects),
    getState: () => app.getState(),
    stop: () => select(app.getState(), SELECTED_PATH) as ReadonlySet<string>,
  };
}
