// Purpose: the real-DOM painters — one builder per drawable type, emitting
//   elements whose compositing matches the canvas backend (tambor-0rp).
// Responsibilities: element construction for label, button, rectangle,
//   rounded rectangle, translate, rotate/scale/scissor, with-color,
//   with-style, with-stroke-width, handler, text-selection, text-cursor,
//   image, arc and path; per-child identity reuse and the keyed
//   reconcile plan (dom-reuse.ts re-export, add-keyed-dom-reconciliation);
//   plus the at-origin helper every emission uses and the fill extent a
//   with-color wrapper paints.
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
//   which is the paint order the canvas backend uses. A with-color
//   wrapper's background is the fill its shape content would paint
//   (canvas fillStyle), so the wrapper must have a box: 100% of the
//   containing block in normal flow, the shapes' own extent when that
//   block has none (an absolutely positioned group of absolute children
//   collapses to 0×0 and the percentage resolves to nothing — the
//   selected-row accent never painted).

import type { ElementLike } from "./domsim.ts";
import type { AnyDraw } from "./primitives.ts";
import type { Color } from "../views/model.ts";
import { buttonBounds } from "../views/geometry.ts";
import { currentLabelMeasure } from "../views/nodes.ts";
import { cssVarColor } from "../ui/ambient-theme.ts";
import { buildChildWithReuse, withKeyedSegment, type ReuseCtx } from "./dom-reuse.ts";
// Public surface kept: the reuse machinery lives in dom-reuse.ts, the
// pure reconcile plan in reconcile.ts (mechanical split).
export { buildChildWithReuse, type BuiltRange } from "./dom-reuse.ts";
export { reconcile, type ReconcileStep, type KeyFn } from "./reconcile.ts";
import { fillExtent, type FillRequest } from "./dom-fill.ts";
// Public surface kept: the fill machinery lives in dom-fill.ts.
export { settleFillExtents } from "./dom-fill.ts";

// The color a STYLE property paints: a token value emits the CSS custom
// property (the browser resolves it at paint time against the cascade,
// timing-proof against a host that reports the scheme late — the
// dark-scheme audit; ambient-theme.cssVarColor maps only ink roles), any
// other color stays the literal rgb. The svg ATTRIBUTE stroke path
// (svgStroke's p.attrs["stroke"]) does NOT go through this: attributes
// cannot carry var() and the danger red pin must stay byte-stable.
function cssColor(
  color: Color | undefined,
  literal: string | undefined,
): string {
  // stroke mode with no color draws the default ink (canvas stroke
  // semantics): no Color to map, straight to the literal fallback
  if (color === undefined) return literal ?? "currentColor";
  // a var() mapping wins; the literal rgb is the fallback for
  // non-token colors and the `undefined` ink (currentColor cascade)
  return cssVarColor(color) ?? literal ?? "currentColor";
}

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
// the recursive traversal (build) — the reuse half comes from
// ReuseCtx (dom-reuse.ts). Builders stay pure module functions.
export interface BuildCtx extends ReuseCtx {
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
  // The fill wrappers awaiting their extent (settleFillExtents): a
  // percentage size cannot resolve while the tree is still detached —
  // builders append bottom-up, so every wrapper is measured after the
  // root build attaches the whole tree.
  fills?: FillRequest[];
  // Per-child identity reuse (add-runtime-invalidation §3, tasks
  // 3.5/3.6): reusePrev/reuseNext/reuseUsed come from ReuseCtx
  // (dom-reuse.ts), which owns their contract and rationale.
}

export type DomPainter = (ctx: BuildCtx, node: DomNode, parent: ElementLike) => void;

// Emit an element composited at the containing origin: absolute at (0, 0)
// of the nearest positioned ancestor (the enclosing translate or the
// anchored root). Absolute siblings with auto z-index stack in DOM order —
// the paint order.
export function atOrigin(el: ElementLike): void {
  el.style["position"] = "absolute";
  el.style["left"] = "0px";
  el.style["top"] = "0px";
}

export function buildChildrenOf(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("div");
  atOrigin(el);
  const drawables = node.drawables ?? [];
  for (let i = 0; i < drawables.length; i++)
    withKeyedSegment(ctx, i, () => buildChildWithReuse(ctx, drawables[i]!, el, i));
  parent.appendChild(el);
}

