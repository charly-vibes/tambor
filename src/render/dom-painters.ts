// Purpose: the real-DOM painters — one builder per drawable type, emitting
//   elements whose compositing matches the canvas backend (tambor-0rp).
// Responsibilities: element construction for label, button, rectangle,
//   rounded rectangle, translate, rotate/scale/scissor, with-color,
//   with-style, with-stroke-width, handler, text-selection, text-cursor,
//   image, arc and path; plus the at-origin helper every emission uses.
// Rationale: the corpus draw model composites EVERYTHING at the current
//   origin — a bare sequence superimposes its children there (canvas and
//   text backends paint each child at the same origin), and only translate
//   shifts the origin for its subtree. Flow layout cannot express that, so
//   every element is emitted position:absolute at its containing origin
//   (left/top 0px) and translate alone carries coordinates. The root the
//   backend builds into is position:relative, anchoring the whole tree
//   inside the mount container (the HITL finding: translated wrappers used
//   to anchor to the document, and in-flow siblings stacked as text lines
//   instead of superimposing — 'addcomplete' overdraw). Draw order parity:
//   absolutely positioned siblings with auto z-index stack in DOM order,
//   which is the paint order the canvas backend uses.

import type { ElementLike } from "./domsim.ts";
import type { AnyDraw } from "./primitives.ts";
import type { Color } from "../views/model.ts";

// A drawable node, as the draw tree actually carries it.
export interface DomNode {
  type: string;
  drawable?: AnyDraw;
  drawables?: readonly AnyDraw[];
  text?: string;
  color?: Color;
  style?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export type DomBuilder = (view: AnyDraw, parent: ElementLike) => void;
// The per-backend build context: where elements come from (make) and
// the recursive traversal (build). Builders stay pure module functions.
export interface BuildCtx {
  make(tag: string): ElementLike;
  build(view: AnyDraw, parent: ElementLike): void;
}
export type DomPainter = (ctx: BuildCtx, node: DomNode, parent: ElementLike) => void;

// Emit an element composited at the containing origin: absolute at (0, 0)
// of the nearest positioned ancestor (the enclosing translate or the
// anchored root). Absolute siblings with auto z-index stack in DOM order —
// the paint order.
function atOrigin(el: ElementLike): void {
  el.style["position"] = "absolute";
  el.style["left"] = "0px";
  el.style["top"] = "0px";
}

export function buildChildrenOf(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("div");
  atOrigin(el);
  for (const child of node.drawables ?? []) ctx.build(child, el);
  parent.appendChild(el);
}

export function buildLabel(_ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = _ctx.make("span");
  atOrigin(el);
  el.style["white-space"] = "nowrap";
  el.textContent = node.text ?? "";
  parent.appendChild(el);
}

export function buildButton(_ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  // a real button element: natively accessible and selectable
  const el = _ctx.make("button");
  atOrigin(el);
  // a corpus label is a single line: the measured width is the box width,
  // and a hair of subpixel difference must not wrap it (tambor-0rp)
  el.style["white-space"] = "nowrap";
  el.textContent = node.text ?? "";
  parent.appendChild(el);
}

export function buildRectangle(_ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = _ctx.make("div");
  atOrigin(el);
  el.style["width"] = `${node.width ?? 0}px`;
  el.style["height"] = `${node.height ?? 0}px`;
  const color = nodeColor(node);
  if (color) el.style["background"] = color;
  parent.appendChild(el);
}

export function buildTranslate(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("div");
  el.style["position"] = "absolute";
  el.style["left"] = `${node.x ?? 0}px`;
  el.style["top"] = `${node.y ?? 0}px`;
  ctx.build(node.drawable ?? null, el);
  parent.appendChild(el);
}

// rotate/scale/scissor contribute an (empty) box; the color paints
// the wrapper's background.
export function buildWrapperWithColor(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("div");
  atOrigin(el);
  const color = nodeColor(node);
  if (color) el.style["background"] = color;
  for (const child of node.drawables ?? []) ctx.build(child, el);
  parent.appendChild(el);
}

export function buildTextSelection(_ctx: BuildCtx, _n: DomNode, parent: ElementLike): void {
  const el = _ctx.make("span");
  atOrigin(el);
  el.style["background"] = "rgba(0, 0, 255, 0.25)";
  parent.appendChild(el);
}

export function buildTextCursor(_ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = _ctx.make("span");
  atOrigin(el);
  el.style["width"] = "1px";
  el.style["height"] = `${node.height ?? 0}px`;
  parent.appendChild(el);
}

export function buildImage(_ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = _ctx.make("img");
  atOrigin(el);
  el.attrs["width"] = node.width ?? 0;
  el.attrs["height"] = node.height ?? 0;
  parent.appendChild(el);
}

// no dom element for an arc or a path: they contribute their (empty) box
export function buildBox(_ctx: BuildCtx, _n: DomNode, parent: ElementLike): void {
  const el = _ctx.make("div");
  atOrigin(el);
  parent.appendChild(el);
}

export function nodeColor(node: { color?: Color; style?: string }): string | undefined {
  const c = node.color;
  if (!c || node.style === "stroke") return undefined;
  const a = c[3] ?? 1;
  return `rgba(${Math.round((c[0] ?? 0) * 255)}, ${Math.round((c[1] ?? 0) * 255)}, ${Math.round((c[2] ?? 0) * 255)}, ${a})`;
}
