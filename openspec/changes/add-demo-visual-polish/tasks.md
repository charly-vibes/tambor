# Tasks: add-demo-visual-polish

## 1. Accessible gray (tambor-71u)

- [x] 1.1 Red: `tests/example-todo-filters.test.ts` `p_toggle_render`
      asserts inactive-option ink contrast ≥ 4.5:1 against white
      instead of the [0.8, 0.8, 0.8] literal; the same assertion lands
      on the dropdown no-selection label test (`components-select`).
      Both fail.
- [x] 1.2 Green: repaint `GRAY` in `src/examples/todo/items.ts` and the
      dropdown no-selection ink to [0.45, 0.45, 0.45]; both tests pass.
- [x] 1.3 Spec deltas: MODIFIED `toggle_render` (example-todo) and
      `header_label` (components-select) restate gray as the 4.5:1
      floor; scenarios updated; `spk lint` green on the corpus.
- Acceptance: `just e2e-visual` reports zero `text.contrast` findings
  for the todo and select demos.

## 2. 44px button floor (tambor-8cu)

- [x] 2.1 Red: `p_button_bounds` (view-model vitest + specodelic
      proptest scaffold) asserts `max(label + [12,12], [44,44])`
      componentwise; fails against the current +12 result.
- [x] 2.2 Green: shared `buttonBounds` helper in `geometry.ts`
      (label + 12 floored at 44/axis); `dom-painters.ts` consumes it.
- [x] 2.3 Re-pin dependent goldens in the same commit family: counter
      `p_buttons`, todo `p_add`/`p_item_layout` relatives, dropdown
      `p_header_toggle`/`p_header_label`; contract TOMLs re-derived
      (`ah check` green).
- [ ] 2.4 Re-layout the demos whose rows were tuned to 28px buttons:
      52 `root.off-root-text` findings across the bench demos
      (spreadsheet 51, tracker, dashboard-derived, keyed-table,
      environment, review-faults, ...) after the floor landed. Adjust
      each demo's translates/spacers so text returns inside the drawn
      root; audit quiet.
- Acceptance: `just e2e-visual` reports zero `target.below-44px`
  findings (done) and zero `root.off-root-text` findings (2.4).

## 3. Select demo clip

- [ ] 3.1 Red: reproduce the top-left row-label clip as an audit
      clipping entry (or a layout unit test pinning the row origin
      inside the stage bounds).
- [ ] 3.2 Green: fix at the layout source (dropdown list origin /
      stage padding), not a fixture CSS patch.
- Acceptance: fresh bombadil select trace screenshots show unclipped
  rows; audit clipping entries for the demo are gone.

## 4. Audit gates the wins

- [ ] 4.1 Flip `text.contrast` and `target.below-44px` from recorded
      warnings to error floors in `audit.ts`; `visual-audit.spec.ts`
      fails on them.
- [ ] 4.2 `just e2e-visual` green across all demos × viewports.
- Acceptance: pre-push lane runs the audit with the new floors and
  stays green.

## 5. Gallery layout (phase 2)

- [ ] 5.1 Nav: 44px hit targets, spaced and styled buttons, active
      state readable; nav-local scroller semantics preserved.
- [ ] 5.2 Stage placement: `#demo` sits centred with breathing room;
      blurb typography readable; scripted-pointer pinning intact
      (gallery.spec green).
- [ ] 5.3 Regenerate goldens: gallery.spec expectations,
      visual-audit.json, one bombadil run per demo as smoke.
- Acceptance: bombadil counter/todo/select/plots runs exit 0 against
  the restyled fixture; gallery.spec passes.

## 6. Theme consumption (phase 3, tambor-pz6)

- [ ] 6.1 Scheme seam: demos read `tokenValue` through an injected
      matcher (fixed scheme in tests).
- [ ] 6.2 Demos consume tokens: accent (selected fill), danger
      (delete X), border/foreground (chrome); shell paints tokens.
- [ ] 6.3 Dark scheme smoke: fixture under `prefers-color-scheme: dark`
      renders with dark token values, audit still quiet.
- Acceptance: no literal [0.8,0.8,0.8]/[0,0.48,1] inks remain in demo
  views; contrast holds in both schemes.
