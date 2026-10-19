---
id: components.canvas_layer
kind: intent
statement: "WHEN a subtree's big data is held by reference and the layer is derived with a data reference that is unchanged THE canvas_layer SHALL replay the cached raster as a single image node without deriving the wrapped subtree, and SHALL re-derive and re-rasterize exactly once when the data reference changes."
---

# components.canvas_layer

The canvas-layer component (tambor-54j.8.3, the §4.8 canvas seam):
`canvasLayer({ width, height, draw })` returns a layer render function —
an app creates it once (module scope, the memo `memo(build)` shape) and
calls it per derive with the data object it draws. The cache key is the
data object's reference identity, one WeakMap per layer, so data that
leaves app state (a load op replacing the points) lets its cached raster
be collected. The layer's view is a single image node whose data is the
cached raster — the wrapped subtree (`draw(data)`) is derived once per
distinct data reference and never again while the reference holds, and
the backend replays the raster through its image painter instead of
walking the subtree's nodes.

The boundary sits where the BZ2 evidence says the cost is: a tambor
dispatch re-derives the whole view and re-paints the whole drawn subtree
on every op, and the per-op cost scales with drawn nodes (1600 path
nodes → 606 ms, 400 → 183 ms — benchmarks/findings-bz.md, BZ2), not with
data size. An op that leaves the data untouched — a pan, a zoom, a
control flip — still pays the full drawn subtree. The layer removes that
per-op re-derivation and re-paint for the wrapped subtree: a pan
translate sits outside the layer, so the drawn pixels still move while
the raster is replayed. Identity is the invalidation signal for the same
reason memo's is (components.memo): state changes only through dispatch
and every dispatch produces fresh identity for each changed slice with
structural sharing preserving unchanged slices, so an untouched data
slice keeps its reference and a changed one loses it.

The raster seam (raster.ts) is DOM-free: it reuses the backend's
per-type painters (the same primitive_set traversal the canvas backend's
draw performs) over the headless Painter into an ImageBuffer, so the
cached pixels are exactly the pixels the wrapped subtree would have
painted — headless_render is the canvas backend's native mode.

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| ref_keyed | invariant | a derive with a data reference already in the layer's cache returns the cached raster — the wrapped subtree is not derived again; a data reference the cache has not seen derives the wrapped subtree once and rasterizes it | [[components.canvas_layer]] |  |
| by_ref_state | invariant | the data is held by reference: the layer never copies the payload and never deep-compares it — a structurally equal but distinct data object is a miss and re-derives | [[components.canvas_layer]] |  |
| draw_once | invariant | the wrapped subtree's draw function is invoked at most once per distinct data reference — the drawn-tree derivation of the wrapped subtree is skipped for every derive while the reference holds | [[components.canvas_layer]] |  |
| image_node | invariant | the layer's view is exactly one image node carrying the cached raster — one drawn primitive replaces the wrapped subtree's nodes, and the app positions it with ordinary view nodes (a pan translate outside the layer) | [[components.canvas_layer]] |  |
| raster_pure | invariant | the raster is a pure function of the wrapped subtree, the width and the height: two rasterizations of the same subtree produce equal pixels, so a replayed raster is the pixels the subtree would have painted | [[components.canvas_layer]] |  |
| reject_primitive | invariant | a data value that is not an object (a primitive or null) is rejected with a TypeError at the derive, never silently keyed | [[components.canvas_layer]] |  |

## Model

### States

- `cold`
- `warm`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_raster | cold | warm | [[components.canvas_layer.ref_keyed]] |
| t_replay | warm | warm | [[components.canvas_layer.draw_once]] |
| t_invalidate | warm | warm | [[components.canvas_layer.by_ref_state]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_ref_hit | unit | [[components.canvas_layer.ref_keyed]] | the same data reference derived twice through one layer | the wrapped subtree is derived once and both derives carry the identical cached raster |
| p_invalidate | unit | [[components.canvas_layer.ref_keyed]] | a data array then a fresh copy of it through one layer | the fresh reference re-derives once and its raster is cached on the next derive |
| p_no_deep | unit | [[components.canvas_layer.by_ref_state]] | two structurally equal but distinct data arrays | each derives — the wrapped subtree is derived twice |
| p_subtree_skipped | unit | [[components.canvas_layer.draw_once]] | one data reference across a 12-op pan cycle, against an un-layered arm deriving per op | the layered arm derives the wrapped subtree exactly once; the un-layered arm derives it every op |
| p_single_node | unit | [[components.canvas_layer.image_node]] | the layer's view for any data reference | the view is exactly one image node whose data is the cached raster buffer |
| p_raster_deterministic | unit | [[components.canvas_layer.raster_pure]] | the same subtree rasterized twice | the two buffers have equal pixels |
| p_reject | unit | [[components.canvas_layer.reject_primitive]] | data values 1, "x" and null | each derive throws TypeError |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated test;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_ref_hit

- **WHEN** the same data reference derived twice through one layer
- **THEN** the wrapped subtree is derived once and both derives carry the identical cached raster
- **VERIFIES** [[components.canvas_layer.p_ref_hit]]

#### Scenario: p_invalidate

- **WHEN** a data array then a fresh copy of it through one layer
- **THEN** the fresh reference re-derives once and its raster is cached on the next derive
- **VERIFIES** [[components.canvas_layer.p_invalidate]]

#### Scenario: p_no_deep

- **WHEN** two structurally equal but distinct data arrays
- **THEN** each derives — the wrapped subtree is derived twice
- **VERIFIES** [[components.canvas_layer.p_no_deep]]

#### Scenario: p_subtree_skipped

- **WHEN** one data reference across a 12-op pan cycle, against an un-layered arm deriving per op
- **THEN** the layered arm derives the wrapped subtree exactly once; the un-layered arm derives it every op
- **VERIFIES** [[components.canvas_layer.p_subtree_skipped]]

#### Scenario: p_single_node

- **WHEN** the layer's view for any data reference
- **THEN** the view is exactly one image node whose data is the cached raster buffer
- **VERIFIES** [[components.canvas_layer.p_single_node]]

#### Scenario: p_raster_deterministic

- **WHEN** the same subtree rasterized twice
- **THEN** the two buffers have equal pixels
- **VERIFIES** [[components.canvas_layer.p_raster_deterministic]]

#### Scenario: p_reject

- **WHEN** data values 1, "x" and null
- **THEN** each derive throws TypeError
- **VERIFIES** [[components.canvas_layer.p_reject]]
