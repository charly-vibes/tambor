// Purpose: the dropdown-list component of components.select — the open
//   list of rows.
// Responsibilities: the list box and its rows: row width is the widest
//   label plus 24, a row is label height plus 4 tall, the box has 8
//   padding on y and rounded corners of 4 (list_geometry); rows are at
//   least 44 px tall on touch devices (touch_rows); a pointer down on a
//   row returns select with the selected path and the row value
//   (row_select_effect); the selected row has a blue fill with a white
//   label and a hovered row a light gray fill (row_visuals); per-row
//   hover flags live in extra keyed by the row's hover key, entered on
//   mouse-move over the body and left on a global mouse-move outside
//   (row_hover_keyed, with the effect shapes from components.hover).
// Rationale: specs/components-select.md is the design authority — never
//   improvise semantics beyond its constraint rows. The box is the list
//   node: a rounded rectangle behind the rows, so a rounded-rectangle
//   presence in the tree is what "the list is part of the view" reads
//   as. Each row draws a spacer at its full extent so the row is
//   clickable across its width without inventing fills for plain rows.
//   The corpus pins the selected blue [0, 0.48, 1], the hovered light
//   gray [0.976, 0.976, 0.976] and the white label.

import { defineComponent, type Props } from "../../model/component.ts";
import type { Path } from "../../effects/paths.ts";
import { MIN_TARGET } from "../../app/touch.ts";
import {
  label as labelNode,
  on,
  rectangle,
  roundedRectangle,
  spacer,
  translate,
  withColor,
  type Color,
  type Elem,
  type Vec2,
} from "../../views/model.ts";
import type { Options } from "./types.ts";
import { hoverFlag, hoverKey } from "./hover.ts";

// row_visuals colors, pinned by the corpus.
export const SELECTED_FILL: Color = [0, 0.48, 1];
export const HOVER_FILL: Color = [0.976, 0.976, 0.976];
export const WHITE: Color = [1, 1, 1];

// list_geometry: the row width is the widest label plus 24, a row is
// label height plus 4 tall, the box has 8 padding on y and rounded
// corners of 4.
export const ROW_PAD_X = 24;
export const ROW_PAD_Y = 4;
export const BOX_PAD_Y = 8;
export const BOX_RADIUS = 4;

export const dropdownList = defineComponent(
  "dropdown-list",
  [{ keys: ["selected", "options", "touch"] }],
  (props: Props) => {
    const selected = props["selected"];
    const options = props["options"] as Options;
    const touch = props["touch"] === true;
    const $selected = props["$selected"] as Path;
    const extra = props["extra"] as Record<string, unknown>;
    const $extra = props["$extra"] as Path;

    // list_geometry: row width is the widest label plus 24; a row is
    // label height plus 4 tall — at least 44 px on touch (touch_rows)
    const rowWidth =
      Math.max(0, ...options.map(([, text]) => labelNode(text).measure(text)[0])) + ROW_PAD_X;

    // one row per option, in order: a pointer down returns select with
    // the selected path and the row value (row_select_effect); the
    // hover flag lives in extra under the row's hover key
    // (row_hover_keyed)
    const rows: Elem[] = [];
    let y = BOX_PAD_Y;
    let rowsHeight = 0;
    for (const [value, text] of options) {
      // list_geometry: a row is label height plus 4 tall — at least
      // 44 px on touch (touch_rows)
      const rowHeight = Math.max(labelNode(text).measure(text)[1] + ROW_PAD_Y, touch ? MIN_TARGET : 0);
      const hovered = hoverFlag(extra, value);
      const isSelected = value === selected;
      const hoverPath: Path = [...$extra, ["keypath", hoverKey(value)]];

      // row_visuals: the selected row has a blue fill with a white
      // label; a hovered row has a light gray fill
      const visuals: Elem[] = [spacer(rowWidth, rowHeight)];
      if (isSelected) {
        visuals.push(withColor(SELECTED_FILL, rectangle(rowWidth, rowHeight)));
        visuals.push(withColor(WHITE, labelNode(text)));
      } else if (hovered) {
        visuals.push(withColor(HOVER_FILL, rectangle(rowWidth, rowHeight)));
        visuals.push(labelNode(text));
      } else {
        visuals.push(labelNode(text));
      }

      // hover shapes from components.hover: entering sets the flag true
      // on a mouse-move over the body, leaving sets it false on a
      // global mouse-move outside the row (the bounds check is
      // inclusive at the upper edge)
      const moveIn = hovered ? () => null : (): readonly unknown[] => [["set", hoverPath, true]];
      const moveGlobal = (pos: unknown): readonly unknown[] | null => {
        const [x, yy] = (pos ?? [0, 0]) as Vec2;
        if (!hovered) return null;
        if (x < 0 || x > rowWidth || yy < 0 || yy > rowHeight) {
          return [["set", hoverPath, false]];
        }
        return null;
      };

      rows.push(
        translate(
          0,
          y,
          on(
            "mouse-down",
            () => [["select", $selected, value]],
            on("mouse-move", moveIn, on("mouse-move-global", moveGlobal, visuals)),
          ),
        ),
      );
      y += rowHeight;
      rowsHeight += rowHeight;
    }

    // the box: rounded corners of 4 and 8 padding on y (list_geometry)
    const box = roundedRectangle(rowWidth, 2 * BOX_PAD_Y + rowsHeight, BOX_RADIUS);
    return [box, ...rows];
  },
);
