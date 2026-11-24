// Purpose: the delete-X stroke detector of the todo demo — the DOM shape
//   one drawn todo row reduces to, shared by the todo spec's row-count
//   and delete-target properties.
// Responsibilities: recognize the row marker drawn by
//   examples/todo/items.ts deleteX() and count the matched strokes under
//   a drawn root.
// Rationale: the marker pins the emitted DOM shape, so a change to the
//   X's ink, width or geometry re-derives this module (and the spec that
//   counts rows through it), not the whole suite.

// Row marker — the delete X of examples/todo/items.ts deleteX():
//   `withStrokeWidth(3, withColor([1, 0, 0], path([0, 0], [10, 10])))`
//   plus the mirrored `path([10, 0], [0, 10])`. The DomBackend paints each
//   path as one inline `<svg><path fill="none"
//   stroke="rgba(255, 0, 0, 1)" stroke-width="3" d="M 0 0 L 10 10"></svg>`
//   (render/dom-painters svgStroke), so one todoItem draws exactly TWO
//   matching strokes of the same 10x10 box. A drawn row is therefore a
//   red/none/3px 10x10-diagonal stroke PAIR:
//     rows = matched strokes / 2, and an odd count is itself a failure.
//   It is scoped to the stage root (`#demo > div`) by the caller, so the
//   gallery nav's own ink and the blurb (a sibling of the drawn root) can
//   never pollute the count. No other red path exists in the todo stage
//   (the checkbox's check ink is gray/blue/white; the toggle's unselected
//   option is gray TEXT), and a description textarea draws no strokes.

export const STROKE_SELECTOR = "svg > path";

// `nodeColor` renders [1, 0, 0] with its default alpha as this exact
// rgba() string; tolerate spacing only.
const RED_STROKE = /^rgba\(\s*255\s*,\s*0\s*,\s*0\s*,\s*1\s*\)$/;
const DELETE_STROKE_WIDTH = "3";

// The two diagonals of the 10x10 X box, as the painter emits them
// (`M ${x0} ${y0}` then ` L ${x} ${y}`; translate carries the position,
// so the path data itself never changes).
const DELETE_DIAGONALS: Readonly<Record<string, true>> = {
  "M 0 0 L 10 10": true,
  "M 10 0 L 0 10": true,
};

function isDeleteStroke(element: Element): boolean {
  return (
    element.localName === "path" &&
    DELETE_DIAGONALS[element.getAttribute("d") ?? ""] === true &&
    RED_STROKE.test(element.getAttribute("stroke") ?? "") &&
    element.getAttribute("stroke-width") === DELETE_STROKE_WIDTH &&
    element.getAttribute("fill") === "none"
  );
}

// Every delete-X stroke under the drawn root, in DOM order.
export function deleteStrokes(root: Element): Element[] {
  const strokes: Element[] = [];
  for (const candidate of root.querySelectorAll(STROKE_SELECTOR)) {
    if (isDeleteStroke(candidate)) strokes.push(candidate);
  }
  return strokes;
}
