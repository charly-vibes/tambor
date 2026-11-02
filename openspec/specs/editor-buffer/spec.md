---
id: editor.buffer
kind: intent
statement: "WHILE a text buffer holds a cursor or a selection THE editor-buffer SHALL apply every editing operation as a pure state transition over { text, anchor, head, goalX } that keeps both indices on grapheme boundaries and within the text."
---

# editor.buffer

## Purpose

The headless editing model of the textarea (openspec/changes/
add-textarea-editing-model): a pure buffer over `{ text, anchor, head,
goalX }` that owns the editing semantics a text field needs and that
the textarea component cannot provide on its own — grapheme-boundary
snapping, selection extension and collapse, line / word / document
navigation, goal-column vertical movement, a multi-line hit-test and its
inverse, a bounded undo timeline and forward deletion. Geometry is
injected (`Metrics { measure, lineHeight }`) rather than read from the
DOM, so the buffer is headless and every operation is a pure function
from state to state. The component keeps its own value-in / intents-out
shape: the buffer is the model the extended profile routes editing
effects through, never a second rendering path.

The index unit stays code points — the corpus's `cursor` and
`select-cursor` are code-point indices — so grapheme awareness is
boundary *snapping* on top of the index, not a change of unit. The word
rule is class-based (letters, digits and underscore form a word;
whitespace and each punctuation run are their own stops) rather than
locale-dependent, so a word stop is the same in every host.

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| buffer_pure | invariant | every operation returns a fresh state and never mutates its input, and after every operation 0 <= anchor and head <= len(text) | [[editor.buffer]] |  |
| grapheme_snapping | invariant | anchor and head never rest inside a grapheme cluster: horizontal movement and deletion step over whole clusters (emoji ZWJ sequences, regional-indicator pairs, base plus combining marks) while the index unit stays code points | [[editor.buffer]] |  |
| selection_model | invariant | a move with the extend flag moves head and keeps anchor, a move without it collapses the selection to the edge in the move's direction without stepping further, and select-all sets anchor to 0 and head to len(text) | [[editor.buffer]] |  |
| navigation_moves | invariant | the buffer provides line-start, line-end, word-backward, word-forward, document-start and document-end moves over newline-delimited lines and class-based word stops, so every stop is deterministic and headless | [[editor.buffer]] |  |
| goal_column | invariant | a vertical move keeps the goal x offset: any horizontal move, edit or pointer placement sets goalX from the new head under the injected measure, and consecutive up or down moves reuse it, landing on the boundary in the target line nearest goalX or the line end when the line is shorter | [[editor.buffer]] |  |
| hit_test | invariant | indexAt resolves a point (x, y) by choosing the line clamp(floor(y / lineHeight), 0, lines - 1) and then the nearest boundary within that line under the injected single-line measure, and positionFor is its inverse: resolving the position of any boundary index returns that index | [[editor.buffer]] |  |
| undo_history | invariant | the buffer keeps a bounded history of splice entries with the selection before and after each edit, undo applies the inverse splice and restores the selection before, redo reapplies, an edit made after an undo discards the redo entries, and consecutive single-character inserts coalesce into one entry until a boundary (whitespace, newline, cursor jump or an elapsed-time gap) | [[editor.buffer]] |  |
| forward_delete | invariant | a forward deletion with a non-empty selection deletes the selected range whole, and without one deletes the grapheme cluster immediately after the cursor as a whole cluster while the cursor stays put, and at the end of the text it changes nothing | [[editor.buffer]] |  |

## Model

### States

