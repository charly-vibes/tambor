---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-execute-add-keyed-dom-reconciliation, pipeline-step:red]
---

RED tambor-ap8 §1: command=just test (testaruda exec, 930 ingested). Expected failure CONFIRMED: tests/keyed-reconciliation.test.ts 1.0 keyed-reorder-plan fails on missing exports; tsc-strict pairs (tambor-core p_typescript, typing-strict p_strict) fail on the same TS2305 unresolved imports (reconcile, keyed) — same missing behavior, not setup breakage. Green = 1.1 keyed(key,drawable) in src/views/nodes.ts + reconcile plan in src/render/dom-reuse.ts (re-exported via dom-painters.ts existing line).
