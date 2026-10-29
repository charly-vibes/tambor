# Lane brief: tambor-72m — editor-buffer task 5 (multi-line hit-test)

You are a lane agent implementing ticket **tambor-72m** (deploy
add-textarea-editing-model → implement tasks.md) in the checkout
`/var/home/sasha/para/areas/dev/gh/charly/tambor` (branch `main`, source
tree clean apart from `.whisper` notes / untracked progress.md + run logs).
Work ONLY there. NEVER touch `bd`. NEVER push. Commit incrementally; the
orchestrator merges and runs the full gates.

## Ticket

tambor-72m P1: deploy add-textarea-editing-model change → implement tasks.md
(buffer core/graphemes, selection, line/word nav, goal-column, **multi-line
hit-test**, undo, textarea integration, mobile bridge, corpus, demo).

## Resume state (trust git, not memory)

- Deploy + tasks 1–4 landed green (task 1 `56f0235`; task 2 `011a3ee`; task 3
  `fb604a7`+`021c76e`; task 4 `959fbd8`+`190651f`; tasks.md 1.1–4.2 `[x]`).
- HEAD: task-4 lane commits incl. brief `91fb8bf` + task-4 lane commits
  (`959fbd8`, `190651f`, `973f442`); source clean.

## Goal

Task 5 of `openspec/changes/add-textarea-editing-model/tasks.md`:

- **5.1 Red**: round trip `indexAt(positionFor(i)) == i`; y selects the line;
  out-of-range clamps; monotone in x within a line.
- **5.2 Green**: `indexAt` / `positionFor` delegating to the existing
  single-line `indexForPosition` per line (design **D5**: hit-test lives in the
  buffer, not the backend; `indexForPosition` stays single-line; inverse
  `positionFor` same math reversed).

## Out of scope

Tasks 6–10 (undo, textarea integration, mobile bridge, corpus/docs, demo).

## Completion criteria (runnable; exit 0 = done)

- Task 5.1 Red: failing tests first; task 5.2 Green: green.
- `npx vitest run tests/editor-buffer*.test.ts` → exit 0.
- `npx tsc --noEmit` → exit 0.

## Read first (in order, skim)

1. `openspec/changes/add-textarea-editing-model/tasks.md` (task 5 wording)
2. `openspec/changes/add-textarea-editing-model/design.md` (D5)
3. `openspec/specs/editor-buffer/spec.md` (dual-format spec; `indexAt`/
   `positionFor` contracts)
4. `src/components/textarea/buffer.ts` (goalX, `moveByLine` w/ Metrics)
5. `src/render/backend.ts` (`indexForPosition` single-line; y ignored — task 5)
6. `tests/editor-buffer*.test.ts`

## Design pointers

- D5: Multi-line hit-test lives in the buffer, not the backend. `indexForPosition`
  stays single-line (no backend contract change). Buffer picks the line from
  `y / lineHeight`, calls the existing single-line service with that line's text
  and the x offset; inverse `positionFor(index)` = same math reversed; round trip
  is a property.

## Spawn model

- Model: `recursive/flint-v1.0:free` (openrouter).
- Context ceiling: brief ≤ 2% of 262.1K window.

## Working discipline

- TDD red→green; incremental commits; progress.md one-liners.

## Final report (≤ 20 lines)

What landed, commit hashes, test counts, residuals.
