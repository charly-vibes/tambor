// Purpose: tambor's immutable view-node model — the vocabulary and the
//   node constructors.
// Responsibilities: the primitive types (Vec2, Color, MeasureFn, Style,
//   Handler, StretchOptions), the drawable node interfaces, the
//   Node/Elem unions, isGroup, deepFreeze, the default measure, and the
//   constructors (label, rectangle, roundedRectangle, path, spacer,
//   translate, button, on, checkbox, withColor, withStyle,
//   withStrokeWidth) plus the ui checkbox draw geometry.
// Rationale: openspec/specs/view-model/spec.md is the design authority; nodes are
//   frozen after construction (immutable_nodes) and label size comes
//   from an injected measure function (text_measure_injected). Split
//   from model.ts so the model stays a thin hub (tambor-272). No
//   behavior beyond the corpus.

import type { AnyDraw } from "../render/primitives.ts";

export type Vec2 = readonly [number, number];
export type Color = readonly number[];
export type MeasureFn = (text: string) => Vec2;

export type Style = "fill" | "stroke" | "stroke-and-fill";

// Event handlers return intents; dispatch semantics land with
// effect-dispatch/event-model. Handlers are carried as inert data here.
export type Handler = (...args: readonly unknown[]) => unknown;

export interface StretchOptions {
  readonly stretchWidth?: true;
  readonly stretchHeight?: true;
}

export interface Label {
  readonly type: "label";
  readonly text: string;
  readonly measure: MeasureFn;
}

export interface Rectangle {
  readonly type: "rectangle";
  readonly width: number;
  readonly height: number;
  readonly stretchWidth?: true;
  readonly stretchHeight?: true;
}

export interface RoundedRectangle {
  readonly type: "rounded-rectangle";
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly stretchWidth?: true;
  readonly stretchHeight?: true;
}

export interface PathNode {
  readonly type: "path";
  readonly points: readonly Vec2[];
}

export interface SpacerNode extends StretchOptions {
  readonly type: "spacer";
  readonly x: number;
  readonly y: number;
}

export interface TranslateNode {
  readonly type: "translate";
  readonly x: number;
  readonly y: number;
  readonly drawable: Elem;
}

export interface WithColorNode {
  readonly type: "with-color";
  readonly color: Color;
  readonly drawables: readonly Elem[];
}

export interface WithStyleNode {
  readonly type: "with-style";
  readonly style: Style;
  readonly drawables: readonly Elem[];
}

export interface WithStrokeWidthNode {
  readonly type: "with-stroke-width";
  readonly strokeWidth: number;
  readonly drawables: readonly Elem[];
}

export interface ButtonNode {
  readonly type: "button";
  readonly text: string;
  readonly onClick?: Handler;
  readonly hover?: boolean;
}

export interface HandlerNode {
  readonly type: "handler";
  readonly eventType: string;
  readonly handler: Handler;
  readonly drawables: readonly Elem[];
}

export interface CheckboxNode {
  readonly type: "checkbox";
  readonly checked: boolean;
}

export type Node =
  | Label
  | Rectangle
  | RoundedRectangle
  | PathNode
  | SpacerNode
  | TranslateNode
  | WithColorNode
  | WithStyleNode
  | WithStrokeWidthNode
  | ButtonNode
  | HandlerNode
  | CheckboxNode;

// Collections are drawables too: a vector of nodes is a group, and nil
// draws nothing (group_is_node). A keyed wrapper rides the union as
// renderer metadata (add-keyed-dom-reconciliation): geometry and the
// painters read through it to the inner drawable (the key is metadata;
// the wrapper is transparent), so a keyed row is a first-class Elem.
export type Elem = Node | KeyedDraw | readonly Elem[] | null | undefined;

// Array.isArray does not narrow readonly arrays, so groups get an
// explicit predicate.
export function isGroup(elem: Elem): elem is readonly Elem[] {
  return Array.isArray(elem);
}

// Recursively freeze a constructed node and its nested arrays/objects
// (immutable_nodes: nodes are frozen after construction).
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

