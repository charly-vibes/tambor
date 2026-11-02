## ADDED Requirements

### Requirement: Editing profile

The textarea SHALL accept a `profile` prop with the values `"membrane"`
and `"extended"`, defaulting to `"membrane"`. Under `"membrane"` every
existing constraint, property and scenario SHALL hold unchanged,
including the advisory quirks (`previous_line_quirk`, single-line hit
resolution). Under `"extended"` key, pointer and shortcut events SHALL
route through the `editor-buffer` operations and still return data
intents only.

#### Scenario: default profile preserves the baseline

- **WHEN** a textarea is created with no `profile` prop
- **THEN** the full existing textarea test suite passes unchanged and
  previous-line from cursor 4 in "ab⏎cd" gives cursor 2

#### Scenario: extended profile preserves the column

- **WHEN** an extended textarea has the cursor at column 3 of a long
  line and the down key is pressed
- **THEN** the returned intents place the cursor at column 3 of the next
  line, not at the next line's start

#### Scenario: extended still returns intents

- **WHEN** an extended textarea handles any key or pointer event
- **THEN** the result is a list of data intents applied by
  `applyTextareaIntents`, with no side effect

### Requirement: Extended navigation keys

Under the extended profile the up and down keys SHALL move by goal
column, shift SHALL extend the selection of any move, home and end SHALL
move to line start and end, and ctrl or meta with left, right, home or
end SHALL move by word or to document start and end; all other plain
named keys SHALL map as in the membrane profile.

#### Scenario: shift extends

- **WHEN** an extended focused textarea receives shift+right twice from
  cursor 3
- **THEN** the selection anchor is 3 and the cursor is 5

#### Scenario: home and end

- **WHEN** an extended focused textarea has its cursor inside the second
  line and receives end
- **THEN** the cursor moves to the end of that line

### Requirement: Extended editing shortcuts

Under the extended profile ctrl or meta with `a` SHALL select all, with
`z` SHALL undo, and with shift and `z` or with `y` SHALL redo, each as
data intents against the textarea state. The named key `delete` SHALL
delete forward through the editor buffer and SHALL NOT be inserted as
text.

#### Scenario: the delete key is a command, not text

- **WHEN** an extended focused textarea with cursor 1 in "abc" receives
  the named key `delete`
- **THEN** the text becomes "ac" and no text named "delete" is inserted

#### Scenario: undo shortcut

- **WHEN** text is typed and then ctrl+z is received
- **THEN** the text before typing is restored

#### Scenario: select-all shortcut

- **WHEN** meta+a is received
- **THEN** the selection spans the whole text

### Requirement: Modified keys are not text

Under the extended profile any ctrl or meta modified key that is not a
defined shortcut SHALL be ignored and SHALL NOT insert text, and an
unfocused textarea SHALL return no effects for any key.

#### Scenario: modified unknown key is not text

- **WHEN** ctrl+q is received by a focused extended textarea
- **THEN** no text is inserted and no effects are returned

#### Scenario: unfocused ignores shortcuts

- **WHEN** an unfocused extended textarea receives ctrl+a
- **THEN** it returns no effects

### Requirement: Extended pointer placement

Under the extended profile a pointer down SHALL resolve its index with
the buffer's multi-line hit-test (using y), SHALL set `goal-x` from the
resolved position, and drag selection and double-click word selection
SHALL use the same resolution; the backend `indexForPosition` contract
SHALL be unchanged.

#### Scenario: click on a lower line

- **WHEN** a pointer down lands in the third row of three-line text
- **THEN** the cursor index lies within the third line

#### Scenario: backend contract untouched

- **WHEN** the extended profile resolves a point
- **THEN** the backend `indexForPosition` is only called with a single
  line's text, as its contract requires

### Requirement: Extended state placement

The extended profile SHALL store `goal-x` and `history` in the existing
textarea-state extra map and SHALL keep `text` and `focus` in app state,
so that the text/extra split and multi-path atomic updates still hold.

#### Scenario: atomic edit

- **WHEN** an extended edit changes text, cursor, selection and history
- **THEN** all four change in one multi-path update and never
  separately

#### Scenario: initial extra map is complete

- **WHEN** the extra map is created for an extended textarea
- **THEN** it contains `goal-x` as null and an empty `history`
