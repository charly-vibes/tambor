# Add accessibility model

## Why

The corpus models exactly two roles (`button`, `checkbox`) in
`src/render/a11y.ts`'s offscreen canvas-tree mirror. Text inputs, text
content, lists, headings, live regions and ARIA attribute pass-through
do not exist anywhere in `src/`, and no spec or doc mentions
accessibility beyond that mirror. For a UI library this is the biggest
functional gap: apps built on tambor cannot express what a screen
reader needs. The chat-773745b6 evaluation ranked this the top
weakness, ahead of verification tooling.

## What Changes

- New capability `render-a11y`: a closed role set for interactive
  elements (`button`, `checkbox`, `textbox`) — carried by the view
  node types so the compiler checks exhaustiveness, not a free-form
  string — plus an ARIA attribute pass-through on nodes (`ariaLabel`,
  `ariaLive`, `ariaDescribedby`, ...) applied by both backends, and
  text content exposure for non-interactive text blocks.
- The DOM backend maps roles and ARIA attributes onto real element
  attributes; the canvas backend extends the offscreen mirror with the
  same roles and labels so the two backends agree.
- First-slice scope deliberately excludes focus management and
  keyboard traversal beyond what `ui-mobile`/keyboard.ts already does;
  those are follow-up slices.

## Impact

- Affected specs: `render-a11y` (new capability); `backend-render`
  gains an outbound cross-reference only (no requirement edits).
- Affected code: `src/render/a11y.ts` (role set, pass-through),
  DOM render path (attribute application), canvas backend mirror.
- Affected tests: role/attribute fast-check properties per backend;
  e2e a11y snapshot on the counter demo.
- Sequencing: lands before any real external user — the evaluation
  named accessibility the first thing an external audit would flag.
