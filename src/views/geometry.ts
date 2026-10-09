// Purpose: the pure geometry queries of tambor's view-node model.
// Responsibilities: origin, bounds (total over the node union via
//   groupBounds), width, height, children, setWidth, setHeight and
//   makeNode — each dispatching per node type through a table so no
//   function carries the whole vocabulary.
// Rationale: openspec/specs/view-model/spec.md is the design authority; bounds are
//   pure functions (bounds_total, container_bounds_max), containers
//   reduce to the max of child origin plus size (container_bounds_max),
//   and set_size_single_child governs setWidth/setHeight. Split from
//   model.ts so the model stays a thin hub (tambor-272). No behavior
//   beyond the corpus.

import {
  isGroup,
  deepFreeze,
  label,
  translate,
  withColor,
  withStyle,
  withStrokeWidth,
  on,
  checkbox,
  checkboxDraw,
  type Color,
  type Elem,
  type Handler,
  type MeasureFn,
  type Node,
  type Style,
  type Vec2,
} from "./nodes.ts";

type Handler1 = (n: Node) => Vec2;

const atZero = (): Vec2 => [0, 0];

// origin_default: [0, 0] except for Translate and other explicitly
// offset types.
const ORIGINS: Readonly<Record<string, Handler1>> = {
  "label": atZero,
  "rectangle": atZero,
  "rounded-rectangle": atZero,
  "path": atZero,
  "spacer": atZero,
  "translate": (n) => [(n as { x: number }).x, (n as { y: number }).y],
  "with-color": atZero,
  "with-style": atZero,
  "with-stroke-width": atZero,
  "button": atZero,
  "handler": atZero,
  "checkbox": atZero,
};

