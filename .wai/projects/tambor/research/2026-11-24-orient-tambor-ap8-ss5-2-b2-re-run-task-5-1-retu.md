---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-ap8-ss5-2-wire-keyed-table-b2-demo-rows, pipeline-step:orient]
---

ORIENT tambor-ap8 ss5.2: B2 re-run (task 5.1) returned IDENTICAL mutation medians to the 5.0 baseline (3021.5 @ 7726fc7) — the keyed-table bench demo builds rows as bare memo components through verticalLayout; the keyed reconcile plan only engages on keyed() siblings at the array's top level (translate wrappers hide the key), so the mechanism never engaged. RED evidence: benchmarks/results/b2-keyed-churn.json post-mechanism run == baseline mutation counts; the keyed-focus-list demo (which wraps rows in keyed(row.id, node) with the manual y accumulate) proves the splice works — the fix is the same wiring in keyed-table.ts keyedTableView: keyed at top level, y offsets by the verticalLayout accumulate rule, memo inner identity per row. Focus/selection e2e already green (2/2, 5x stable).
