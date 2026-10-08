---
id: components.pinned_panel
kind: intent
checked_against_core: clear
statement: "WHEN a pinned_panel's ambient scrollview offset lies within its
  configured activation range, THE pinned_panel SHALL draw its body
  untranslated at a fixed screen position while reserving its normal-flow
  slot with an equivalently-sized spacer, so the surrounding scrollview's
  own content height is unaffected by activation state."
---

# components.pinned_panel

Membrane has no native "position: fixed" — `components.scrollview` draws
its body translated by `[-ox, -oy]` inside a clip
([[components.scrollview.content_translated]]). A pinned_panel is a plain
component that reads that same offset as a **contextual** prop (the
mechanism [[component.model.contextual_source]] already defines for
`textarea`'s `focus`) and, within its activation range, draws its body
at the untranslated position instead of the ambient translated one. It is
new: modelled on the existing corpus's conventions, not ported from
`phronmophobic/membrane`, since the source library has no pinning
primitive.

Props: `activation-range` (`[start, end]` in content-space y, required),
`body`, and an optional `z` for stacking order. `offset` is **not** a
declared prop — it is read the way `focus` is, from `context.scroll`,
so a call site cannot accidentally override it (mirrors
[[component.model.contextual_source]]'s "the call site cannot override it").

Composition note (prose, not a structured reference — `observes` is
reserved for `effect`-kind Constraints per the format's Reference Typing
table, and none of the related rows here are effects):
`body_drawn_untranslated_when_active` and `spacer_matches_body_extent`
below depend on [[components.scrollview.content_translated]] and
[[components.scrollview.range_formula]] staying true of the ambient
scrollview; `render_pure` below is [[component.model.render_pure]]
applied to this component specifically.

## Constraints

| id                                  | kind      | expr                                                                                                              | traces_to                   |
|--------------------------------------|-----------|---------------------------------------------------------------------------------------------------------------------|---------------------------------|
| contextual_offset | invariant | the driving offset is read from `context.scroll`, never from a call-site prop, exactly as `focus` is contextual for textarea | [[components.pinned_panel]] |
| activation_range_formula | invariant | the panel is active iff `activation-range.start ≤ offset.y ≤ activation-range.end` | [[components.pinned_panel]] |
| body_drawn_untranslated_when_active | invariant | while active, the body draws at the fixed screen position it would occupy when `offset.y == activation-range.start`, ignoring the ambient scrollview translation | [[components.pinned_panel]] |
| spacer_matches_body_extent | invariant | a spacer occupying the body's full authored extent (`activation-range.end − activation-range.start` content-space units) is present in untranslated content flow at all times, active or not, so the ambient scrollview's own range_formula total height is unaffected by activation state | [[components.pinned_panel]] |
| release_continuous | invariant | at `offset.y == activation-range.end`, the screen position computed by the active branch equals the screen position computed by the inactive (normally-translated) branch — no discontinuity across the boundary | [[components.pinned_panel]] |
| nested_panel_priority | invariant | when two pinned_panels are simultaneously active, the one later in the view tree paints on top, unless an explicit `z` prop overrides this | [[components.pinned_panel]] |
| render_pure | invariant | activation, screen position and spacer height are all computed solely from `offset`, `activation-range` and `body` — no I/O, no imperative stored state, recomputed fresh every render | [[components.pinned_panel]] |

## Model

### States
- `inactive`
- `active`

### Transitions

| id            | from     | to       | guard                                                  |
|---------------|----------|----------|--------------------------------------------------------------|
| t_activate | inactive | active | [[components.pinned_panel.activation_range_formula]] |
| t_deactivate | active | inactive | [[components.pinned_panel.activation_range_formula]] |

## Properties

| id                     | kind | derives_from                                               | generator                                                | predicate                                                        |
|---------------------------|------|--------------------------------------------------------------------|------------------------------------------------------------------|------------------------------------------------------------------------|
| p_contextual_source | unit | [[components.pinned_panel.contextual_offset]] | `panel nested under a scrollview with context.scroll set` | offset value equals `context.scroll`, never a call-site literal |
| p_activation | unit | [[components.pinned_panel.activation_range_formula]] | `offset swept across and beyond the range` | active exactly on `[start, end]`, inactive outside it |
| p_fixed_position | unit | [[components.pinned_panel.body_drawn_untranslated_when_active]] | `offset swept while active` | body's screen position is constant across every sampled offset |
| p_spacer_constant | unit | [[components.pinned_panel.spacer_matches_body_extent]] | `panel toggled active and inactive` | total scrollview content height is unchanged by activation state |
| p_no_jump | unit | [[components.pinned_panel.release_continuous]] | `offset stepped across activation-range.end` | screen position immediately before and after the step are equal |
| p_nested_priority | unit | [[components.pinned_panel.nested_panel_priority]] | `two overlapping panels, no z prop` | the later-in-tree panel paints on top |
| p_pure | unit | [[components.pinned_panel.render_pure]] | `same offset supplied twice` | identical output view value both times |

## Notes

`checked_against_core: clear`. Deliberately **not** carried over from the
original `scrollytelling-pin.md`: a `focus_releases_pin` guarantee
(Pin should not trap keyboard focus). This corpus's `component.model`
specifies `event_forwarding` (a component forwards key events to its
rendered view) but nothing about tab order or focus traversal across
Membrane's own component tree — that's an open gap in the *Membrane*
corpus itself, not something `pinned_panel` can honestly claim to solve
by composition. Flagged rather than silently dropped; see
`scrollytelling-pin.md`'s Notes for the corresponding open item.

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_contextual_source

- **WHEN** `panel nested under a scrollview with context.scroll set`
- **THEN** offset value equals `context.scroll`, never a call-site literal
- **VERIFIES** [[components.pinned_panel.p_contextual_source]]

#### Scenario: p_activation

- **WHEN** `offset swept across and beyond the range`
- **THEN** active exactly on `[start, end]`, inactive outside it
- **VERIFIES** [[components.pinned_panel.p_activation]]

#### Scenario: p_fixed_position

- **WHEN** `offset swept while active`
- **THEN** body's screen position is constant across every sampled offset
- **VERIFIES** [[components.pinned_panel.p_fixed_position]]

#### Scenario: p_spacer_constant

- **WHEN** `panel toggled active and inactive`
- **THEN** total scrollview content height is unchanged by activation state
- **VERIFIES** [[components.pinned_panel.p_spacer_constant]]

#### Scenario: p_no_jump

- **WHEN** `offset stepped across activation-range.end`
- **THEN** screen position immediately before and after the step are equal
- **VERIFIES** [[components.pinned_panel.p_no_jump]]

#### Scenario: p_nested_priority

- **WHEN** `two overlapping panels, no z prop`
- **THEN** the later-in-tree panel paints on top
- **VERIFIES** [[components.pinned_panel.p_nested_priority]]

#### Scenario: p_pure

- **WHEN** `same offset supplied twice`
- **THEN** identical output view value both times
- **VERIFIES** [[components.pinned_panel.p_pure]]

