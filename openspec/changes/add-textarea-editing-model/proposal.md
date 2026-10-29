# Add textarea editing model

## Why

`components-textarea` is a faithful port of Membrane's `textarea`, and
that fidelity is the right default (see `project.md`: deliberate Membrane
quirks are preserved as `advisory`). It is also not enough to edit
multi-line text — the case that surfaced it was a markdown editor for a
slide-authoring PWA. Verified by reading the source at `e74a61e`:

- **Vertical movement jumps to line boundaries.** `previous_line_quirk`
  lands the cursor on the newline character itself and `next_line_rule`
  on one past the next newline; no column is preserved
  (`src/components/textarea/edit.ts`).
- **Pointer hit-testing ignores y.** The backend service
  `indexForPosition(font, text, x, y)` is single-line by contract
  (`y` does not move the index, `src/render/backend.ts`), so a pointer
  down on any line of multi-line text resolves against one line.
- **No selection modifiers, line/word navigation, select-all or undo.**
  `key_map` maps six named keys only; ctrl/meta-modified keys are
  explicitly "not text" and otherwise ignored.
- **The cursor is not grapheme-aware.** Text is walked as code points,
  so a cursor can rest inside an emoji ZWJ sequence or between a base
  character and its combining mark.
- **The soft-keyboard bridge is modeled but not hosted.**
  `src/ui/keyboard.ts` implements `soft_keyboard_bridge` as a pure
  module whose only importer is its own test; no SPA or DOM-backend code
  creates the hidden input. Its key table also maps only six keys and
  lowercases the rest.

Membrane's own rationale for owning the textarea (the "What is a User
Interface?" post) is that native input bakes in default behavior — hit
detection, cursor, selection, focus — that cannot be composed or
inspected as values, so the event function cannot answer "what happens
at (x, y)?". These gaps are inside that model, not against it: each fix
below is a pure function from state and event to intents.

## What Changes

- New capability `editor-buffer`: a headless, pure editing model over
  `{ text, anchor, head, goalX }` — grapheme-boundary snapping, selection
  extension and collapse, line/word/document navigation, goal-column
  vertical movement, multi-line hit-test and its inverse, and undo/redo
  with typing coalescing. Geometry comes from an injected `Metrics`
  (`measure`, `lineHeight`) so every operation is testable headless.
- `components-textarea` gains an opt-in `profile` prop:
  `"membrane"` (default; behavior unchanged, quirks stay `advisory`) and
  `"extended"` (key events, pointer events and shortcuts route through
  `editor-buffer`). Extended state adds `goal-x` and `history` to the
  existing textarea-state extra map; `text` and `focus` stay in app
  state (`text_state_split` holds).
- `ui-mobile` bridge: map Home/End/Delete and carry modifier flags on
  the key-press event, and stop lowercasing named keys, so the extended
  profile works from soft and hardware keyboards.
- Index unit is unchanged (code points). Grapheme awareness is boundary
  snapping on top of it, so existing `cursor` / `select-cursor` values
  stay valid.

## Non-goals

- **Soft wrap.** Deferred to `add-textarea-soft-wrap`; the buffer models
  *visual lines* as `{start, end}` ranges (equal to logical lines until
  wrap lands) so wrap slots in without changing the operations.
- **Hosting the soft-keyboard bridge** (creating and focusing the hidden
  `<input>` in the SPA/DOM host, keyboard avoidance wiring). Deferred to
  `wire-soft-keyboard-host`; it interacts with `add-accessibility-model`
  (`textbox` role) and should be sequenced after it.
- No rich text, syntax highlighting, font families or CSS theming.

## Impact

- Affected specs: `editor-buffer` (new), `components-textarea` (added
  requirements), `ui-mobile` (added requirement).
- Affected code: new `src/components/textarea/buffer.ts`;
  `textarea.ts` / `handlers.ts` / `edit.ts` (profile routing);
  `src/ui/keyboard.ts` (key table, modifiers).
- Affected tests: the existing `components-textarea-*` and
  `ui-mobile-keyboard` tests must pass **unchanged** under the default
  profile; new fast-check properties for the buffer.
- Related in-flight changes: `add-spa-delivery` (PWA shell; no overlap),
  `add-accessibility-model` (textbox role; sequencing note above).
