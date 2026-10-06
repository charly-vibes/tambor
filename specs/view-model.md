---
id: view.model
kind: intent
statement: "THE view model SHALL represent every drawable as an immutable node with computable origin, bounds and children."
---

# view.model

Port of the `membrane.ui` records: Label, Rectangle, RoundedRectangle, Path, Image, Translate, Padding, Spacer, FixedBounds, WithColor, WithStyle, WithStrokeWidth, Scale, Rotate, Bordered, FillBordered, Checkbox, Button and ScissorView. Collections are drawables too: a vector or list of nodes is a group, and `nil` draws nothing. Node types form one discriminated union (see typing.model). Container nodes expose `children` and `makeNode(node, newChildren)` so generic traversal can rebuild trees. Bounds are pure functions, so layout needs no mounted DOM (the README's `ui/bounds` example: a label above a checkbox measures without any window).

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| immutable_nodes | invariant | nodes are frozen after construction and typed readonly; updates return new nodes | [[view.model]] |
| bounds_total | invariant | bounds(node) returns [w, h] with w and h finite and at least 0 for every node type, and nil has bounds [0, 0] | [[view.model]] |
| container_bounds_max | invariant | a container with no explicit size has bounds equal to the max over children of origin plus size, starting from [0, 0] | [[view.model]] |
| translate_origin | invariant | Translate(x, y, d) has origin [x, y] and bounds equal to the child bounds, so the offset shows up as origin and not as size | [[view.model]] |
| origin_default | invariant | origin(node) is [0, 0] for every node except Translate and other explicitly offset types | [[view.model]] |
| group_is_node | invariant | a vector or list of nodes behaves as a group node whose children are its elements, and nil behaves as an empty node | [[view.model]] |
| make_node_roundtrip | invariant | makeNode(node, children(node)) deep-equals node | [[view.model]] |
| text_measure_injected | invariant | label size comes from an injected measure function so bounds work headless and per backend | [[view.model]] |
| button_bounds | invariant | button bounds equal label bounds plus 12 on each axis | [[view.model]] |
| set_size_single_child | invariant | setWidth and setHeight on a handler wrapper succeed only when it has exactly one child and otherwise throw | [[view.model]] |
| checkbox_geometry | invariant | the ui checkbox is a 12 by 12 rounded square with radius 2, gray stroke when unchecked, and when checked a blue fill and border [0.2, 0.56, 0.99] with a white check path through [2, 6], [5, 9], [10, 2] | [[view.model]] |
| style_wrappers_transparent | invariant | WithColor, WithStyle and WithStrokeWidth do not change bounds of their children | [[view.model]] |

## Model

### States

- `constructed`
- `measured`
- `drawn`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_measure | constructed | measured | [[view.model.bounds_total]] |
| t_draw | measured | drawn | [[view.model.immutable_nodes]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_frozen | unit | [[view.model.immutable_nodes]] | random nodes | assigning to a node throws or is ignored |
| p_bounds | unit | [[view.model.bounds_total]] | random trees | all bounds are finite and non-negative, and bounds(nil) equals [0, 0] |
| p_container | unit | [[view.model.container_bounds_max]] | children with random origins and sizes | bounds equal the max of origin plus size |
| p_translate | unit | [[view.model.translate_origin]] | random offsets | origin equals [x, y] and bounds equal child bounds |
| p_origin | unit | [[view.model.origin_default]] | non-offset nodes | origin equals [0, 0] |
| p_group | unit | [[view.model.group_is_node]] | vectors with nil members | children are the elements and nil members measure [0, 0] |
| p_roundtrip | unit | [[view.model.make_node_roundtrip]] | random trees | makeNode(n, children(n)) deep-equals n |
| p_measure | unit | [[view.model.text_measure_injected]] | stub measure fn | label bounds equal the stub output |
| p_button_bounds | unit | [[view.model.button_bounds]] | random label text | bounds equal label bounds plus [12, 12] |
| p_set_size | unit | [[view.model.set_size_single_child]] | wrappers with one and two children | one child succeeds and two children throws |
| p_checkbox_geometry | unit | [[view.model.checkbox_geometry]] | checked true and false | bounds are 12 by 12 in both states and only the checked view has the check path |
| p_style | unit | [[view.model.style_wrappers_transparent]] | random colors and styles | bounds equal the unwrapped bounds |
