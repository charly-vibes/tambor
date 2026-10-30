# Lane brief: tambor-72m — editor-buffer task 7 (textarea integration)

You are a lane agent implementing ticket **tambor-72m** (deploy
add-textarea-editing-model → implement tasks.md) in the checkout
`/var/home/sasha/para/areas/dev/gh/charly/tambor` (branch `main`, source
tree clean apart from `.whisper` notes / untracked progress.md + run logs).
Work ONLY there. NEVER touch `bd`. NEVER push. Commit incrementally; the
orchestrator merges and runs the full gates.

## Ticket

tambor-72m P1: deploy add-textarea-editing-model change → implement tasks.md
(buffer core/graphemes, selection, line/word nav, goal-column, multi-line
hit-test, undo, **textarea integration**, mobile bridge, corpus, demo).

## Resume state (trust git, not memory)

- Deploy + tasks 1–6 landed green (task 6: red `ac11555`, green `5edca64`;
  tasks.md 1.1–6.2 `[x]`).
- HEAD: task-6 green commit `5edca64`; source clean.

## Goal

Task 7 of `openspec/changes/add-textarea-editing-model/tasks.md`:

- **7.1 Red**: the existing `components-textarea-*` tests pass unchanged with
  no `profile` prop (regression gate, run first).
- **7.2 Red→Green**: `profile` prop; extended key routing (D8); pointer
  placement via the buffer; `goal-x` and `history` in the extra map; atomic
  multi-path updates.
- **7.3 Red→Green**: shared op-sequence property — under `"extended"` the
  invariants of `editor-buffer` hold after any generated mix of key and
  pointer events.

## Out of scope

Tasks 8–10 (mobile bridge, corpus/docs, demo).

## Completion criteria (runnable; exit 0 = done)

- Task 7.1 Red→Green: regression gate green with no `profile` prop.
- Task 7.2 Red→Green: green.
- Task 7.3 Red→Green: shared op-sequence property green.
- `npx vitest run` → exit 0 (editor-buffer + components-textarea suites).
- `npx tsc --noEmit` → exit 0.

## Read first (in order, skim)

1. `openspec/changes/add-textarea-editing-model/tasks.md` (task 7 wording).
2. `openspec/changes/add-textarea-editing-model/design.md` (D1 opt-in `profile`;
   D8 extended key routing).
3. `src/components/textarea/` — edit.ts, textarea.ts, handlers.ts, buffer.ts
   (post-seam-splits: hit-test, undo).
4. `tests/components-textarea*` — regression gate suite + extended-profile tests.
5. `openspec/specs/editor-buffer/spec.md` + `tests/editor-buffer*.test.ts`.

## Design pointers

- D1: Opt-in `profile`, default `"membrane"`; quirks like `previous_line_quirk`
  are specified behavior — changing `key_map` in place would invalidate the
  corpus baseline.
- D8: Extended key routing: plain keys follow existing map; shift extends the
  head; ctrl/meta selects commands (`a` select-all, `z` undo, shift+`z`/`y`
  redo, left/right word, home/end document); unknown modified keys remain
  ignored.

## Spawn model

- Model: `recursive/flint-v1.0:free` (openrouter).
- Context ceiling: brief ≤ 2% of 262.1K window.

## Working discipline

- TDD red→green; incremental commits; progress.md one-liners.

## Final report (≤ 20 lines)

What landed, commit hashes, test counts, residuals.
