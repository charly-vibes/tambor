---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-4ny-todo-rows, pipeline-step:ship-close]
---

GATE-DRIVEN SPLIT (post-ledger): the pre-push pretender gate blocked on file_lines (dom-painters 415, dom-reuse 407, keyed-reconciliation-render.test 406 — all crossed by this session's fix + regression). Mechanical splits, zero behavior change: reconcile.ts (the pure §1 plan, 118 lines) out of dom-reuse (311); dom-painters-svg.ts (buildPath/buildArc + svg geometry, 92) out of dom-painters (335); the 5.1 regression to keyed-reconciliation-flip.test.ts (68; parent 375). Ceiling re-recorded 37637 (chunk boundaries). Verified: full suite 973/973 exit 0, tsc declarations clean, pretender gate exit 0.
