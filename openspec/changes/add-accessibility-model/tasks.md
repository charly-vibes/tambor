# Tasks: add-accessibility-model

## 1. Role model

- [ ] 1.1 Red: fast-check property — every interactive node maps to
      exactly one a11y node with a role from the closed set
      (button, checkbox, textbox); non-interactive text contributes a
      text entry, containers traverse.
- [ ] 1.2 Green: extend `src/render/a11y.ts` (role union, text
      exposure) and the textarea/select nodes to carry roles.

## 2. ARIA pass-through

- [ ] 2.1 Red→Green: a node declaring ariaLabel/ariaLive/ariaDescribedby
      yields those attributes in the DOM backend's emitted element
      (attribute names lowercased, values verbatim).
- [ ] 2.2 Red→Green: the canvas mirror carries the same labels —
      cross-backend agreement property.

## 3. Demo + e2e

- [ ] 3.1 Counter demo: label the button and wire ariaLive on the
      count output; add an e2e a11y assertion (DOM attributes present,
      canvas mirror matches).
- [ ] 3.2 Document the closed role set and the follow-up slices
      (focus management, keyboard traversal) in the capability spec's
      prose.

## 4. Verification

- [ ] 4.1 `just test` and e2e smoke green.
- [ ] 4.2 `ah check` and `openspec validate add-accessibility-model
      --strict` green before archive.
