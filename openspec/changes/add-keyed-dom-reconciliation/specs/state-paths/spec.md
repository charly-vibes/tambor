## ADDED Requirements

### Requirement: Keyed element addressing

The path system SHALL provide `["by-key", field, value]`, addressing
the unique element of a sequence whose `field` property equals `value`
(Object.is): select continues into the matched element; update/set
write through it preserving position, shape and structural sharing;
delete splices it; `value` is a primitive
(path_serialisable alignment). Matching is exactly-one in select and
write alike: keyed-not-found when absent or on a non-sequence target,
keyed-ambiguous when several match.

#### Scenario: select by id

- **WHEN** selecting `["keypath", "messages"], ["by-key", "id",
  "m-2"], ["keypath", "text"]`
- **THEN** the matched message's text is returned

#### Scenario: addressing is stable across insert

- **WHEN** a message is inserted above and the same by-key path updates
  the same logical message
- **THEN** the update lands on that message at its new index, the
  sequence shape is preserved, and the other messages keep their
  identity (structural sharing)

#### Scenario: delete splices the matched element

- **WHEN** deleting through a by-key step
- **THEN** the matched element is spliced from the sequence and the
  remaining elements keep their identity

#### Scenario: missing id fails loudly

- **WHEN** no element of the sequence matches the key
- **THEN** the walk throws keyed-not-found carrying the field and the
  value — never a silent empty select and never a write elsewhere

#### Scenario: duplicate ids fail as ambiguous

- **WHEN** several elements of the sequence match the key
- **THEN** the walk throws keyed-ambiguous rather than addressing an
  arbitrary match
