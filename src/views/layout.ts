// Purpose: tambor's pure layout combinators (view.layout spec).
// Responsibilities: vertical/horizontal stacking with a configurable
//   one-pixel gap, table layout with aligned columns and rows, centering,
//   and stretch resolution against a container size.
// Rationale: specs/view-layout.md is the design authority — layout only
//   wraps children in Translate nodes (layout_pure), the first child
//   stays at the origin and each later child is translated by the
//   running offset of size plus origin plus the gap (vstack_offsets,
//   hstack_offsets), zero children yield nil (layout_empty_nil), and
//   layout is a pure function of container size and content
//   (layout_reflows). No behavior beyond the corpus.

import {
  bounds,
  children,
  height,
  makeNode,
  origin,
  translate,
  width,
  isGroup,
  type Elem,
  type Node,
  type Rectangle,
  type RoundedRectangle,
  type SpacerNode,
  type Vec2,
} from "./model.ts";

// Stack children on top of each other: the first child is untranslated
// and child i (i >= 1) is translated on y by the sum over j below i of
// height plus origin y plus the gap, which defaults to 1
// (vstack_offsets). Zero children return nil (layout_empty_nil).
export function verticalLayout(
  elems: readonly Elem[],
  gap = 1,
): readonly Elem[] | null {
  if (elems.length === 0) return null;
  const first = elems[0];
  const rows: Elem[] = [first];
  let offset = height(first) + origin(first)[1] + gap;
  for (const elem of elems.slice(1)) {
    rows.push(translate(0, offset, elem));
    offset += height(elem) + origin(elem)[1] + gap;
  }
  return rows;
}

// The same rule on the x axis using width and origin x (hstack_offsets).
export function horizontalLayout(
  elems: readonly Elem[],
  gap = 1,
): readonly Elem[] | null {
  if (elems.length === 0) return null;
  const first = elems[0];
  const cols: Elem[] = [first];
  let offset = width(first) + origin(first)[0] + gap;
  for (const elem of elems.slice(1)) {
    cols.push(translate(offset, 0, elem));
    offset += width(elem) + origin(elem)[0] + gap;
  }
  return cols;
}

// Table layout: every cell in a column shares an x offset equal to the
// sum of earlier column widths plus padding, and every cell in a row
// shares a y offset likewise (table_columns_aligned).
export function tableLayout(
  table: readonly (readonly Elem[])[],
  paddingX = 0,
  paddingY = 0,
): readonly Elem[] {
  const rowHeights = table.map((row) =>
    row.reduce((max, cell) => Math.max(max, height(cell)), 0),
  );
  const colWidths: number[] = [];
  for (const row of table) {
    row.forEach((cell, j) => {
      colWidths[j] = Math.max(colWidths[j] ?? 0, width(cell));
    });
  }
  const cells: Elem[] = [];
  table.forEach((row, i) => {
    let y = paddingY;
    for (let k = 0; k < i; k++) y += 2 * paddingY + (rowHeights[k] ?? 0);
    row.forEach((cell, j) => {
      let x = paddingX;
      for (let k = 0; k < j; k++) x += 2 * paddingX + (colWidths[k] ?? 0);
      cells.push(translate(x, y, cell));
    });
  });
  return cells;
}

// Center elem within a space of [width, height]: translate elem by
// ((W - w) / 2, (H - h) / 2) (center_exact).
export function center(elem: Elem, container: Vec2): Node {
  const [w, h] = container;
  const [ew, eh] = bounds(elem);
  return translate((w - ew) / 2, (h - eh) / 2, elem);
}

// A node reporting stretch-width or stretch-height is resolved against
// the container size before drawing (stretch_resolved): flagged nodes
// get the container's size on that axis and drop their flag; the rest
// of the tree is rebuilt unchanged via children/makeNode.
function resolveStretchFlags(elem: Node, container: Vec2): Node {
  const [cw, ch] = container;
  switch (elem.type) {
    case "rectangle": {
      const rect: Rectangle = {
        type: "rectangle",
        width: elem.stretchWidth === true ? cw : elem.width,
        height: elem.stretchHeight === true ? ch : elem.height,
      };
      return rect;
    }
    case "rounded-rectangle": {
      const rect: RoundedRectangle = {
        type: "rounded-rectangle",
        width: elem.stretchWidth === true ? cw : elem.width,
        height: elem.stretchHeight === true ? ch : elem.height,
        radius: elem.radius,
      };
      return rect;
    }
    case "spacer": {
      const node: SpacerNode = {
        type: "spacer",
        x: elem.stretchWidth === true ? cw : elem.x,
        y: elem.stretchHeight === true ? ch : elem.y,
      };
      return node;
    }
    default:
      return elem;
  }
}

export function resolveStretch(elem: Elem, container: Vec2): Elem {
  if (elem == null) return elem;
  if (isGroup(elem)) {
    return elem.map((child) => resolveStretch(child, container));
  }
  const resolved = resolveStretchFlags(elem, container);
  return makeNode(
    resolved,
    children(resolved).map((child) => resolveStretch(child, container)),
  );
}
