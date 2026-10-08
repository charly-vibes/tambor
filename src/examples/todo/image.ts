// Purpose: the example.todo save-image port — a view tree rendered to
//   an image buffer with no window and no mounted DOM (image_render),
//   plus the shared drawing traversal the text-terminal backend
//   reuses for its cell grid.
// Responsibilities: saveImage(view) → ImageBuffer (width, height, RGBA
//   data) sized to the tree's bounds; drawTo(view, surface) walking the
//   tree and drawing the primitives the example's tree contains —
//   labels (text placed at the position), rectangles and rounded
//   rectangles (fill and/or stroke outline per the style), paths (thick
//   segments between consecutive points) — with translate, color,
//   style and stroke-width applied down the tree; handler, checkbox,
//   button and unknown containers recurse into their children, and the
//   event layer's wrap/bubble roots draw their drawables.
// Rationale: specs/example-todo.md image_render is the design authority
//   ("the app renders to an image with no window from plain state, as
//   save-image does in the original"); backend.render headless_render
//   states the same capability for every backend and owns the full
//   primitive set — this module is the example-scoped slice the todo
//   contracts need. The traversal convention: draw(elem, ox, oy) treats
//   the element's own origin as (0, 0); only translate offsets the
//   position. No behavior beyond the corpus.

import {
  bounds,
  children,
  isGroup,
  type Color,
  type Elem,
  type Vec2,
} from "../../views/model.ts";

// An RGBA image buffer, row-major, four bytes per pixel.
export interface ImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

// A drawing target: plot one cell, or place label characters. The
// raster surface plots pixels; the text-terminal surface writes chars.
export interface Surface {
  readonly width: number;
  readonly height: number;
  cell(x: number, y: number, color: Color): void;
  chars(x: number, y: number, text: string, color: Color): void;
}

interface Pen {
  readonly color: Color;
  readonly mode: "fill" | "stroke" | "stroke-and-fill";
  readonly width: number;
}

const DEFAULT_PEN: Pen = { color: [0, 0, 0], mode: "fill", width: 1 };

// The event layer's wrap/bubble type tags sit outside the Node union;
// they are read through a cast.
function kindOf(elem: Elem): string {
  return elem !== null && typeof elem === "object" && !Array.isArray(elem)
    ? ((elem as unknown as { type?: string }).type ?? "")
    : "";
}

function drawablesOf(elem: Elem): readonly Elem[] {
  return ((elem as unknown as { drawables?: readonly Elem[] }).drawables ?? []);
}

// The tree's pixel size, event-layer roots included: a wrap or bubble
// root is sized by its drawables (views/model bounds cannot size it).
export function sizeOf(view: Elem): Vec2 {
  const kind = kindOf(view);
  if (kind === "wrap" || kind === "bubble") return bounds(drawablesOf(view));
  return bounds(view);
}

function draw(elem: Elem, ox: number, oy: number, pen: Pen, surface: Surface): void {
  if (elem == null) return;
  if (isGroup(elem)) {
    for (const child of elem) draw(child, ox, oy, pen, surface);
    return;
  }
  const kind = kindOf(elem);
  if (kind === "wrap" || kind === "bubble") {
    for (const child of drawablesOf(elem)) draw(child, ox, oy, pen, surface);
    return;
  }
  const node = elem as Exclude<Elem, readonly Elem[] | null | undefined> & { type: string };
  switch (node.type) {
    case "translate":
      draw(node.drawable, ox + node.x, oy + node.y, pen, surface);
      return;
    case "with-color":
      for (const child of node.drawables) draw(child, ox, oy, { ...pen, color: node.color }, surface);
      return;
    case "with-style":
      for (const child of node.drawables) draw(child, ox, oy, { ...pen, mode: node.style }, surface);
      return;
    case "with-stroke-width":
      for (const child of node.drawables) draw(child, ox, oy, { ...pen, width: node.strokeWidth }, surface);
      return;
    case "label":
      surface.chars(ox, oy, node.text, pen.color);
      return;
    case "rectangle":
    case "rounded-rectangle": {
      if (pen.mode === "fill" || pen.mode === "stroke-and-fill") {
        fillRect(surface, ox, oy, node.width, node.height, pen.color);
      }
      if (pen.mode === "stroke" || pen.mode === "stroke-and-fill") {
        strokeRect(surface, ox, oy, node.width, node.height, pen.width, pen.color);
      }
      return;
    }
    case "path": {
      for (let i = 1; i < node.points.length; i++) {
        segment(surface, ox + node.points[i - 1]![0], oy + node.points[i - 1]![1], ox + node.points[i]![0], oy + node.points[i]![1], pen);
      }
      return;
    }
    case "button": {
      // a button draws its label 6 px in from its top-left (the button
      // bounds are the label plus 12 on each axis)
      surface.chars(ox + 6, oy + 6, node.text, pen.color);
      return;
    }
    default: {
      for (const child of children(node)) draw(child, ox, oy, pen, surface);
    }
  }
}

function fillRect(surface: Surface, x: number, y: number, w: number, h: number, color: Color): void {
  for (let j = 0; j < Math.ceil(h); j++) {
    for (let i = 0; i < Math.ceil(w); i++) surface.cell(x + i, y + j, color);
  }
}

function strokeRect(surface: Surface, x: number, y: number, w: number, h: number, width: number, color: Color): void {
  const t = Math.max(1, Math.round(width));
  fillRect(surface, x, y, w, t, color);
  fillRect(surface, x, y + h - t, w, t, color);
  fillRect(surface, x, y, t, h, color);
  fillRect(surface, x + w - t, y, t, h, color);
}

function segment(surface: Surface, x0: number, y0: number, x1: number, y1: number, pen: Pen): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const t = Math.max(1, Math.round(pen.width));
  for (let i = 0; i <= steps; i++) {
    const px = Math.round(x0 + ((x1 - x0) * i) / steps);
    const py = Math.round(y0 + ((y1 - y0) * i) / steps);
    fillRect(surface, px, py, t, t, pen.color);
  }
}

// The RGBA pixel surface.
class PixelSurface implements Surface {
  readonly data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  cell(x: number, y: number, color: Color): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 4;
    const alpha = color.length > 3 ? (color[3] as number) : 1;
    this.data[i] = Math.round((color[0] as number) * 255);
    this.data[i + 1] = Math.round((color[1] as number) * 255);
    this.data[i + 2] = Math.round((color[2] as number) * 255);
    this.data[i + 3] = Math.round(alpha * 255);
  }
  chars(x: number, y: number, text: string, color: Color): void {
    // one cell per character, the default text measure
    for (let i = 0; i < text.length; i++) this.cell(x + i, y, color);
  }
}

// Render a view tree to an image buffer with no window and no mounted
// DOM (image_render, as save-image does in the original).
export function saveImage(view: Elem): ImageBuffer {
  const [w, h] = sizeOf(view);
  const width = Math.max(1, Math.ceil(w));
  const height = Math.max(1, Math.ceil(h));
  const surface = new PixelSurface(width, height);
  draw(view, 0, 0, DEFAULT_PEN, surface);
  return { width, height, data: surface.data };
}

// Render a view tree onto any surface (the text-terminal cell grid).
export function drawTo(view: Elem, surface: Surface): void {
  draw(view, 0, 0, DEFAULT_PEN, surface);
}