// Headless default measure: one cell per character, matching the text
// backend's metrics (backend.render.text_backend_metrics). Real
// backends inject their own measureText-derived function.
export const defaultMeasure: MeasureFn = (text) => [text.length, 1];

// Startup metrics override (tambor-0rp): the advisory text_backend_metrics
// invariant lays apps out in unit cells, but a real-DOM or canvas rendering
// paints glyphs at real font metrics — siblings offset by unit measures
// overlap ('addcomplete' overdraw). A browser entry configures a real
// measureText-derived function BEFORE constructing views; every label
// built afterwards captures it (text_measure_injected: the measure rides
// the node). Unset (tests, headless) the corpus unit default applies.
let measureOverride: MeasureFn | undefined;

export function configureLabelMeasure(measure: MeasureFn): void {
  measureOverride = measure;
}

function currentMeasure(): MeasureFn {
  return measureOverride ?? defaultMeasure;
}

// The active label measure — for emitters that must compute the SAME box
// the layout math used (dom-painters button sizing: button_bounds = label
// bounds + 12, geometry.ts). Exported so rendered geometry equals layout
// geometry and hit-testing geometry (tambor-0rp alignment).
export function currentLabelMeasure(): MeasureFn {
  return currentMeasure();
}

export function label(text: string, measure: MeasureFn = currentMeasure()): Label {
  return deepFreeze({ type: "label", text, measure });
}

export function rectangle(
  width: number,
  height: number,
  stretch: StretchOptions = {},
): Rectangle {
  return deepFreeze({ type: "rectangle", width, height, ...stretch });
}

export function roundedRectangle(
  width: number,
  height: number,
  radius: number,
  stretch: StretchOptions = {},
): RoundedRectangle {
  return deepFreeze({ type: "rounded-rectangle", width, height, radius, ...stretch });
}

export function path(...points: Vec2[]): PathNode {
  return deepFreeze({ type: "path", points });
}

export function spacer(
  x: number,
  y: number,
  stretch: StretchOptions = {},
): SpacerNode {
  return deepFreeze({ type: "spacer", x, y, ...stretch });
}

export function translate(x: number, y: number, drawable: Elem): TranslateNode {
  return deepFreeze({ type: "translate", x, y, drawable });
}

export function button(text: string, onClick?: Handler): ButtonNode {
  const node: { type: "button"; text: string; onClick?: Handler; hover?: boolean } = {
    type: "button",
    text,
  };
  if (onClick !== undefined) node.onClick = onClick;
  return deepFreeze(node);
}

export function on(
  eventType: string,
  handler: Handler,
  ...drawables: readonly Elem[]
): HandlerNode {
  return deepFreeze({ type: "handler", eventType, handler, drawables });
}

export function checkbox(checked: boolean): CheckboxNode {
  return deepFreeze({ type: "checkbox", checked });
}

export function withColor(color: Color, ...drawables: readonly Elem[]): WithColorNode {
  return deepFreeze({ type: "with-color", color, drawables });
}

export function withStyle(style: Style, ...drawables: readonly Elem[]): WithStyleNode {
  return deepFreeze({ type: "with-style", style, drawables });
}

export function withStrokeWidth(
  strokeWidth: number,
  ...drawables: readonly Elem[]
): WithStrokeWidthNode {
  return deepFreeze({ type: "with-stroke-width", strokeWidth, drawables });
}

// The keyed render hint (add-keyed-dom-reconciliation): app-declared
// plain data riding the view tree — the key locates a previous-frame
// sibling by logical identity, the INNER drawable's Elem identity
// confirms the splice (the renderer unwraps before building). Not a
// draw type: no backend parity burden — the wrapper is renderer
// metadata, carried as frozen data like every other view fact.
export interface KeyedDraw {
  readonly type: "keyed";
  readonly key: string | number;
  // UnknownNode fallback parity: a backend that never unwraps (canvas)
  // still draws the inner drawable through its children fallback.
  readonly drawables: readonly [AnyDraw];
}

