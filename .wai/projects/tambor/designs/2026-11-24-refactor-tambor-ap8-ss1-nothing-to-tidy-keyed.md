---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-execute-add-keyed-dom-reconciliation, pipeline-step:refactor]
---

REFACTOR tambor-ap8 §1: nothing to tidy — keyed() landed as 4 small exports in nodes.ts, reconcile as one pure function in dom-reuse.ts; no duplication (validation mirrors memo's contract but in its own module), names match tasks.md vocabulary (keyed/reconcile/ReconcileStep/KeyFn). buildChildWithReuse doc comment still truthfully says 'no keyed matching' — that flips in §2 wiring. eslint clean on all touched files; budgets: nodes.ts 337, dom-reuse.ts 168, dom-painters.ts exactly 400 (re-export line extended in place).
