## ADDED Requirements

### Requirement: Closed role model

Every interactive node SHALL carry a role from the closed set
(`button`, `checkbox`, `textbox`) and every role SHALL be reproducible
by both backends, with non-interactive text blocks contributing their
text content to the accessibility tree.

#### Scenario: interactive nodes mirror with roles

- **WHEN** a view contains a button, a checkbox and a textarea
- **THEN** the accessibility tree holds one node per element with the
  corresponding role from the closed set

#### Scenario: text is exposed

- **WHEN** a view contains a non-interactive text block
- **THEN** the accessibility tree carries the block's text content

### Requirement: ARIA attribute pass-through

A node MAY declare the typed aria attributes (`ariaLabel`, `ariaLive`,
`ariaDescribedby`) and both backends SHALL apply them — the DOM
backend as real element attributes, the canvas backend as fields on
the mirrored node — so the two backends agree on every declared
attribute.

#### Scenario: DOM backend applies declared aria

- **WHEN** a button declares ariaLabel and ariaLive
- **THEN** the rendered DOM element carries those lowercased
  attributes with the declared values

#### Scenario: backends agree

- **WHEN** the same labeled view is rendered through both backends
- **THEN** the canvas mirror matches the DOM element's aria attributes
  attribute for attribute
