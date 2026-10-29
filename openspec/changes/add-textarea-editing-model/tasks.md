# Tasks: add-textarea-editing-model

Order follows the repo's TDD convention (Red then Green). Properties use
vitest + fast-check; the buffer is headless, so no DOM is needed until
section 7.

## 1. Buffer core and grapheme boundaries

- [x] 1.1 Red: properties — operations never mutate input; indices stay
      in `0..len`; no index inside a cluster (generators include
      combining marks, ZWJ sequences, flags).
- [x] 1.2 Green: `src/components/textarea/buffer.ts` state type,
      `Intl.Segmenter` boundary helper, move-by-cluster and
      delete-by-cluster.

## 2. Selection model

- [ ] 2.1 Red: extend keeps anchor; collapse-to-edge; select-all then
      delete empties; select-all then insert replaces.
- [ ] 2.2 Green: extend flag, collapse rule, select-all.

## 3. Line, word and document navigation

- [ ] 3.1 Red: line-start/end bounds; word stops match the class rule;
      document start/end; idempotence at the edges.
- [ ] 3.2 Green: implement the class-based word rule (D7).

## 4. Goal-column vertical movement

- [ ] 4.1 Red: up-then-down returns; goal x survives a short line;
      first/last line edges; horizontal moves reset `goalX`.
- [ ] 4.2 Green: `Metrics` interface, fixed-width test stub, vertical
      move.

## 5. Multi-line hit-test

- [ ] 5.1 Red: round trip `indexAt(positionFor(i)) == i`; y selects the
      line; out-of-range clamps; monotone in x within a line.
- [ ] 5.2 Green: `indexAt` / `positionFor` delegating to the existing
      single-line `indexForPosition` per line.

## 6. Undo and redo

- [ ] 6.1 Red: edit-then-undo identity; redo undoes undo; branch on act;
      coalescing of one word; bounded length.
- [ ] 6.2 Green: splice history with selection before/after, coalescing
      rule (whitespace, newline, jump, `now` gap), limit prop.

## 7. Textarea integration

- [ ] 7.1 Red: the existing `components-textarea-*` tests pass
      unchanged with no `profile` prop (regression gate, run first).
- [ ] 7.2 Red→Green: `profile` prop; extended key routing (D8); pointer
      placement via the buffer; `goal-x` and `history` in the extra map;
      atomic multi-path updates.
- [ ] 7.3 Red→Green: shared op-sequence property — under `"extended"`
      the invariants of `editor-buffer` hold after any generated mix of
      key and pointer events.

## 8. Mobile bridge keys

- [ ] 8.1 Red→Green: `src/ui/keyboard.ts` maps Home/End/Delete, carries
      modifiers, no lowercasing of named keys; existing
      `ui-mobile-keyboard` tests green.

## 9. Corpus and docs

- [ ] 9.1 Add the new constraint and property rows plus one
      `VERIFIES` scenario per property to
      `openspec/specs/components-textarea/spec.md`, create
      `openspec/specs/editor-buffer/spec.md` in the dual-format layout,
      and extend `ui-mobile` (the delta files here are the source text).
- [ ] 9.2 Run `ah sync`, `tools/scaffold-check.sh` and
      `tools/scaffold-debt.sh`; update `TRACEABILITY.md` so the quirks
      read as advisory under the `"membrane"` profile only.

## 10. Demo and acceptance

- [ ] 10.1 Gallery example: multi-line editor in the extended profile
      (shift-select, undo, vertical movement).
- [ ] 10.2 Manual acceptance on a real browser: edit a multi-line
      markdown deck (emoji and combining marks included); confirm click
      placement on lower lines. Record the result in the change.
- [ ] 10.3 Run `openspec validate add-textarea-editing-model --strict`.

## Follow-ups (separate changes)

- `add-textarea-soft-wrap` — visual lines for wrapped text.
- `wire-soft-keyboard-host` — create and focus the hidden input in the
  SPA/DOM host; keyboard avoidance; sequence after
  `add-accessibility-model`.
