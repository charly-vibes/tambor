# Design: add-demo-visual-polish

## Decisions

### D1 — Gray is stated as an accessibility floor, not a literal

`toggle_render` and `header_label` lose the literal `[0.8, 0.8, 0.8]`
and gain "gray ink with contrast at least 4.5:1 against the light-shell
background". The implementation value is `[0.45, 0.45, 0.45]`
(#737373, ≈4.75:1 on white — passes AA with margin). Rationale: phase 3
swaps literals for scheme-aware tokens; a spec pinned to a number
would then drift again. The property under test is *readable*, not
*exactly this gray*.

### D2 — Button floor: `max(label + [12, 12], [44, 44])`, componentwise

`button_bounds` keeps the +12 grow-with-label rule and adds a hard
floor. Both `geometry.ts` (layout) and `dom-painters.ts` (emitted
mirror box) must use ONE formula — the emitted box already claims to be
the corpus button_bounds, so a shared helper lands in `geometry.ts` and
dom-painters imports it. Small-label buttons (counter `-`/`+`, 17px
wide) get width from the floor, not the label. `hit_slop` (ui-mobile)
is untouched: events already had a 44×44 slop region; this change is
about what the visitor sees.

### D3 — The golden is re-created in the same red→green

Bigger button boxes shift dependent pinned layouts (counter `p_buttons`,
todo `p_add`/`p_item_layout` relatives, dropdown `p_header_*`). The
contract assertions update in the same commits that change the formula —
never left red across commits. Bombadil stage reads (`#demo > div`
geometry) are adaptive, not pinned; bench ops use `centreOf` view-space
points resolved at run time. `gallery.spec.ts` expectations and
`test-results/visual-audit.json` regenerate via `just e2e-visual`.

### D4 — Audit promotes the fixed rules to gates

`audit.ts` today records `text.contrast` / `target.below-44px` as
warnings. After T1/T2 land and the audit runs clean, the rules flip to
error floors. Ordering matters: promote only after the corpus is quiet,
so the gate lands green.

### D5 — Phase 2 restyles the fixture without breaking the coordinate pin

`gallery.html` keeps: `#demo` stage origin semantics, nav-local
scroller, pointer-events-enabled drawn root, 800px scripted floor.
Allowed to change: nav button sizing/spacing (44px targets, real
styling), stage horizontal placement, page background/spacing, blurb
typography. The scripted-pointer contract is `#demo` box geometry being
*stable and measurable*, not *ugly*.

### D6 — Phase 3 tokens flow one direction: demos read, theme owns values

Demos consume `tokenValue(token, colorSchemePref(match))` through a
small seam (the existing injected-matcher pattern from ui/motion) so
tests inject a fixed scheme. The spec deltas from D1 stay honest: the
gray floor is scheme-independent prose; the token table carries values.

## Risks

- **Counter/numeric layouts overflow the 300px stage** once buttons
  floor at 44 wide — triage via the audit's overflow error floor; the
  stage may need the phase-2 width to land early for those demos.
- **Dark scheme asserts**: audit measures against the light shell only;
  dark-scheme contrast rides phase 3 with an injected matcher, not this
  change.
- **specodelic lint**: main-spec edits (toggle_render, header_label,
  button_bounds) must keep `spk lint` green — prose changes inside
  existing rows only, no new ids.
