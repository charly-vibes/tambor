---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-4ny-todo-rows, pipeline-step:red]
---

RED: command=npx vitest run tests/keyed-reconciliation-render.test.ts -t '5.1 gated filter flip'; expected failure=flip svg count 12, actual failure=expected +0 to be 12 (AssertionError at line 400, 1 failed / 8 passed-skip). HEAD 373143c reproduces tambor-4ny: gated flip draw collapses row leaf content.
