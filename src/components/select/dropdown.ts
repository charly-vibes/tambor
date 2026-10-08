// Purpose: the dropdown component of components.select — the header
//   and the open?/close wrapper around dropdown-list, plus the select
//   effect's registration.
// Responsibilities: the dropdown declares selected, options, open? and
//   touch; open? is component-local state read from the per-call-site
//   extra scratch (the defui *open?* pattern); the header shows the
//   label of the first option whose value equals selected, or a gray
//   "no selection" when none matches or selected is nil; a pointer down
//   on the header returns the effect that updates open? with logical
//   not; an open dropdown renders the list; the select intent is
//   intercepted and expanded to select followed by the effect that
//   sets open? to false; the select effect sets the selected path to
//   the value.
// Rationale: specs/components-select.md is the design authority — never
//   improvise semantics beyond its constraint rows. The header toggle
//   is the update-with-not effect (header_toggles). The corpus
//   specifies gray for the no-selection text without a value; the color
//   constant here is a neutral gray (r = g = b).

import { defineComponent, type Props } from "../../model/component.ts";
import type { Path } from "../../effects/paths.ts";
import {
  label as labelNode,
  on,
  withColor,
  type Color,
  type Elem,
} from "../../views/model.ts";
import type { Options } from "./types.ts";

// The gray of the "no selection" text — the corpus says gray only.
export const NO_SELECTION_COLOR: Color = [0.6, 0.6, 0.6];
export const NO_SELECTION = "no selection";

// Logical not, the header toggle's update function (header_toggles).
export const not = (old: unknown): unknown => !old;

// The header shows the label of the first option whose value equals
// selected, and a gray no selection text when none matches or selected
// is nil (header_label).
function headerNode(selected: unknown, options: Options): Elem {
  const match = options.find(([value]) => value === selected);
  if (match !== undefined) return labelNode(match[1]);
  return withColor(NO_SELECTION_COLOR, labelNode(NO_SELECTION));
}

// The dropdown: header always; the list is part of the view only when
// open? is true (list_when_open). The select intent from the list is
// intercepted and expanded to select followed by set open? false
// (select_closes).
export const dropdown = defineComponent(
  "dropdown",
  [{ keys: ["selected", "options", "open?", "touch"] }],
  (props: Props) => {
    const selected = props["selected"];
    const options = props["options"] as Options;
    const $open = props["$open?"] as Path;

    // a pointer down on the header returns the effect that updates
    // open? with logical not (header_toggles)
    return on("mouse-down", () => [["update", $open, not]], headerNode(selected, options));
  },
);
