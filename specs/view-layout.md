---
id: view.layout
kind: intent
statement: "WHEN a layout combinator receives child nodes THE layout engine SHALL return translated children placed in order along the layout axis with a one pixel gap."
---

# view.layout

Port of `vertical-layout`, `horizontal-layout`, `table-layout`, `center`, `padding`, and the stretch-width and stretch-height protocols. The original loops as: the first child stays at the origin, the next offset is first size plus origin plus 1, and each later child is translated by the running offset, which then grows by child size plus origin plus 1. The todo example adds `spacer(0, 5)` between rows with `interpose`. Layout is pure: it only wraps children in Translate nodes.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| vstack_offsets | invariant | the first child is untranslated and child i (i at least 1) is translated on y by the sum over j below i of height plus origin y plus 1, with the gap configurable and defaulting to 1 | [[view.layout]] |
| hstack_offsets | invariant | the same rule on the x axis using width and origin x | [[view.layout]] |
| layout_empty_nil | invariant | a layout of zero children returns nil and does not throw | [[view.layout]] |
| spacer_occupies | invariant | a spacer(x, y) has bounds [x, y], draws nothing and shifts later siblings by its size plus the gap | [[view.layout]] |
| center_exact | invariant | center(elem, [W, H]) translates elem by ((W - w) / 2, (H - h) / 2) | [[view.layout]] |
| table_columns_aligned | invariant | in table-layout every cell in a column shares an x offset equal to the sum of earlier column widths plus padding, and every cell in a row shares a y offset likewise | [[view.layout]] |
| stretch_resolved | invariant | a node reporting stretch-width or stretch-height is resolved against the container size before drawing | [[view.layout]] |
| layout_pure | invariant | layout reads and writes no DOM and no global state | [[view.layout]] |
| layout_reflows | invariant | layout is a function of container size and content, so a changed container size yields a new layout with no stale cache | [[view.layout]] |

## Model

### States

- `unplaced`
- `placed`
- `stretched`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_place | unplaced | placed | [[view.layout.vstack_offsets]] |
| t_stretch | placed | stretched | [[view.layout.stretch_resolved]] |
| t_reflow | stretched | placed | [[view.layout.layout_reflows]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_vstack | unit | [[view.layout.vstack_offsets]] | random child sizes | children are ordered with no vertical overlap, and sizes 10, 20, 30 give offsets 0, 11 and 32 |
| p_hstack | unit | [[view.layout.hstack_offsets]] | random child sizes | no horizontal overlap, and widths 10, 20 give offsets 0 and 11 |
| p_empty | unit | [[view.layout.layout_empty_nil]] | no children | result is nil and nothing throws |
| p_spacer | unit | [[view.layout.spacer_occupies]] | random spacer sizes | spacer(0, 5) between two rows pushes the second row down by 5 plus gaps |
| p_center | unit | [[view.layout.center_exact]] | random sizes | offsets equal half the free space |
| p_table | unit | [[view.layout.table_columns_aligned]] | random tables | columns and rows align |
| p_stretch | unit | [[view.layout.stretch_resolved]] | random container sizes | no stretch node remains after resolution |
| p_layout_pure | unit | [[view.layout.layout_pure]] | headless runtime | layout runs with no DOM |
| p_reflow | unit | [[view.layout.layout_reflows]] | widths 320 then 768 | the second layout differs and is not a cached copy of the first |
