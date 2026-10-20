## ADDED Requirements

### Requirement: Validated replies

The client SHALL validate every incoming worker message against the
reply envelope before delivery — a plain object carrying a numeric id,
a boolean ok, and the payload shape the envelope declares for that ok —
and SHALL deliver a typed failure response (`ok: false`) to the pending
request the echoed id routes to when validation fails — the pending
queue resolves every reply, it never rejects.

#### Scenario: malformed id is inert

- **WHEN** a message arrives whose id is not a number (so no echoed id
  routes it to any pending request)
- **THEN** the message is dropped and no pending request resolves or
  rejects

#### Scenario: malformed envelope with a routable id is a typed failure

- **WHEN** a message arrives with a numeric id matching a pending
  request but a non-boolean ok or a payload shape the envelope does
  not declare for that ok
- **THEN** that pending request resolves with a typed failure response
  (`ok: false`) and no pending request resolves with the malformed
  payload

#### Scenario: foreign-id reply is inert

- **WHEN** a well-formed reply arrives whose id matches no pending
  request
- **THEN** the message is dropped and no other pending request resolves
  or rejects

#### Scenario: routing property survives validation

- **WHEN** two in-flight requests receive reversed replies, one of them
  malformed (non-boolean ok) and one carrying a foreign id
- **THEN** the well-formed reply still resolves exactly its own
  request, the malformed one delivers its typed failure response
  to only its own, and the foreign-id one delivers to nothing