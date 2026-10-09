// Purpose: the Canvas2D backend's painter dispatch — one painter per
//   drawable type.
// Responsibilities: module-level painter functions (they receive the
//   tree-walk for recursion and the Painter instance) behind the
//   PAINTERS dispatch table; the CanvasNode draw-tree shape; the
//   checkerboard pattern for image primitives without pixel data.
// Rationale: openspec/specs/render-paint/spec.md's primitive_set traversal with
//   per-node painters keeps no single function carrying the whole
//   vocabulary (tambor-272).

import type { Vec2 } from "../views/model.ts";
import type { Color } from "./image.ts";
import { ImageBuffer, toRGBA } from "./image.ts";
import type { AnyDraw } from "./primitives.ts";
import type { Painter } from "./image.ts";

// A drawable node, as the draw tree actually carries it.
export interface CanvasNode {
  type: string;
  drawable?: AnyDraw;
  drawables?: readonly AnyDraw[];
  text?: string;
  color?: Color;
  style?: string;
  strokeWidth?: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: readonly Vec2[];
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  theta?: number;
  checked?: boolean;
  data?: ImageBuffer;
  start?: number;
  end?: number;
}

// Painters receive the tree-walk (for recursion) and the painter
// instance, so none of them needs the backend itself.
type TreePainter = (view: AnyDraw) => void;
type CanvasPainter = (paint: TreePainter, painter: Painter, node: CanvasNode) => void;

// Paint a box honouring the current style mode: fill, stroke, or both.
function paintBox(painter: Painter, x: number, y: number, w: number, h: number): void {
  if (painter.mode !== "stroke" && painter.fillStyle) {
    painter.fillRect(x, y, w, h);
  }
  if (painter.mode !== "fill" && painter.strokeStyle) {
    painter.strokeRect(x, y, w, h);
  }
}

function paintChildrenOf(paint: TreePainter, painter: Painter, node: CanvasNode): void {
  for (const child of node.drawables ?? []) paint(child);
}

function paintLabelC(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.fillText(node.text ?? "", 0, 0);
}

function paintRectangleC(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  paintBox(painter, 0, 0, node.width ?? 0, node.height ?? 0);
}

function paintRoundedRectangle(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  const r = node.radius ?? 0;
  // fill is the box; stroke walks the rounded outline
  if (painter.mode !== "stroke") {
    const color = painter.fillStyle;
    if (color) {
      painter.fillStyle = color;
      painter.fillRect(0, 0, w, h);
    }
  }
  painter.strokeRoundedRect(0, 0, w, h, r);
}

function paintPathC(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.beginPath();
  const pts = node.points ?? [];
  if (pts.length > 0) painter.moveTo(pts[0]![0], pts[0]![1]);
  for (const p of pts.slice(1)) painter.lineTo(p[0], p[1]);
  painter.stroke();
}

function paintArc(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.beginPath();
  painter.arc(node.cx ?? 0, node.cy ?? 0, node.radius ?? 0, node.start ?? 0, node.end ?? 0);
  painter.stroke();
}

function paintTranslateC(paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.save();
  painter.translate(node.x ?? 0, node.y ?? 0);
  paint(node.drawable ?? null);
  painter.restore();
}

function paintRotateC(paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.save();
  painter.rotate(node.theta ?? 0);
  paintChildrenOf(paint, painter, node);
  painter.restore();
}

function paintScaleC(paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.save();
  painter.scale(node.x ?? 1, node.y ?? 1);
  paintChildrenOf(paint, painter, node);
  painter.restore();
}

function paintScissorC(paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.save();
  painter.scissor(node.x ?? 0, node.y ?? 0, node.width ?? 0, node.height ?? 0);
  paintChildrenOf(paint, painter, node);
  painter.restore();
}

function paintWithColor(paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.save();
  const color = node.color ?? [0, 0, 0];
  painter.fillStyle = color;
  painter.strokeStyle = color;
  paintChildrenOf(paint, painter, node);
  painter.restore();
}

function paintWithStyle(paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.save();
  painter.setStyle((node.style ?? "fill") as "fill" | "stroke" | "stroke-and-fill");
  paintChildrenOf(paint, painter, node);
  painter.restore();
}

function paintWithStrokeWidth(paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.save();
  painter.lineWidth = node.strokeWidth ?? 1;
  paintChildrenOf(paint, painter, node);
  painter.restore();
}

function paintButtonC(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  // the button draws its label, inset by the 6 px padding
  painter.fillText(node.text ?? "", 6, 6);
}

function paintCheckboxC(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  // the ui checkbox draw: the 12 by 12 rounded square, stroked
  // gray when unchecked; when checked, the blue fill, border and
  // the white check path
  const checked = node.checked === true;
  painter.save();
  if (checked) {
    painter.fillStyle = [0.2, 0.5607843137254902, 0.9882352941176471];
    painter.fillRect(0, 0, 12, 12);
    painter.fillStyle = null;
    painter.strokeStyle = [1, 1, 1];
    painter.lineWidth = 1.5;
    painter.beginPath();
    painter.moveTo(2, 6);
    painter.lineTo(5, 9);
    painter.lineTo(10, 2);
    painter.stroke();
  } else {
    painter.setStyle("stroke");
    painter.strokeStyle = [0.6862745098039216, 0.6862745098039216, 0.6862745098039216];
    painter.lineWidth = 1;
    painter.strokeRoundedRect(0, 0, 12, 12, 2);
  }
  painter.restore();
}

function paintTextSelection(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  // the selected-text highlight behind text
  const keep = painter.fillStyle;
  painter.fillStyle = [0, 0, 1, 0.25];
  painter.fillRect(0, 0, node.width ?? 0, node.height ?? 0);
  painter.fillStyle = keep;
}

function paintTextCursor(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  // the caret: a one-cell-wide vertical bar
  const keep = painter.fillStyle;
  painter.fillStyle = [0, 0, 0];
  painter.fillRect(0, 0, 1, node.height ?? 0);
  painter.fillStyle = keep;
}

function paintImage(_paint: TreePainter, painter: Painter, node: CanvasNode): void {
  painter.drawImage(node.data ?? checkerboard(node.width ?? 8, node.height ?? 8), 0, 0);
}

// One painter per drawable type; the pass-through types (with-*
// wrappers, handler) just paint their children.
export const PAINTERS: Readonly<Record<string, CanvasPainter>> = {
  "label": paintLabelC,
  "rectangle": paintRectangleC,
  "rounded-rectangle": paintRoundedRectangle,
  "path": paintPathC,
  "arc": paintArc,
  "spacer": () => {},
  "translate": paintTranslateC,
  "rotate": paintRotateC,
  "scale": paintScaleC,
  "scissor": paintScissorC,
  "with-color": paintWithColor,
  "with-style": paintWithStyle,
  "with-stroke-width": paintWithStrokeWidth,
  "button": paintButtonC,
  "checkbox": paintCheckboxC,
  "handler": paintChildrenOf,
  "text-selection": paintTextSelection,
  "text-cursor": paintTextCursor,
  "image": paintImage,
};


// The image pattern for an image primitive without pixel data.
function checkerboard(width: number, height: number): ImageBuffer {
  const buf = new ImageBuffer(width, height);
  const white = toRGBA([1, 1, 1]);
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if ((x + y) % 2 === 0) buf.set(x, y, white);
    }
  }
  return buf;
}
