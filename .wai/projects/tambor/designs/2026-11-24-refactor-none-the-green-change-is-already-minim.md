---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-4ny-todo-rows, pipeline-step:refactor]
---

REFACTOR: none — the green change is already minimal and single-purpose (withKeyedSegment scoping: one stack field, one helper, scoping calls at the five wrapper painters + buildArrayChildren). No duplication introduced; names match the corpus (withX seam precedent); the 21-line/34-line diffs in dom-painters/dom-reuse contain no leftover instrumentation (verified: grep TEMP-DIAG/4ny- across src/render returns nothing). Tests stayed green throughout (no behavior change available to refactor). command=npx vitest run tests/keyed-reconciliation-render.test.ts (9/9 after the refactor scan)
