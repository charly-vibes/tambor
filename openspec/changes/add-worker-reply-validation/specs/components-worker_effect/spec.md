## ADDED Requirements

### Requirement: Validated replies

The client SHALL validate every incoming worker message against the
reply envelope before delivery — a plain object carrying a numeric id,
a boolean ok, and the payload shape the envelope declares for that ok —
and SHALL reject the pending request the echoed id routes to with the
typed-failure shape when validation fails.

#### Scenario: malformed reply is a typed failure

- **WHEN** a message arrives whose id is not a number or whose ok is
  not a boolean
- **THEN** the pending request with the echoed id rejects with a typed
  failure and no promise resolves with the malformed payload

#### Scenario: foreign-id reply is inert

- **WHEN** a well-formed reply arrives whose id matches no pending
  request
- **THEN** the message is dropped and no other pending request resolves
  or rejects

#### Scenario: routing property survives validation

- **WHEN** two in-flight requests receive reversed replies, one of them
  malformed
- **THEN** the well-formed reply still resolves exactly its own
  request, and the malformed one rejects only its own
