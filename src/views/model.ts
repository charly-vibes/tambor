// Purpose: tambor's immutable view-node model (view.model spec).
// Responsibilities: the discriminated union of drawable nodes — label,
//   rectangle, rounded-rectangle, path, spacer, translate, style
//   wrappers — plus the pure queries the corpus names: origin, bounds,
//   width, height, children, makeNode.
// Rationale: openspec/specs/view-model/spec.md is the design authority; nodes are
//   frozen after construction (immutable_nodes), bounds are pure
//   functions (bounds_total, container_bounds_max), label size comes
//   from an injected measure function (text_measure_injected), and
//   containers reduce to the max of child origin plus size
//   (container_bounds_max). No behavior beyond the corpus.

export {
  isGroup,
  label,
  rectangle,
  roundedRectangle,
  path,
  spacer,
  translate,
  button,
  on,
  checkbox,
  withColor,
  withStyle,
  withStrokeWidth,
  defaultMeasure,
  type Vec2,
  type Color,
  type MeasureFn,
  type Style,
  type Handler,
  type StretchOptions,
  type Label,
  type Rectangle,
  type RoundedRectangle,
  type PathNode,
  type SpacerNode,
  type TranslateNode,
  type WithColorNode,
  type WithStyleNode,
  type WithStrokeWidthNode,
  type ButtonNode,
  type HandlerNode,
  type CheckboxNode,
  type Node,
  type Elem,
} from "./nodes.ts";

export {
  origin,
  bounds,
  width,
  height,
  children,
  setWidth,
  setHeight,
  makeNode,
} from "./geometry.ts";
