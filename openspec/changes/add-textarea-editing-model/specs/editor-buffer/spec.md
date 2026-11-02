## ADDED Requirements

### Requirement: Pure buffer state

The editor buffer SHALL be a pure model over `{ text, anchor, head,
goalX }` in which the cursor is `head`, the selection is the range
between `anchor` and `head` and is empty exactly when they are equal,
and every operation SHALL return a new state without mutating its
input. Indices SHALL count code points, and every operation SHALL keep
`0 <= anchor, head <= len(text)`.

#### Scenario: operations never mutate and stay in range

- **WHEN** any generated sequence of buffer operations is applied to any
  generated text
- **THEN** the input state is unchanged by each operation and anchor
  and head stay within `0..len(text)` after every step

#### Scenario: empty selection is anchor equals head

- **WHEN** a state has `anchor == head`
- **THEN** it reports no selection, and any state with `anchor != head`
  reports the range between them

### Requirement: Grapheme boundary snapping

The buffer SHALL never leave `anchor` or `head` inside a grapheme
cluster: horizontal movement and deletion SHALL step over whole
clusters (emoji ZWJ sequences, regional-indicator pairs, base plus
combining marks), while the index unit remains code points.

#### Scenario: cursor steps over a ZWJ sequence

- **WHEN** the cursor is before a family emoji built from several code
  points joined by ZWJ and a forward step is applied
- **THEN** the cursor lands after the whole sequence, and a backspace
  from there removes the whole sequence

#### Scenario: no boundary violations under generated edits

- **WHEN** generated text containing combining marks, ZWJ sequences and
  flags receives generated move and delete operations
- **THEN** after every step both indices lie on cluster boundaries

### Requirement: Selection extension and collapse

Moves with the extend flag SHALL move `head` and keep `anchor`; moves
without it SHALL collapse the selection, where a horizontal move with a
non-empty selection collapses to the selection edge in the move's
direction without stepping further. Select-all SHALL set `anchor` to 0
and `head` to `len(text)`.

#### Scenario: shift-extend keeps the anchor

- **WHEN** the cursor is at 3 and a forward move with extend is applied
  twice
- **THEN** `anchor` is 3 and `head` is 5

#### Scenario: collapse to the edge

- **WHEN** the selection spans 2..6 and a backward move without extend
  is applied
- **THEN** the selection is empty with `head` at 2

#### Scenario: select-all then delete empties the text

- **WHEN** select-all and then delete are applied to any text
- **THEN** the text is empty and the cursor is 0

### Requirement: Line, word and document navigation

The buffer SHALL provide line-start, line-end, word-backward,
word-forward, document-start and document-end moves, where a line is
delimited by newline characters and a word stop is a boundary between
character classes (letters, digits and underscore as one class,
whitespace, and each other run) so that word moves are deterministic
and headless.

#### Scenario: line-end stops before the newline

- **WHEN** the cursor is inside the first line of "ab⏎cd" and line-end
  is applied
- **THEN** the cursor is 2

#### Scenario: word-forward skips a word then stops

- **WHEN** the cursor is at 0 in "foo bar" and word-forward is applied
- **THEN** the cursor is 3

### Requirement: Goal-column vertical movement

Vertical moves SHALL keep a goal x offset: any horizontal move, edit or
pointer placement sets `goalX` from the new head position under the
injected measure, and consecutive up or down moves SHALL reuse it,
landing on the boundary in the target line nearest to `goalX`, or the
line end when the line is shorter. Up on the first line and down on the
last line SHALL move to document start and end respectively.

#### Scenario: goal x survives a short line

- **WHEN** the cursor is at x 40 on a long line, down moves through a
  one-character line, and down moves again to a long line
- **THEN** the final cursor is on the boundary nearest x 40, not at the
  short line's end

#### Scenario: up then down returns

- **WHEN** both neighbouring lines are at least as wide as `goalX` and
  up is followed by down
- **THEN** the cursor returns to its original index

### Requirement: Multi-line hit-test and inverse

The buffer SHALL resolve a point `(x, y)` to an index by choosing the
line `clamp(floor(y / lineHeight), 0, lines - 1)` and then the nearest
boundary within that line using the injected single-line measure, and
SHALL provide the inverse `positionFor(index)` such that resolving the
position of any boundary index returns that index.

#### Scenario: y selects the line

- **WHEN** a point lies in the second row of three-line text
- **THEN** the resolved index lies within the second line

#### Scenario: hit-test round trip

- **WHEN** any boundary index of generated multi-line text is converted
  to a position and back
- **THEN** the original index is returned

#### Scenario: out-of-range points clamp

- **WHEN** a point lies above the first row or below the last
- **THEN** the index resolves within the first or last line respectively

### Requirement: Forward deletion

The buffer SHALL provide a forward deletion that, with a non-empty
selection, deletes the selected range whole and, without one, deletes
the grapheme cluster immediately after the cursor as a whole cluster
while the cursor stays where it is; at the end of the text it SHALL
change nothing.

#### Scenario: delete forward takes the whole cluster

- **WHEN** the cursor is before a family emoji built from several code
  points joined by ZWJ and a forward deletion is applied
- **THEN** the whole sequence is removed and the cursor stays at its
  index

#### Scenario: delete forward at the end changes nothing

- **WHEN** the cursor is at the end of the text and a forward deletion
  is applied
- **THEN** the text and the cursor are unchanged

#### Scenario: delete forward with a selection deletes the selection

- **WHEN** a selection spans 1..3 and a forward deletion is applied
- **THEN** the selected range is removed whole and the cursor is at the
  selection start

### Requirement: Undo and redo history

The buffer SHALL keep a bounded history of splice entries with the
selection before and after each edit; undo SHALL apply the inverse
splice and restore the selection before, redo SHALL reapply, and an
edit made after an undo SHALL discard the redo entries. Consecutive
single-character inserts SHALL coalesce into one entry until a
boundary (whitespace, newline, cursor jump, or an elapsed-time gap).

#### Scenario: undo restores text and selection

- **WHEN** any generated edit is applied and then undone
- **THEN** the text and selection equal their values before the edit

#### Scenario: redo undoes undo

- **WHEN** an edit is undone and then redone
- **THEN** the result equals the state after the original edit

#### Scenario: editing after undo branches

- **WHEN** an edit is undone and a different edit is then made
- **THEN** redo has no entries

#### Scenario: typing coalesces

- **WHEN** the characters of one word are inserted one by one without a
  boundary and undo is applied once
- **THEN** the whole word is removed

#### Scenario: history is bounded

- **WHEN** more edits than the configured limit are applied
- **THEN** the history length never exceeds the limit
