// Purpose: the paint-order surface resolver of the bombadil visual
//   floors — which surface the glyphs of a leaf text element actually
//   sit on, for contrast measurement against real backdrops.
// Responsibilities: given a leaf element, find the composited opaque
//   surface behind its glyphs: its own background, then at each ancestor
//   level the last preceding sibling whose painted extent covers the
//   text centre (later siblings paint above the glyphs), falling back to
//   the ancestor's own background only when no such sibling exists.
// Rationale: a fill's painted extent is its own box plus the boxes of
//   the geometry it wraps: the DOM backend emits `with-color` as a
//   percentage-sized wrapper whose own box collapses to 0x0 inside an
//   auto-sized ancestor while the wrapped drawables carry the extent.
//   Extracted from lib/visual.ts (tambor-akp pretender debt) alongside
//   ./contrast.ts (the color math this module composites with); both
//   stay inside `bombadil/` so the CLI bundle remains self-contained.

import { fillColor, OPAQUE_WHITE, over, type Rgb, type Rgba } from "./contrast.ts";

// The area a fill paints, in client pixels.
type PaintBox = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

// Where the text glyphs are measured from: the centre of their box.
type Centre = { readonly x: number; readonly y: number };

// The area a fill paints: its own box plus the boxes of the geometry it
// wraps (see the header for the with-color wrapper collapse).
function paintedExtent(element: Element): PaintBox {
  const rects: DOMRect[] = [element.getBoundingClientRect()];
  for (const descendant of element.querySelectorAll("*")) {
    rects.push(descendant.getBoundingClientRect());
  }
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  return { left, top, right, bottom };
}

function covers(box: PaintBox, point: Centre): boolean {
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

// The last sibling painted before `subtree` that fills the text centre.
// Siblings after it paint above the glyphs, so they are never a surface.
function precedingFill(
  parent: Element,
  subtree: Element,
  centre: Centre,
): Rgba | null {
  const siblings = Array.from(parent.children);
  const index = siblings.indexOf(subtree);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const sibling = siblings[cursor];
    if (sibling === undefined) continue;
    const color = fillColor(sibling);
    if (color === null) continue;
    if (!covers(paintedExtent(sibling), centre)) continue;
    return color;
  }
  return null;
}

// The painted layers behind the glyphs, topmost first: the text's own
// background, then per ancestor level the last preceding filled sibling
// covering the text centre, else that ancestor's own background where
// its own box covers the centre (a 0x0 ancestor paints nothing). Stops
// at the first opaque layer.
function backdropLayers(element: Element, centre: Centre): Rgba[] {
  const layers: Rgba[] = [];
  const own = fillColor(element);
  if (own !== null) layers.push(own);
  let opaque = own !== null && own[3] >= 1;

  let subtree: Element = element;
  let parent = subtree.parentElement;
  while (!opaque && parent !== null) {
    const sibling = precedingFill(parent, subtree, centre);
    if (sibling !== null) {
      layers.push(sibling);
      opaque = sibling[3] >= 1;
    } else {
      const ancestor = fillColor(parent);
      if (ancestor !== null && covers(parent.getBoundingClientRect(), centre)) {
        layers.push(ancestor);
        opaque = ancestor[3] >= 1;
      }
    }
    subtree = parent;
    parent = parent.parentElement;
  }
  return layers;
}

// The surface the glyphs actually sit on: the backdrop layers
// composited bottom-up over white.
export function surfaceBehind(element: Element): Rgb {
  const rect = element.getBoundingClientRect();
  const centre: Centre = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  const layers = backdropLayers(element, centre);
  let surface: Rgb = OPAQUE_WHITE;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (layer !== undefined) surface = over(layer, surface);
  }
  return surface;
}