// key a node (the row's handler/translate node), not a bare group —
// groups cannot carry a field, and an already-keyed wrapper would nest
// lookups the renderer cannot resolve (keyedInner unwraps one level; a
// fresh nested wrapper never identity-matches, so the row would
// silently always-build). Both are rejected loudly at construction,
// mirroring memo's loud contract. A fresh wrapper per call:
// keyed(k, x) !== keyed(k, x) — the wrapper is never an identity
// signal, the renderer looks through it.
export function keyed(key: string | number, drawable: AnyDraw): KeyedDraw {
  const valid =
    (typeof key === "string" && key.length > 0) ||
    (typeof key === "number" && Number.isFinite(key));
  if (!valid)
    throw new TypeError(
      `keyed: key must be a non-empty string or a finite number, got ${String(key)}`,
    );
  if (Array.isArray(drawable))
    throw new TypeError(
      "keyed: groups cannot be keyed — key a node (the row's handler/translate node), not a bare group",
    );
  if (isKeyed(drawable))
    throw new TypeError(
      "keyed: already-keyed drawables cannot be re-keyed — key the row's node, not a wrapper",
    );
  // shallow freeze: the WRAPPER is fresh per call and immutable, but the
  // CALLER's node keeps its own mutability contract — corpus constructors
  // already deep-freeze their nodes, and an app-owned node (the memoized
  // keyed row whose position the view re-skins per frame) must stay
  // assignable or the keyed splice cannot move it (§5.1 focus demo).
  const wrapper = { type: "keyed", key, drawables: [drawable] } as KeyedDraw;
  Object.freeze(wrapper);
  Object.freeze(wrapper.drawables);
  return wrapper;
}

// Look through the keyed wrapper to the drawable that actually builds:
// the renderer reads the wrapper's key for lookup but builds, records
// ranges and compares identity by the INNER Elem (the wrapper is fresh
// per call and never compared by its own identity).
export function keyedInner(draw: AnyDraw): AnyDraw {
  return isKeyed(draw) ? draw.drawables[0] : draw;
}

// Is this draw a keyed wrapper? (The renderer's keyed matching checks
// this before reading child.key.)
export function isKeyed(draw: AnyDraw): draw is KeyedDraw {
  return (
    draw !== null &&
    typeof draw === "object" &&
    !Array.isArray(draw) &&
    (draw as { type?: unknown }).type === "keyed"
  );
}

// The default reconcile key extractor: read the declared `key` field —
// undefined for unkeyed children (they keep M1's positional rule).
export function declaredKey(draw: AnyDraw): string | number | undefined {
  return isKeyed(draw) ? draw.key : undefined;
}

// The ui checkbox draw: a 12 by 12 rounded square with radius 2, gray
// stroke when unchecked, and when checked a blue fill and border with a
// white check path through [2, 6], [5, 9], [10, 2] (checkbox_geometry).
const CHECK_PATH: readonly Vec2[] = [
  [2, 6],
  [5, 9],
  [10, 2],
];
const CHECKBOX_GRAY = 0.6862745098039216;
const CHECKBOX_BORDER: Color = [0.14901960784313725, 0.5254901960784314, 0.9882352941176471];
const CHECKBOX_FILL: Color = [0.2, 0.5607843137254902, 0.9882352941176471];

export function checkboxDraw(checked: boolean): Elem {
  const square = roundedRectangle(12, 12, 2);
  if (!checked) {
    return withStyle("stroke", withColor([CHECKBOX_GRAY, CHECKBOX_GRAY, CHECKBOX_GRAY], square));
  }
  return withStyle("stroke", [
    withStyle("fill", withColor(CHECKBOX_FILL, square)),
    withColor(CHECKBOX_BORDER, square),
    translate(
      0,
      1,
      withStrokeWidth(1.5, withColor([0, 0, 0, 0.3], path(...CHECK_PATH))),
    ),
    withStrokeWidth(1.5, withColor([1, 1, 1], path(...CHECK_PATH))),
  ]);
}

