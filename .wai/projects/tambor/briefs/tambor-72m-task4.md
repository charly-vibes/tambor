# Lane brief: tambor-72m — editor-buffer task 4 (goal-column vertical movement)

You are a lane agent implementing ticket **tambor-72m** (deploy
add-textarea-editing-model → implement tasks.md) in the checkout
`/var/home/sasha/para/areas/dev/gh/charly/tambor` (branch `main`, source
tree clean apart from `.whisper` notes / untracked progress.md + run logs).
Work ONLY there. NEVER touch `bd`. NEVER push. Commit incrementally; the
orchestrator merges and runs the full gates.

## Ticket

tambor-72m P1: deploy add-textarea-editing-model change → implement tasks.md
(buffer core/graphemes, selection, line/word nav, **goal-column**, multi-line
hit-test, undo, textarea integration, mobile bridge, corpus, demo).

## Resume state (trust git, not memory)

- Deploy + tasks 1–3 landed green (task 1 `56f0235`; task 2 `011a3ee`;
  task 3 `fb604a7`+`021c76e`; tasks.md 1.1–3.2 `[x]`).
- HEAD: brief `2accd92` + task-3 lane commits `fb604a7`, `021c76e`, `620e609`
  on top of task-2 `011a3ee`; source clean.

## Goal

Task 4 of `openspec/changes/add-textarea-editing-model/tasks.md`:

- **4.1 Red**: up-then-down returns; goal x survives a short line; first/last
  line edges; horizontal moves reset `goalX`.
- **4.2 Green**: `Metrics` interface, fixed-width test stub, vertical move
  (design **D3/D4**: geometry injected via `Metrics`; goal column is an x
  offset via `Metrics.measure`, not a column count).

## Out of scope

Tasks 5–10 (multi-line hit-test, undo, textarea integration, mobile bridge,
corpus/docs, demo).

## Completion criteria (runnable; exit 0 = done)

- Task 4.1 Red: failing tests first; task 4.2 Green: green.
- `npx vitest run tests/editor-buffer*.test.ts` → exit 0.
- `npx tsc --noEmit` → exit 0.

## Read first (in order, skim)

1. `openspec/changes/add-textarea-editing-model/tasks.md` (task 4 wording)
2. `openspec/changes/add-textarea-editing-model/design.md` (D3 goal column, D4)
3. `openspec/specs/editor-buffer/spec.md` (dual-format spec)
4. `src/components/textarea/buffer.ts` (EditorBufferState.goalX; task-3 nav
   moves + `stepHead`)
5. `tests/editor-buffer*.test.ts`

## Design pointers

- D3: Geometry injected via `Metrics { measure(text): number; lineHeight: number }`;
  headless buffer, fixed-width stub in tests; DOM/canvas supply measure.
- D4: Goal column = x offset via `Metrics.measure` (not a column count); horizontal
  moves set it; vertical moves preserve it.

## Spawn model

- Model: `recursive/flint-v1.0:free` (openrouter).
- Context ceiling: brief ≤ 2% of 262.1K window.

## Working discipline

- TDD red→green; incremental commits; progress.md one-liners.

## Final report (≤ 20 lines)

What landed, commit hashes, test counts, residuals.
