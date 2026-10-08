// Purpose: the backend.render primitive set that the view model does
//   not already carry — text-selection, text-cursor, image, arc, plus
//   the transform/clip wrappers rotate, scale and scissor — and the
//   AnyDraw target type that spans the view-model Elem union and these
//   backend-side nodes.
// Responsibilities: the frozen node constructors and their types; the
//   UnknownNode shape whose children a backend falls back to drawing
//   (primitive_set's unknown-node rule); AnyDraw as the draw target.
// Rationale: specs/backend-render.md is the design authority —
//   primitive_set names exactly these primitives ("label, text-
//   selection, text-cursor, image, rectangle and rounded rectangle in
//   stroke or fill, path, arc, translate, rotate, scale, color, style,
//   stroke width and scissor, and unknown node types fall back to
//   drawing their children"). The view model's label/rectangle/
//   rounded-rectangle/path/translate/color/style/stroke-width nodes
//   already exist in src/views/model.ts; these are the remainder,
//   defined here because backend.render — not view.model — pins their
//   semantics. Nodes are frozen after construction like the view
//   model's (immutable_nodes). No behavior beyond the corpus.

import { type Elem } from "../views/model.ts";
import type { ImageBuffer } from "./image.ts";

export interface TextSelection {
  readonly type: "text-selection";
  readonly width: number;
  readonly height: number;
}

export interface TextCursor {
  readonly type: "text-cursor";
  readonly height: number;
}

export interface ImageNode {
  readonly type: "image";
  readonly width: number;
  readonly height: number;
  readonly data?: ImageBuffer | undefined;
}

export interface ArcNode {
  readonly type: "arc";
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly start: number;
  readonly end: number;
}

export interface RotateNode {
  readonly type: "rotate";
  readonly theta: number;
  readonly drawables: readonly AnyDraw[];
}

export interface ScaleNode {
  readonly type: "scale";
  readonly x: number;
  readonly y: number;
  readonly drawables: readonly AnyDraw[];
}

export interface ScissorNode {
  readonly type: "scissor";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly drawables: readonly AnyDraw[];
}

export type RenderNode =
  | TextSelection
  | TextCursor
  | ImageNode
  | ArcNode
  | RotateNode
  | ScaleNode
  | ScissorNode;

// An unrecognized node type: unknown nodes fall back to drawing their
// children (primitive_set).
export interface UnknownNode {
  readonly type: string;
  readonly drawables?: readonly AnyDraw[] | undefined;
}

// The draw target: the view model's Elem union plus the backend-side
// primitives, their wrappers, groups and unknown nodes.
export type AnyDraw = Elem | RenderNode | UnknownNode | readonly AnyDraw[] | null | undefined;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") Object.freeze(value);
  return value;
}

// The selected-text highlight: a filled rect behind text.
export function textSelection(width: number, height: number): TextSelection {
  return freeze({ type: "text-selection", width, height });
}

// The caret: a one-cell-wide vertical bar.
export function textCursor(height: number): TextCursor {
  return freeze({ type: "text-cursor", height });
}

// An image primitive: paints its buffer when given, a checkerboard
// pattern otherwise.
export function image(
  width: number,
  height: number,
  data?: ImageBuffer,
): ImageNode {
  const node: { type: "image"; width: number; height: number; data?: ImageBuffer } = {
    type: "image",
    width,
    height,
  };
  if (data !== undefined) node.data = data;
  return freeze(node);
}

export function arc(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
): ArcNode {
  return freeze({ type: "arc", cx, cy, radius, start, end });
}

export function rotate(theta: number, ...drawables: readonly AnyDraw[]): RotateNode {
  return freeze({ type: "rotate", theta, drawables });
}

export function scale(x: number, y: number, ...drawables: readonly AnyDraw[]): ScaleNode {
  return freeze({ type: "scale", x, y, drawables });
}

export function scissor(
  x: number,
  y: number,
  width: number,
  height: number,
  ...drawables: readonly AnyDraw[]
): ScissorNode {
  return freeze({ type: "scissor", x, y, width, height, drawables });
}

// The children a draw target contributes when its type is unknown:
// the drawables field, empty when absent (primitive_set fallback).
export function unknownChildren(node: UnknownNode): readonly AnyDraw[] {
  return node.drawables ?? [];
}
