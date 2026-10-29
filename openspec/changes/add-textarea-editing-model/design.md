# Design: add-textarea-editing-model

## Context

The textarea's edit logic is already pure data-in/data-out
(`applyTextareaIntents`, named effects with text and extra paths), which
is what makes this change cheap: the buffer is a pure model, and the
component only routes events to it. Two constraints shape everything:
the Membrane acceptance baseline must stay green, and the component
must remain a value-in/intents-out function (the Functional UI Model).

## Goals / Non-Goals

- Goals: correct multi-line editing; every behavior a property; zero
  change for existing consumers.
- Non-goals: wrap, host wiring, rich text (see proposal).

## Decisions

### D1. Opt-in `profile`, default `"membrane"`

Quirks such as `previous_line_quirk` are *specified* behavior and
traced to the original. Changing `key_map` in place would invalidate
the baseline the corpus is built against.

*Alternatives considered:* (a) flip behavior and mark quirks superseded
— rejected, it breaks the acceptance-baseline stance; (b) new effect
names without a profile — rejected, `key_map` would still need one
default, so a prop is the honest switch. A later major may flip the
default.

### D2. Index unit stays code points; graphemes are boundary snapping

`cursor` / `select-cursor` and `indexForPosition` index code points.
Moving to grapheme indices would break stored state and the backend
contract. Instead every buffer operation snaps results to cluster
boundaries (`Intl.Segmenter`, granularity `grapheme`) and delete steps
over whole clusters. Invariant: a cursor never rests inside a cluster.

### D3. Geometry is injected, not ambient

Operations that need widths take `Metrics { measure(text): number;
lineHeight: number }`. Tests use a fixed-width stub; the DOM and canvas
backends supply their measure function. This keeps the buffer headless
and avoids reading DOM state.

*Risk:* the DOM backend measures with its own 16px font while the page
may style text differently, so x-based goals and hit-tests can drift
from what is drawn. Mitigation: no new font model here; the same
measure that lays out text is the one used for hit-testing.

### D4. Goal column is an x offset, not a column count

Text is proportional, so vertical movement preserves `goalX` (units of
`measure`), set by any horizontal movement or pointer placement and
kept across consecutive up/down moves. A column count would drift on
proportional fonts.

### D5. Multi-line hit-test lives in the buffer, not the backend

`indexForPosition` stays single-line (no backend contract change). The
buffer picks the line from `y / lineHeight`, then calls the existing
single-line service with that line's text and the x offset. The inverse
`positionFor(index)` is the same math in reverse; the round trip is a
property.

### D6. Undo is a bounded timeline of splices

History entries are `{ at, deleted, inserted, before, after }` (splice
plus selection before/after). Undo applies the inverse splice and
restores `before`; redo reapplies. A new edit after undo discards the
redo tail (branch-on-act), the same semantics as the log-with-cursor
pattern used elsewhere. Consecutive single-character inserts coalesce
into one entry until a boundary (whitespace, newline, cursor jump, or
a time gap via the existing `now` prop). Length is bounded.

Textarea-local history covers only edits inside the focused textarea;
app-level undo (`handler_overridable`) is unaffected and out of scope.

### D7. Word boundaries are class-based

A word is a run of letters/digits/underscore; whitespace and each
punctuation run are their own stops. Simple, deterministic, headless.
*Alternative:* `Intl.Segmenter` word granularity — more correct for CJK
but locale/ICU dependent; revisit if CJK editing becomes a requirement.

### D8. Key routing in the extended profile

Plain keys follow the existing map; shift extends the head; ctrl/meta
selects commands (`a` select-all, `z` undo, shift+`z` / `y` redo,
left/right word, home/end document). Unknown modified keys remain
ignored, preserving `keys_need_focus` and the "modified key is not
text" rule.

## Risks / Trade-offs

- Two profiles double the surface to test; mitigated by running the
  full existing suite under `"membrane"` and a shared op-sequence
  property under `"extended"`.
- Selection collapse differs by profile (extended collapses to the
  selection edge; membrane moves from the cursor). Documented as a
  scenario in each.
- Coalescing thresholds are heuristics; they are props with defaults,
  not spec'd constants.

## Open Questions

1. Keep `"membrane"` as the long-term default, or plan a major-version
   flip once the extended profile has baked?
2. Class-based words (D7) vs `Intl.Segmenter` word granularity?
3. Should `history` live in the extra map (proposed) or be hoisted so
   hosts can persist it across sessions?
4. Sequencing of `wire-soft-keyboard-host` relative to
   `add-accessibility-model`.
