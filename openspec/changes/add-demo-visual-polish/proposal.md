# Add demo visual polish

## Why

The demo gallery is the corpus's front door — the surface a visitor
mounts to feel the pure-data model — and today it reads as unfinished:
inactive filter labels sit at 1.61:1 / 2.85:1 contrast (WCAG AA needs
4.5:1; `tambor-71u`), every drawn button renders 28px high against the
44px mobile_first floor (`tambor-8cu`), the select demo clips its row
labels at the stage's top-left corner, the 300px stage floats top-left
in ~800px of empty space, and the shell paints no theme inks at all
(`src/ui/theme.ts` is a token table nothing reads; `tambor-pz6`). The
real-shell visual audit (`tambor-v3s`) records all of this but gates
none of it: `text.contrast` and `target.below-44px` are warnings
"until their corpus fixes land". This change makes them land.

## What changes

- **Accessible gray (bug)** — the spec-pinned grays
  (`example.todo.toggle_render` [0.8, 0.8, 0.8];
  `components.select.header_label` "a gray") are re-pinned as
  *accessible* gray: at least 4.5:1 against the light-shell background.
  Implementation repaints to [0.45, 0.45, 0.45] (≈4.75:1). The spec
  states the accessibility floor, not the literal, so the phase-3 token
  consumption does not re-pin specs. Closes `tambor-71u`.
- **44px button floor (bug)** — `view.model.button_bounds` grows a
  floor: bounds stay label + 12 but never drop below 44 on either axis.
  Dependent pinned layouts (counter buttons, todo Add row, dropdown
  header, item rows) re-pin in the same breath — the golden contracts
  are re-created, not preserved. Closes `tambor-8cu`.
- **Select demo clip (bug)** — the dropdown demo's row labels clip at
  the stage's top-left edge; triaged through the audit's clipping
  entries and fixed at the layout source.
- **Audit gates the wins** — once green, `text.contrast` and
  `target.below-44px` promote from recorded warnings to error floors in
  the visual audit, so the regressions cannot return silently.
- **Gallery layout (phase 2)** — nav buttons reach the 44px floor and
  stop reading as browser defaults; the stage sits in the page instead
  of floating top-left over emptiness. Fixture goldens regenerated
  deliberately (gallery.spec, bench ops geometry, bombadil stage reads).
- **Theme consumption (phase 3)** — demos and shell consume
  `src/ui/theme.ts` tokens (`accent`, `border`, `danger`, scheme-aware)
  instead of literal inks, making `tambor-pz6` true.

## Impact

- **Affected specs**: `example-todo` (toggle_render),
  `components-select` (header_label), `view-model` (button_bounds) —
  MODIFIED deltas under `specs/`.
- **Affected code**: `src/examples/todo/items.ts`,
  `src/components/select/dropdown.ts` (ink), `src/views/geometry.ts` +
  `src/render/dom-painters.ts` (button bounds), example layouts that
  pin positions relative to button boxes, `tests/e2e/audit.ts` +
  `visual-audit.spec.ts` (gating), `tests/e2e/gallery.html` +
  `src/spa/main.ts` (phase 2 shell), demo views (phase 3 tokens).
- **Non-goals**: no corpus semantics change (every intent route is
  untouched); `hit_slop` stays the interaction authority — the 44px
  work is about the drawn mirror a visitor actually sees; no new
  components; the fixture's pointer-coordinate pinning survives phase 2
  (bombadil + bench lanes keep working).
