---
id: spec
kind: intent
statement: "THE view model SHALL represent every drawable as an immutable node with computable origin, bounds and children."
---

# view.model

Port of the `membrane.ui` records: Label, Rectangle, RoundedRectangle, Path, Image, Translate, Padding, Spacer, FixedBounds, WithColor, WithStyle, WithStrokeWidth, Scale, Rotate, Bordered, FillBordered, Checkbox, Button and ScissorView. Collections are drawables too: a vector or list of nodes is a group, and `nil` draws nothing. Node types form one discriminated union (see typing.model). Container nodes expose `children` and `makeNode(node, newChildren)` so generic traversal can rebuild trees. Bounds are pure functions, so layout needs no mounted DOM (the README's `ui/bounds` example: a label above a checkbox measures without any window).

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| immutable_nodes | invariant | nodes are frozen after construction and typed readonly; updates return new nodes | [[spec]] |
| bounds_total | invariant | bounds(node) returns [w, h] with w and h finite and at least 0 for every node type, and nil has bounds [0, 0] | [[spec]] |
| container_bounds_max | invariant | a container with no explicit size has bounds equal to the max over children of origin plus size, starting from [0, 0] | [[spec]] |
| translate_origin | invariant | Translate(x, y, d) has origin [x, y] and bounds equal to the child bounds, so the offset shows up as origin and not as size | [[spec]] |
| origin_default | invariant | origin(node) is [0, 0] for every node except Translate and other explicitly offset types | [[spec]] |
| group_is_node | invariant | a vector or list of nodes behaves as a group node whose children are its elements, and nil behaves as an empty node | [[spec]] |
| make_node_roundtrip | invariant | makeNode(node, children(node)) deep-equals node | [[spec]] |
| text_measure_injected | invariant | label size comes from an injected measure function so bounds work headless and per backend | [[spec]] |
| button_bounds | invariant | button bounds equal label bounds plus 12 on each axis | [[spec]] |
| set_size_single_child | invariant | setWidth and setHeight on a handler wrapper succeed only when it has exactly one child and otherwise throw | [[spec]] |
| checkbox_geometry | invariant | the ui checkbox is a 12 by 12 rounded square with radius 2, gray stroke when unchecked, and when checked a blue fill and border [0.2, 0.56, 0.99] with a white check path through [2, 6], [5, 9], [10, 2] | [[spec]] |
| style_wrappers_transparent | invariant | WithColor, WithStyle and WithStrokeWidth do not change bounds of their children | [[spec]] |

## Model

### States

- `constructed`
- `measured`
- `drawn`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_measure | constructed | measured | [[spec.bounds_total]] |
| t_draw | measured | drawn | [[spec.immutable_nodes]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_frozen | unit | [[spec.immutable_nodes]] | random nodes | assigning to a node throws or is ignored |
| p_bounds | unit | [[spec.bounds_total]] | random trees | all bounds are finite and non-negative, and bounds(nil) equals [0, 0] |
| p_container | unit | [[spec.container_bounds_max]] | children with random origins and sizes | bounds equal the max of origin plus size |
| p_translate | unit | [[spec.translate_origin]] | random offsets | origin equals [x, y] and bounds equal child bounds |
| p_origin | unit | [[spec.origin_default]] | non-offset nodes | origin equals [0, 0] |
| p_group | unit | [[spec.group_is_node]] | vectors with nil members | children are the elements and nil members measure [0, 0] |
| p_roundtrip | unit | [[spec.make_node_roundtrip]] | random trees | makeNode(n, children(n)) deep-equals n |
| p_measure | unit | [[spec.text_measure_injected]] | stub measure fn | label bounds equal the stub output |
| p_button_bounds | unit | [[spec.button_bounds]] | random label text | bounds equal label bounds plus [12, 12] |
| p_set_size | unit | [[spec.set_size_single_child]] | wrappers with one and two children | one child succeeds and two children throws |
| p_checkbox_geometry | unit | [[spec.checkbox_geometry]] | checked true and false | bounds are 12 by 12 in both states and only the checked view has the check path |
| p_style | unit | [[spec.style_wrappers_transparent]] | random colors and styles | bounds equal the unwrapped bounds |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_frozen

- **WHEN** random nodes
- **THEN** assigning to a node throws or is ignored
- **VERIFIES** [[spec.p_frozen]]

#### Scenario: p_bounds

- **WHEN** random trees
- **THEN** all bounds are finite and non-negative, and bounds(nil) equals [0, 0]
- **VERIFIES** [[spec.p_bounds]]

#### Scenario: p_container

- **WHEN** children with random origins and sizes
- **THEN** bounds equal the max of origin plus size
- **VERIFIES** [[spec.p_container]]

#### Scenario: p_translate

- **WHEN** random offsets
- **THEN** origin equals [x, y] and bounds equal child bounds
- **VERIFIES** [[spec.p_translate]]

#### Scenario: p_origin

- **WHEN** non-offset nodes
- **THEN** origin equals [0, 0]
- **VERIFIES** [[spec.p_origin]]

#### Scenario: p_group

- **WHEN** vectors with nil members
- **THEN** children are the elements and nil members measure [0, 0]
- **VERIFIES** [[spec.p_group]]

#### Scenario: p_roundtrip

- **WHEN** random trees
- **THEN** makeNode(n, children(n)) deep-equals n
- **VERIFIES** [[spec.p_roundtrip]]

#### Scenario: p_measure

- **WHEN** stub measure fn
- **THEN** label bounds equal the stub output
- **VERIFIES** [[spec.p_measure]]

#### Scenario: p_button_bounds

- **WHEN** random label text
- **THEN** bounds equal label bounds plus [12, 12]
- **VERIFIES** [[spec.p_button_bounds]]

#### Scenario: p_set_size

- **WHEN** wrappers with one and two children
- **THEN** one child succeeds and two children throws
- **VERIFIES** [[spec.p_set_size]]

#### Scenario: p_checkbox_geometry

- **WHEN** checked true and false
- **THEN** bounds are 12 by 12 in both states and only the checked view has the check path
- **VERIFIES** [[spec.p_checkbox_geometry]]

#### Scenario: p_style

- **WHEN** random colors and styles
- **THEN** bounds equal the unwrapped bounds
- **VERIFIES** [[spec.p_style]]

