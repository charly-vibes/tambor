## ADDED Requirements

### Requirement: Bridge navigation keys and modifiers

The soft-keyboard bridge SHALL map the DOM keys `Home`, `End` and
`Delete` to named key-press events, SHALL carry the modifier flags
(shift, ctrl, meta, alt) of a hardware key-down on the key-press event,
and SHALL NOT alter the case of a named key; text delivered by input or
composition-end events SHALL still become a single insert with its
original casing.

#### Scenario: Home and End are named

- **WHEN** keydown events for Home and End are bridged
- **THEN** key-press events named home and end are produced

#### Scenario: modifiers are carried

- **WHEN** a keydown for the key a with shift and ctrl set is bridged
- **THEN** the key-press event carries both modifier flags

#### Scenario: composed text keeps casing

- **WHEN** a composition-end event with the data "Éa" is bridged
- **THEN** one key-press with the data "Éa" is produced
