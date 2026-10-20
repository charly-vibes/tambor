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
import { currentLabelMeasure } from "../views/nodes.ts";

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
  points?: readonly (readonly [number, number])[];
  cx?: number;
  cy?: number;
  radius?: number;
  start?: number;
  end?: number;
  strokeWidth?: number;
}

export type DomBuilder = (view: AnyDraw, parent: ElementLike) => void;
// The per-backend build context: where elements come from (make) and
// the recursive traversal (build). Builders stay pure module functions.
export interface BuildCtx {
  make(tag: string): ElementLike;
  build(view: AnyDraw, parent: ElementLike): void;
  // The inherited with-style mode (fill | stroke | stroke-and-fill) for
  // the node currently being built — the DOM counterpart of the canvas
  // painter's setStyle: with-color wrappers and bare rectangles read it
  // to decide background vs border (tambor-0rp textarea frame parity).
  style?: string | undefined;
  // The inherited stroke ink and width (canvas setStyle/setLineWidth
  // semantics): with-color and with-stroke-width thread these for the
  // subtree; the svg path/arc builders consume them (tambor-0rp round 3
  // — primitive_set parity: path and arc draw on EVERY backend).
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  // The inherited text ink (canvas fillStyle semantics, tambor-2jz):
  // with-color threads it for the subtree; text spans (labels) consume
  // it as style.color — canvas paints text with the current fill color,
  // so selected-row blue, hover gray and gray no-selection text show on
  // the DOM backend too.
  ink?: string | undefined;
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

export function buildLabel(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("span");
  atOrigin(el);
  // text ink (tambor-2jz): the threaded with-color ink paints the span
  // (canvas fillStyle semantics); a label's own color, when the draw tree
  // carries one, paints it directly. No color inherits — the span stays
  // whatever the host cascade gives it.
  const ink = ctx.ink ?? nodeColor(node);
  if (ink) el.style["color"] = ink;
  // Corpus spaces are LAYOUT: centredLabel pads with space runs to centre
  // text in its measured box (counter_label_width et al) — the measure
  // counts every space, so the DOM must render them (white-space:pre;
  // HTML's default collapsing would delete the padding and glue the text
  // to its neighbours). Single-line by definition (tambor-0rp).
  el.style["white-space"] = "pre";
  // rendered line box == measured bounds height (line-height:1)
  el.style["line-height"] = "1";
  el.style["display"] = "block";
  el.textContent = node.text ?? "";
  parent.appendChild(el);
}

export function buildButton(_ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  // a real button element: natively accessible and selectable
  const el = _ctx.make("button");
  atOrigin(el);
  // a corpus label is a single line and its spaces are layout (see
  // buildLabel) — pre keeps the measured box honest (tambor-0rp)
  el.style["white-space"] = "pre";
  // the emitted box IS the corpus button_bounds: label bounds + 12 on each
  // axis (geometry.ts) — browser-intrinsic padding/border would inflate the
  // rendered box past the layout math and collide with siblings. Explicit
  // size + border-box keeps rendered == laid-out == hit-tested geometry.
  const [tw, th] = currentLabelMeasure()(node.text ?? "");
  el.style["width"] = `${tw + 12}px`;
  el.style["height"] = `${th + 12}px`;
  el.style["box-sizing"] = "border-box";
  el.style["padding"] = "0";
  el.style["margin"] = "0";
  el.style["display"] = "flex";
  el.style["align-items"] = "center";
  el.style["justify-content"] = "center";
  el.textContent = node.text ?? "";
  parent.appendChild(el);
}

export function buildRectangle(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("div");
  atOrigin(el);
  el.style["width"] = `${node.width ?? 0}px`;
  el.style["height"] = `${node.height ?? 0}px`;
  const color = nodeColor(node);
  const style = ctx.style ?? "fill";
  if (color && style !== "stroke") el.style["background"] = color;
  if (style === "stroke" || style === "stroke-and-fill") {
    // a stroked rectangle outlines its box (canvas stroke semantics);
    // stroke mode with no color draws the default ink
    el.style["border"] = `1px solid ${color ?? "currentColor"}`;
    el.style["box-sizing"] = "border-box";
  }
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

// rotate/scale/scissor contribute an (empty) box; the color paints the
// wrapper's background over the full extent (tambor-2jz).
// with-style: the mode governs how DESCENDANTS paint (canvas setStyle
// semantics) — thread it through the mutable ctx for the subtree.
export function buildWithStyle(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const prev = ctx.style;
  ctx.style = (node.style ?? "fill") as string;
  const el = ctx.make("div");
  atOrigin(el);
  for (const child of node.drawables ?? []) ctx.build(child, el);
  parent.appendChild(el);
  ctx.style = prev;
}

export function buildWrapperWithColor(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("div");
  atOrigin(el);
  const color = nodeColor(node);
  const style = ctx.style ?? "fill";
  // the stroke ink threads for the subtree (svg path/arc read it) and the
  // text ink threads to spans (tambor-2jz) — the canvas counterpart is
  // setStyle: with-color sets the fill and stroke color
  const prevStroke = ctx.stroke;
  const prevInk = ctx.ink;
  if (color) {
    ctx.stroke = color;
    ctx.ink = color;
  }
  if (color && style !== "stroke") {
    el.style["background"] = color;
    // canvas fill paints the whole clip extent — an auto-sized wrapper has
    // zero extent, so the background would paint nothing (tambor-2jz audit:
    // no element had both a background and non-zero width). The wrapper
    // covers its containing origin (the nearest positioned ancestor).
    el.style["width"] = "100%";
    el.style["height"] = "100%";
  }
  if (color && (style === "stroke" || style === "stroke-and-fill")) {
    el.style["border"] = `1px solid ${color}`;
    el.style["box-sizing"] = "border-box";
  }
  for (const child of node.drawables ?? []) ctx.build(child, el);
  ctx.stroke = prevStroke;
  ctx.ink = prevInk;
  parent.appendChild(el);
}

// with-stroke-width: the width governs how DESCENDANTS stroke (canvas
// setLineWidth semantics) — thread it through the mutable ctx.
export function buildWrapperWithStrokeWidth(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const prev = ctx.strokeWidth;
  ctx.strokeWidth = node.strokeWidth ?? prev;
  const el = ctx.make("div");
  atOrigin(el);
  for (const child of node.drawables ?? []) ctx.build(child, el);
  ctx.strokeWidth = prev;
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

// path and arc DRAW (tambor-0rp round 3, primitive_set parity): an
// inline svg anchored at the origin whose viewport COVERS THE GEOMETRY —
// Chrome paints nothing from a 0×0 svg viewport even with overflow
// visible (the blank logo world), so width/height are the node's extent.
// overflow:visible keeps out-of-viewport geometry (negative coords)
// painting, and pointer-events none keeps the stroke from intercepting
// clicks (canvas strokes don't hit-test). The stroke inherits the
// threaded with-color ink.
function svgExtent(node: DomNode, kind: "path" | "arc"): [number, number] {
  if (kind === "path") {
    const pts = node.points ?? [];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [
      Math.max(0, ...xs),
      Math.max(0, ...ys),
    ];
  }
  // the arc lives in the circle box around (cx, cy): the viewport from
  // the origin covering cx+r, cy+r contains it (overflow shows the rest)
  const r = node.radius ?? 0;
  return [
    Math.max(0, (node.cx ?? 0) + r),
    Math.max(0, (node.cy ?? 0) + r),
  ];
}

function svgStroke(kind: "path" | "arc", node: DomNode, ctx: BuildCtx, parent: ElementLike): void {
  const el = ctx.make("svg");
  atOrigin(el);
  const [w, h] = svgExtent(node, kind);
  el.attrs["width"] = Math.ceil(w);
  el.attrs["height"] = Math.ceil(h);
  el.style["overflow"] = "visible";
  el.style["pointer-events"] = "none";
  const p = ctx.make("path");
  p.attrs["d"] = kind === "path" ? pathData(node) : arcData(node);
  p.attrs["fill"] = "none";
  p.attrs["stroke"] = ctx.stroke ?? "currentColor";
  p.attrs["stroke-width"] = String(ctx.strokeWidth ?? 1);
  el.appendChild(p);
  parent.appendChild(el);
}

function pathData(node: DomNode): string {
  const pts = node.points ?? [];
  if (pts.length === 0) return "";
  const [x0, y0] = pts[0]!;
  let d = `M ${x0} ${y0}`;
  for (const [x, y] of pts.slice(1)) d += ` L ${x} ${y}`;
  return d;
}

// canvas arc semantics: angles are y-down (0 = +x, PI/2 = +y) and the
// stroke runs from start to end in the positive-angle direction — the
// svg sweep-flag 1 direction; delta > PI flips the large-arc flag.
function arcData(node: DomNode): string {
  const cx = node.cx ?? 0;
  const cy = node.cy ?? 0;
  const r = node.radius ?? 0;
  const start = node.start ?? 0;
  const end = node.end ?? 0;
  const x0 = cx + r * Math.cos(start);
  const y0 = cy + r * Math.sin(start);
  const x1 = cx + r * Math.cos(end);
  const y1 = cy + r * Math.sin(end);
  const delta = end - start;
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

export function buildPath(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  svgStroke("path", node, ctx, parent);
}

export function buildArc(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  svgStroke("arc", node, ctx, parent);
}

export function nodeColor(node: { color?: Color; style?: string }): string | undefined {
  const c = node.color;
  if (!c || node.style === "stroke") return undefined;
  const a = c[3] ?? 1;
  return `rgba(${Math.round((c[0] ?? 0) * 255)}, ${Math.round((c[1] ?? 0) * 255)}, ${Math.round((c[2] ?? 0) * 255)}, ${a})`;
}
