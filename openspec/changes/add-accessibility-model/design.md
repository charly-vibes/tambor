# Design: add-accessibility-model

## Context

`src/render/a11y.ts` mirrors interactive nodes into an offscreen tree
for the canvas backend, with a two-role union (`button`, `checkbox`).
The DOM backend renders real elements but carries no ARIA attribute
model. The corpus has no accessibility capability spec — the design
authority today is a single constraint in `backend-render`
(a11y_mirror).

## Goals / Non-Goals

- Goals: a closed role set, ARIA attribute pass-through, cross-backend
  agreement, and text exposure for screen readers.
- Non-Goals: focus management and full keyboard traversal (follow-up
  slice); localization of built-in labels; ARIA wire-frame
  reconciliation with third-party tools.

## Decisions

### D1. Closed role set, not open strings

Roles stay a discriminated union (`button` | `checkbox` | `textbox`)
so a missing case is a compile error — the same exhaustiveness payoff
the evaluation recommended for the Node/Elem unions. New roles arrive
as explicit revisions, keeping the mirror honest.

*Alternative considered:* an open `role: string` pass-through.
Rejected: it lets views claim roles the mirror cannot reproduce, so
the two backends can silently disagree.

### D2. Pass-through as a typed attribute bag

Aria attributes ride a typed, optional record on nodes (`ariaLabel`,
`ariaLive`, `ariaDescribedby`); the DOM backend applies them verbatim
as lowercased attributes, the canvas mirror stores them on the a11y
node. No free-form bag — each attribute is checked at compile time.

### D3. Text exposure at the mirror level

Non-interactive text blocks contribute their text to the mirror so
screen readers on the canvas path see document text. This stays a
mirror concern; the DOM path needs no change (text is already DOM
content).

## Risks / Trade-offs

- [Closed set blocks community roles short-term] → explicit revision
  path; the corpus is the boundary, not a plugin API.
- [Mirror drift between backends] → cross-backend agreement property
  pins one shared derivation, not two implementations.
