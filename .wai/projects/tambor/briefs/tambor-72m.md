# Lane brief: tambor-72m — editor-buffer task 3 (line / word / document navigation)

You are a lane agent implementing ticket **tambor-72m**
(*Deploy add-textarea-editing-model OpenSpec change from chat-22cafc0c
artifact, then implement tasks.md*) in the checkout
`/var/home/sasha/para/areas/dev/gh/charly/tambor` (branch `main`, source
tree clean apart from `.whisper` notes). **Work ONLY there. NEVER touch
`bd`. NEVER push.** Commit incrementally; the orchestrator merges and
runs the full gates.

## Why (delegation rationale)

Deploy phase + editor-buffer tasks 1–2 landed green under prior TDD
discipline; task 3 is the next coherent red→green slice. Delegating to a
fresh-model lane keeps context lean and keeps the lead orchestrator in the
verify/ship seat (canon: lead orchestrates only; inline execution is the
historical failure mode).

## Ticket

tambor-72m P1: deploy add-textarea-editing-model change → implement tasks.md
(buffer core/graphemes, selection, line/word nav, goal-column, multi-line
hit-test, undo, textarea integration, mobile bridge, corpus, demo).

## Resume state (trust git, not memory)

- Deploy phase landed: `openspec/changes/add-textarea-editing-model/{design,proposal}.md`,
  specs deltas (incl. new `editor-buffer` spec), `tasks.md` — task-1 commit
  `56f0235`, task-2 commit `011a3ee`; both green (vitest + tsc).
- tasks.md: 1.1–2.2 now `[x]`. **Task 3 next**: 3.1 Red → 3.2 Green.
- HEAD `011a3ee` (task 2) / `56f0235` (task 1) ahead of `origin/main` by 2.
- Source tree clean (only `.whisper` notes dirty).

## Goal

Task 3 of `openspec/changes/add-textarea-editing-model/tasks.md`:

- **3.1 Red**: line-start/end bounds; word stops match the class rule;
  document start/end; idempotence at the edges.
- **3.2 Green**: implement the class-based word rule (design **D7**).

## Out of scope

Tasks 4–10 (goal-column vertical movement, multi-line hit-test, undo,
textarea integration, mobile bridge, corpus/docs, demo). File follow-ups
per repo convention if task 3 surfaces adjacent gaps.

## Completion criteria (runnable; exit 0 = done)

- Task 3.1 Red: failing tests first; task 3.2 Green: green.
- `npx vitest run tests/editor-buffer*.test.ts` → exit 0.
- `npx tsc --noEmit` → exit 0.

## Read first (in order, skim)

1. `openspec/changes/add-textarea-editing-model/tasks.md`
2. `openspec/changes/add-textarea-editing-model/design.md` (D2–D8)
3. `openspec/specs/editor-buffer/spec.md` (dual-format spec)
4. `src/components/textarea/buffer.ts` (`EditorBufferState{text,anchor,head,goalX}`,
   `clusterBoundaries`, `moveByCluster`, `deleteByCluster`, `selectAll`)
5. `src/components/textarea/edit.ts`, `src/render/backend.ts` (`indexForPosition`
   single-line, y ignored — task 5)
6. `tests/editor-buffer.test.ts`, `tests/editor-buffer-selection.test.ts`
   (red/green style, fast-check properties)

## Design pointers

- **D2**: index unit = code points; ops snap to grapheme cluster boundaries
  (Intl.Segmenter, `"grapheme"`) — a cursor never rests inside a cluster.
- **D4**: goal column is an x offset via injected `Metrics` (task 4, not now).
- **D7**: word = run of letters/digits/`_`; whitespace and each punctuation run
  are their own stops. Class-based, headless, deterministic. `Intl.Segmenter`
  word granularity deferred (CJK revisit).

## Spawn model

- Model: `recursive/flint-v1.0:free` (openrouter) via
  `pi -p --model recursive/flint-v1.0:free`.
- Context ceiling: brief ≤ **2%** of the model's 262.1K window (~5.2K tokens);
  this brief is ~2K tokens — well inside the ceiling.

## Working discipline

- TDD red→green per slice; incremental task-scoped commits.
- Progress notes: append one-liners to `progress.md` at checkout root after
  each meaningful step.
- If a step fails twice, move to the next coherent piece and note it; do not stall.

## Final report (≤ 20 lines)

What landed, commit hashes, test counts, residuals.
