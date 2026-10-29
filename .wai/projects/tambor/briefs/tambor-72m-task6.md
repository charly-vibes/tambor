# Lane brief: tambor-72m — editor-buffer task 6 (undo / redo)

You are a lane agent implementing ticket **tambor-72m** (deploy
add-textarea-editing-model → implement tasks.md) in the checkout
`/var/home/sasha/para/areas/dev/gh/charly/tambor` (branch `main`, source
tree clean apart from `.whisper` notes / untracked progress.md + run logs).
Work ONLY there. NEVER touch `bd`. NEVER push. Commit incrementally; the
orchestrator merges and runs the full gates.

## Ticket

tambor-72m P1: deploy add-textarea-editing-model change → implement tasks.md
(buffer core/graphemes, selection, line/word nav, goal-column, multi-line
hit-test, **undo**, textarea integration, mobile bridge, corpus, demo).

## Resume state (trust git, not memory)

- Deploy + tasks 1–5 landed green (task 5: red `aa20a3f`, green `b592918` +
  hit-test seam split; tasks.md 1.1–5.2 `[x]`).
- HEAD: task-5 green commit `b592918` on top of the task-4 chain; source
  clean (except `.whisper` notes / untracked progress.md + run logs).

## Goal

Task 6 of `openspec/changes/add-textarea-editing-model/tasks.md`:

- **6.1 Red**: edit-then-undo identity; redo undoes undo; branch on act;
  coalescing of one word; bounded length.
- **6.2 Green**: splice history with selection before/after, coalescing rule
  (whitespace, newline, cursor jump, `now` gap), limit prop (design **D6**).

## Out of scope

Tasks 7–10 (textarea integration, mobile bridge, corpus/docs, demo).

## Completion criteria (runnable; exit 0 = done)

- Task 6.1 Red: failing tests first; task 6.2 Green: green.
- `npx vitest run tests/editor-buffer*.test.ts` → exit 0.
- `npx tsc --noEmit` → exit 0.

## Read first (in order, skim)

1. `openspec/changes/add-textarea-editing-model/tasks.md` (task 6 wording)
2. `openspec/changes/add-textarea-editing-model/design.md` (D6)
3. `openspec/specs/editor-buffer/spec.md` (dual-format spec; undo contracts)
4. `src/components/textarea/buffer.ts` (post-seam-split state + nav + hit-test)
5. `tests/editor-buffer*.test.ts`

## Design pointers

- D6: Undo is a bounded timeline of splices; history entries
  `{ at, deleted, inserted, before, after }` (splice + selection before/after).
  Undo applies the inverse splice and restores `before`; redo reapplies. A new
  edit after undo discards the redo tail (branch-on-act); consecutive
  single-character inserts coalesce into one entry until a boundary (whitespace,
  newline, cursor jump, or a time gap via the existing `now` prop). Length is
  bounded. Textarea-local history covers only edits inside the focused
  textarea; app-level undo is unaffected (out of scope).

## Spawn model

- Model: `recursive/flint-v1.0:free` (openrouter).
- Context ceiling: brief ≤ 2% of 262.1K window.

## Working discipline

- TDD red→green; incremental commits; progress.md one-liners.

## Final report (≤ 20 lines)

What landed, commit hashes, test counts, residuals.