// The top left corner of an elem's bounds (origin_default: [0, 0]
// except for Translate and other explicitly offset types).
export function origin(elem: Elem): Vec2 {
  if (elem == null || isGroup(elem)) return [0, 0];
  const f = ORIGINS[elem.type];
  if (f === undefined) throw new Error(`unreachable node type: ${elem.type}`);
  return f(elem);
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

// Membrane semantics: the max coordinate on each axis.
function pathBounds(n: Node): Vec2 {
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of (n as { points: readonly Vec2[] }).points) {
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [maxX, maxY];
}

type SizeFn = (n: Node) => Vec2;

// The [width, height] of an elem's bounds with respect to its origin.
const SIZES: Readonly<Record<string, SizeFn>> = {
  "label": (n) => (n as { measure: MeasureFn }).measure((n as { text: string }).text),
  "rectangle": (n) => [(n as { width: number }).width, (n as { height: number }).height],
  "rounded-rectangle": (n) => [(n as { width: number }).width, (n as { height: number }).height],
  "path": pathBounds,
  "spacer": (n) => [(n as { x: number }).x, (n as { y: number }).y],
  "translate": (n) => {
    // child-bounds: origin plus bounds of the drawable.
    const d = (n as { drawable: Elem }).drawable;
    const [ox, oy] = origin(d);
    const [w, h] = bounds(d);
    return [ox + w, oy + h];
  },
  "with-color": (n) => groupBounds((n as { drawables: readonly Elem[] }).drawables),
  "with-style": (n) => groupBounds((n as { drawables: readonly Elem[] }).drawables),
  "with-stroke-width": (n) => groupBounds((n as { drawables: readonly Elem[] }).drawables),
  "handler": (n) => groupBounds((n as { drawables: readonly Elem[] }).drawables),
  "button": (n) => {
    // button_bounds: label bounds plus 12 on each axis.
    const [w, h] = bounds(label((n as { text: string }).text));
    return [w + 12, h + 12];
  },
  "checkbox": (n) => groupBounds([checkboxDraw((n as { checked: boolean }).checked)]),
};

// The [width, height] of an elem's bounds with respect to its origin
// (bounds_total: finite and non-negative for every node, nil is
// [0, 0]).
export function bounds(elem: Elem): Vec2 {
  if (elem == null) return [0, 0];
  if (isGroup(elem)) return groupBounds(elem);
  const f = SIZES[elem.type];
  if (f === undefined) throw new Error(`unreachable node type: ${elem.type}`);
  return f(elem);
}

export function width(elem: Elem): number {
  return bounds(elem)[0];
}

export function height(elem: Elem): number {
  return bounds(elem)[1];
}

type ChildrenFn = (n: Node) => readonly Elem[];

// group_is_node: a vector's children are its elements, nil is empty.
const CHILDREN: Readonly<Record<string, ChildrenFn>> = {
  "label": () => [],
  "rectangle": () => [],
  "rounded-rectangle": () => [],
  "path": () => [],
  "spacer": () => [],
  "button": () => [],
  "translate": (n) => [(n as { drawable: Elem }).drawable],
  "with-color": (n) => (n as { drawables: readonly Elem[] }).drawables,
  "with-style": (n) => (n as { drawables: readonly Elem[] }).drawables,
  "with-stroke-width": (n) => (n as { drawables: readonly Elem[] }).drawables,
  "handler": (n) => (n as { drawables: readonly Elem[] }).drawables,
  "checkbox": (n) => [checkboxDraw((n as { checked: boolean }).checked)],
};

// Sub elements of an elem (group_is_node: a vector's children are its
// elements, nil is empty).
export function children(elem: Elem): readonly Elem[] {
  if (elem == null) return [];
  if (isGroup(elem)) return elem;
  const f = CHILDREN[elem.type];
  if (f === undefined) throw new Error(`unreachable node type: ${elem.type}`);
  return f(elem);
}

// setWidth/setHeight (set_size_single_child): on the handler wrapper
// they succeed only when it has exactly one child and otherwise throw;
// they delegate to the child. Sizeable nodes assoc the new size and
// return a new node; everything else throws.
export function setWidth(elem: Elem, newWidth: number): Elem {
  return setSize(elem, "width", "x", newWidth);
}

export function setHeight(elem: Elem, newHeight: number): Elem {
  return setSize(elem, "height", "y", newHeight);
}

function setSize(elem: Elem, sizeKey: "width" | "height", spacerKey: "x" | "y", v: number): Elem {
  if (elem == null || isGroup(elem)) throw new Error(`can't set ${sizeKey}`);
  switch (elem.type) {
    case "rectangle":
    case "rounded-rectangle":
      return deepFreeze({ ...elem, [sizeKey]: v });
    case "spacer":
      return deepFreeze({ ...elem, [spacerKey]: v });
    case "handler": {
      if (elem.drawables.length !== 1) throw new Error(`can't set ${sizeKey}`);
      return deepFreeze({
        ...elem,
        drawables: [setSize(elem.drawables[0], sizeKey, spacerKey, v)],
      });
    }
    default:
      throw new Error(`can't set ${sizeKey}`);
  }
}

// Rebuild a node with new children so generic traversal can rebuild
// trees (make_node_roundtrip).
export function makeNode(elem: Elem, newChildren: readonly Elem[]): Elem {
  if (elem == null) {
    if (newChildren.length !== 0) throw new Error("can't add children to nil");
    return elem;
  }
  if (isGroup(elem)) return deepFreeze([...newChildren]);
  const rebuild = REBUILDERS[elem.type];
  if (rebuild === undefined) throw new Error(`unreachable node type: ${elem.type}`);
  return rebuild(elem, newChildren);
}

type Rebuilder = (elem: Node, newChildren: readonly Elem[]) => Elem;

// Leaf nodes hold no children; the wrapper nodes rebuild through
// their constructor.
const REBUILDERS: Readonly<Record<string, Rebuilder>> = {
  "translate": (e, cs) => {
    if (cs.length !== 1) throw new Error("translate holds exactly one drawable");
    return translate((e as { x: number }).x, (e as { y: number }).y, cs[0]);
  },
  "with-color": (e, cs) => withColor((e as { color: Color }).color, ...cs),
  "with-style": (e, cs) => withStyle((e as { style: Style }).style, ...cs),
  "with-stroke-width": (e, cs) => withStrokeWidth((e as { strokeWidth: number }).strokeWidth, ...cs),
  "handler": (e, cs) => on((e as { eventType: string }).eventType, (e as { handler: Handler }).handler, ...cs),
  "checkbox": (e) => checkbox((e as { checked: boolean }).checked),
  "label": leaf,
  "rectangle": leaf,
  "rounded-rectangle": leaf,
  "path": leaf,
  "spacer": leaf,
  "button": leaf,
};

function leaf(elem: Node, newChildren: readonly Elem[]): Elem {
  if (newChildren.length !== 0) {
    throw new Error(`${(elem as { type: string }).type} holds no children`);
  }
  return elem;
}