- `cursor`
- `selected`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_extend | cursor | selected | [[editor.buffer.selection_model]] |
| t_select | selected | selected | [[editor.buffer.selection_model]] |
| t_collapse | selected | cursor | [[editor.buffer.selection_model]] |
| t_edit | cursor | cursor | [[editor.buffer.undo_history]] |
| t_edit_selected | selected | cursor | [[editor.buffer.undo_history]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_buffer_pure | unit | [[editor.buffer.buffer_pure]] | any generated sequence of buffer operations over generated text | the input state is unchanged by each operation and anchor and head stay within 0..len(text) after every step |
| p_grapheme_snapping | unit | [[editor.buffer.grapheme_snapping]] | generated text over combining marks, ZWJ sequences, flags and newlines with generated move and delete operations | after every step both indices lie on cluster boundaries |
| p_selection_model | unit | [[editor.buffer.selection_model]] | a cursor, a selection, an extend move, a plain move and select-all | the extend move keeps the anchor, the plain move collapses the selection to the edge in its direction, and select-all spans the text |
| p_navigation_moves | unit | [[editor.buffer.navigation_moves]] | generated text with cursors inside and between lines and words | line, word and document moves land on the specified boundaries, word stops are class-based, and the edges are no-ops |
| p_goal_column | unit | [[editor.buffer.goal_column]] | lines of different widths with a cursor at a given goal x | up then down returns to the original index, the goal x survives a short line, and a horizontal move resets it |
| p_hit_test | unit | [[editor.buffer.hit_test]] | generated multi-line text with every boundary index and out-of-range points | indexAt(positionFor(i)) returns i, y selects the line, and out-of-range points clamp to the first or last line |
| p_undo_history | unit | [[editor.buffer.undo_history]] | generated edits, undo and redo sequences, and more edits than the limit | undo restores the text and selection, redo reapplies, an edit after an undo branches, typing coalesces and the history stays bounded |
| p_forward_delete | unit | [[editor.buffer.forward_delete]] | a cursor before a cluster, a cursor at the end of the text and a selection | the cluster after the cursor is deleted whole, the cursor stays put, the end of the text changes nothing and a selection is deleted whole |

## Requirements

### Requirement: Property coverage mirror

Every property row SHALL be verified by exactly one dedicated test;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_buffer_pure

- **WHEN** any generated sequence of buffer operations is applied to any
  generated text
- **THEN** the input state is unchanged by each operation and anchor
  and head stay within 0..len(text) after every step
- **VERIFIES** [[editor.buffer.p_buffer_pure]]

#### Scenario: p_grapheme_snapping

- **WHEN** generated text over combining marks, ZWJ sequences, flags and
  newlines receives generated move and delete operations
- **THEN** after every step both indices lie on cluster boundaries
- **VERIFIES** [[editor.buffer.p_grapheme_snapping]]

#### Scenario: p_selection_model

- **WHEN** a cursor, a selection, an extend move, a plain move and
  select-all are applied
- **THEN** the extend move keeps the anchor, the plain move collapses
  the selection to the edge in its direction, and select-all spans the
  text
- **VERIFIES** [[editor.buffer.p_selection_model]]

#### Scenario: p_navigation_moves

- **WHEN** generated text with cursors inside and between lines and words
  receives line, word and document moves
- **THEN** line, word and document moves land on the specified
  boundaries, word stops are class-based, and the edges are no-ops
- **VERIFIES** [[editor.buffer.p_navigation_moves]]

#### Scenario: p_goal_column

- **WHEN** lines of different widths are traversed with a cursor at a
  given goal x
- **THEN** up then down returns to the original index, the goal x
  survives a short line, and a horizontal move resets it
- **VERIFIES** [[editor.buffer.p_goal_column]]

#### Scenario: p_hit_test

- **WHEN** generated multi-line text is converted from every boundary
  index to a position and back, and out-of-range points are resolved
- **THEN** indexAt(positionFor(i)) returns i, y selects the line, and
  out-of-range points clamp to the first or last line
- **VERIFIES** [[editor.buffer.p_hit_test]]

#### Scenario: p_undo_history

- **WHEN** generated edits are applied, undone, redone and branched, and
  more edits than the limit are made
- **THEN** undo restores the text and selection, redo reapplies, an edit
  after an undo branches, typing coalesces and the history stays
  bounded
- **VERIFIES** [[editor.buffer.p_undo_history]]

#### Scenario: p_forward_delete

- **WHEN** a forward deletion is applied before a cluster, at the end of
  the text and over a selection
- **THEN** the cluster after the cursor is deleted whole, the cursor
  stays put, the end of the text changes nothing and a selection is
  deleted whole
- **VERIFIES** [[editor.buffer.p_forward_delete]]