export function buildLabel(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("span");
  atOrigin(el);
  // text ink (tambor-2jz): the threaded with-color ink paints the span
  // (canvas fillStyle semantics); a label's own color, when the draw tree
  // carries one, paints it directly. No color inherits — the span stays
  // whatever the host cascade gives it. Style-painted token inks emit the
  // custom property (see cssColor); the svg attribute path stays literal.
  const literal = nodeColor(node);
  const ink = ctx.ink ??
    (node.color ? cssColor(node.color, literal) : literal);
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
  // the emitted box is sized from the corpus measure, so the glyphs must
  // use that same font: a <button> otherwise renders at the UA's 13.33px
  // even though layout measured 16px (the audit's text.small finding,
  // tambor-v3s) — inherit makes rendered == measured.
  el.style["font"] = "inherit";
  // a corpus label is a single line and its spaces are layout (see
  // buildLabel) — pre keeps the measured box honest (tambor-0rp)
  el.style["white-space"] = "pre";
  // the emitted box IS the corpus button_bounds via the shared formula
  // (geometry.ts buttonBounds): label bounds + 12, floored at 44/axis
  // (tambor-8cu) — browser-intrinsic padding/border would inflate the
  // rendered box past the layout math and collide with siblings. Explicit
  // size + border-box keeps rendered == laid-out == hit-tested geometry.
  const [tw, th] = currentLabelMeasure()(node.text ?? "");
  const [bw, bh] = buttonBounds([tw, th]);
  el.style["width"] = `${bw}px`;
  el.style["height"] = `${bh}px`;
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
  if (color && style !== "stroke") el.style["background"] = cssColor(node.color!, color);
  if (style === "stroke" || style === "stroke-and-fill") {
    // a stroked rectangle outlines its box (canvas stroke semantics);
    // stroke mode with no color draws the default ink
    el.style["border"] = `1px solid ${cssColor(node.color!, color ?? "currentColor")}`;
    el.style["box-sizing"] = "border-box";
  }
  parent.appendChild(el);
}

export function buildTranslate(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("div");
  el.style["position"] = "absolute";
  el.style["left"] = `${node.x ?? 0}px`;
  el.style["top"] = `${node.y ?? 0}px`;
  // the singular drawable is wrapper level 0: without a segment here an
  // array inside shares its parent's index path with any other array at
  // the same depth (tambor-4ny)
  withKeyedSegment(ctx, 0, () => ctx.build(node.drawable ?? null, el));
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
  const styled = node.drawables ?? [];
  for (let i = 0; i < styled.length; i++) {
    const child = styled[i]!;
    withKeyedSegment(ctx, i, () => ctx.build(child, el));
  }
  parent.appendChild(el);
  ctx.style = prev;
}

// The with-color wrapper's own paint, after construction (only when a
// color was threaded): the background covers the full extent — an
// auto-sized wrapper has zero extent, so the background would paint
// nothing (tambor-2jz audit); the stroke border carries the stroke ink.
function applyWrapperPaint(el: ElementLike, node: DomNode, color: string, style: string, fills: boolean): void {
  if (fills) {
    el.style["background"] = cssColor(node.color!, color);
    el.style["width"] = "100%";
    el.style["height"] = "100%";
  }
  if (style === "stroke" || style === "stroke-and-fill") {
    el.style["border"] = `1px solid ${cssColor(node.color!, color)}`;
    el.style["box-sizing"] = "border-box";
  }
}

export function buildWrapperWithColor(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const el = ctx.make("div");
  atOrigin(el);
  const color = nodeColor(node);
  const style = ctx.style ?? "fill";
  const fills = color !== undefined && style !== "stroke";
  // the stroke ink threads for the subtree (svg path/arc read it) and the
  // text ink threads to spans (tambor-2jz) — the canvas counterpart is
  // setStyle: with-color sets the fill and stroke color
  const prevStroke = ctx.stroke;
  const prevInk = ctx.ink;
  if (color) {
    // the stroke ink threads LITERAL for the subtree (svg path/arc paint
    // it through a stroke ATTRIBUTE, which cannot carry var() and whose
    // corpus pins stay byte-stable); the text ink threads the var() form
    // so spans resolve per scheme at paint time
    ctx.stroke = color;
    ctx.ink = cssColor(node.color!, color);
  }
  if (color) applyWrapperPaint(el, node, color, style, fills);
  const inked = node.drawables ?? [];
  for (let i = 0; i < inked.length; i++) {
    const child = inked[i]!;
    withKeyedSegment(ctx, i, () => ctx.build(child, el));
  }
  ctx.stroke = prevStroke;
  ctx.ink = prevInk;
  parent.appendChild(el);
  // settle once the whole tree is attached (a detached element has no
  // box, so the percentage cannot be read here); wrappers without a fill
  // area are never measured
  if (fills) {
    const extent = fillExtent(node.drawables ?? []);
    if (extent !== null) (ctx.fills ??= []).push({ el, extent });
  }
}

// with-stroke-width: the width governs how DESCENDANTS stroke (canvas
// setLineWidth semantics) — thread it through the mutable ctx.
export function buildWrapperWithStrokeWidth(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  const prev = ctx.strokeWidth;
  ctx.strokeWidth = node.strokeWidth ?? prev;
  const el = ctx.make("div");
  atOrigin(el);
  const stroked = node.drawables ?? [];
  for (let i = 0; i < stroked.length; i++) {
    const child = stroked[i]!;
    withKeyedSegment(ctx, i, () => ctx.build(child, el));
  }
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

export function nodeColor(node: { color?: Color; style?: string }): string | undefined {
  const c = node.color;
  if (!c || node.style === "stroke") return undefined;
  const a = c[3] ?? 1;
  return `rgba(${Math.round((c[0] ?? 0) * 255)}, ${Math.round((c[1] ?? 0) * 255)}, ${Math.round((c[2] ?? 0) * 255)}, ${a})`;
}
