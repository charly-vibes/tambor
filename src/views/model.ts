// Purpose: tambor's immutable view-node model (view.model spec).
// Responsibilities: the discriminated union of drawable nodes — label,
//   rectangle, rounded-rectangle, path, spacer, translate, style
//   wrappers — plus the pure queries the corpus names: origin, bounds,
//   width, height, children, makeNode.
// Rationale: specs/view-model.md is the design authority; nodes are
//   frozen after construction (immutable_nodes), bounds are pure
//   functions (bounds_total, container_bounds_max), label size comes
//   from an injected measure function (text_measure_injected), and
//   containers reduce to the max of child origin plus size
//   (container_bounds_max). No behavior beyond the corpus.

export type Vec2 = readonly [number, number];
export type Color = readonly number[];
export type MeasureFn = (text: string) => Vec2;

export type Style = "fill" | "stroke" | "stroke-and-fill";

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

export type Node =
  | Label
  | Rectangle
  | RoundedRectangle
  | PathNode
  | SpacerNode
  | TranslateNode
  | WithColorNode
  | WithStyleNode
  | WithStrokeWidthNode;

// Collections are drawables too: a vector of nodes is a group, and nil
// draws nothing (group_is_node).
export type Elem = Node | readonly Elem[] | null | undefined;

// Array.isArray does not narrow readonly arrays, so groups get an
// explicit predicate.
function isGroup(elem: Elem): elem is readonly Elem[] {
  return Array.isArray(elem);
}

// Recursively freeze a constructed node and its nested arrays/objects
// (immutable_nodes: nodes are frozen after construction).
function deepFreeze<T>(value: T): T {
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

export function label(text: string, measure: MeasureFn = defaultMeasure): Label {
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

// The top left corner of an elem's bounds (origin_default: [0, 0]
// except for Translate and other explicitly offset types).
export function origin(elem: Elem): Vec2 {
  if (elem == null || isGroup(elem)) return [0, 0];
  switch (elem.type) {
    case "translate":
      return [elem.x, elem.y];
    case "label":
    case "rectangle":
    case "rounded-rectangle":
    case "path":
    case "spacer":
    case "with-color":
    case "with-style":
    case "with-stroke-width":
      return [0, 0];
  }
  throw new Error(`unreachable node type: ${(elem as Node).type}`);
}

// Bounds of a group: max over children of origin plus size, starting
// from [0, 0] (container_bounds_max).
function groupBounds(elems: readonly Elem[]): Vec2 {
  let w = 0;
  let h = 0;
  for (const elem of elems) {
    const [ox, oy] = origin(elem);
    const [ew, eh] = bounds(elem);
    w = Math.max(w, ox + ew);
    h = Math.max(h, oy + eh);
  }
  return [w, h];
}

// The [width, height] of an elem's bounds with respect to its origin
// (bounds_total: finite and non-negative for every node, nil is
// [0, 0]).
export function bounds(elem: Elem): Vec2 {
  if (elem == null) return [0, 0];
  if (isGroup(elem)) return groupBounds(elem);
  switch (elem.type) {
    case "label":
      return elem.measure(elem.text);
    case "rectangle":
    case "rounded-rectangle":
      return [elem.width, elem.height];
    case "path": {
      // Membrane semantics: the max coordinate on each axis.
      let maxX = 0;
      let maxY = 0;
      for (const [x, y] of elem.points) {
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      return [maxX, maxY];
    }
    case "spacer":
      return [elem.x, elem.y];
    case "translate": {
      // child-bounds: origin plus bounds of the drawable.
      const [ox, oy] = origin(elem.drawable);
      const [w, h] = bounds(elem.drawable);
      return [ox + w, oy + h];
    }
    case "with-color":
    case "with-style":
    case "with-stroke-width":
      return groupBounds(elem.drawables);
  }
  throw new Error(`unreachable node type: ${(elem as Node).type}`);
}

export function width(elem: Elem): number {
  return bounds(elem)[0];
}

export function height(elem: Elem): number {
  return bounds(elem)[1];
}

// Sub elements of an elem (group_is_node: a vector's children are its
// elements, nil is empty).
export function children(elem: Elem): readonly Elem[] {
  if (elem == null) return [];
  if (isGroup(elem)) return elem;
  switch (elem.type) {
    case "translate":
      return [elem.drawable];
    case "with-color":
    case "with-style":
    case "with-stroke-width":
      return elem.drawables;
    case "label":
    case "rectangle":
    case "rounded-rectangle":
    case "path":
    case "spacer":
      return [];
  }
  throw new Error(`unreachable node type: ${(elem as Node).type}`);
}

// Rebuild a node with new children so generic traversal can rebuild
// trees (make_node_roundtrip).
export function makeNode(elem: Elem, newChildren: readonly Elem[]): Elem {
  if (elem == null) {
    if (newChildren.length !== 0) throw new Error("can't add children to nil");
    return elem;
  }
  if (isGroup(elem)) return deepFreeze([...newChildren]);
  switch (elem.type) {
    case "translate":
      if (newChildren.length !== 1) {
        throw new Error("translate holds exactly one drawable");
      }
      return translate(elem.x, elem.y, newChildren[0]);
    case "with-color":
      return withColor(elem.color, ...newChildren);
    case "with-style":
      return withStyle(elem.style, ...newChildren);
    case "with-stroke-width":
      return withStrokeWidth(elem.strokeWidth, ...newChildren);
    case "label":
    case "rectangle":
    case "rounded-rectangle":
    case "path":
    case "spacer":
      if (newChildren.length !== 0) {
        throw new Error(`${elem.type} holds no children`);
      }
      return elem;
  }
  throw new Error(`unreachable node type: ${(elem as Node).type}`);
}
