---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-ap8-ss5-2-wire-keyed-table-b2-demo-rows, pipeline-step:plan]
---

PLAN tambor-ap8 ss5.2: (1) wire keyedTableView rows: state.rows.map through keyed(row.id, rowNode(row)) at the array top level, y offsets via the verticalLayout accumulate (first child bare-equivalent at y=0, gap=1) — mirrors keyed-focus-list.ts:104-113; (2) rebuild + rerun node benchmarks/run.mjs --scenario b2-keyed-churn (baseline backup kept at /tmp/b2-baseline.json); (3) assert mutations drop to structural delta: swap ~2 moved rows, insert-first 1 fresh + 0 moved, remove drops removed rows — vs baseline ~3021/frame; (4) record the Post-keying verdict in benchmarks/findings-b2.md (environment table, medians, pinned commit + working-tree caveat, honest verdict vs 5.0); (5) gates: keyed suites + test-full + ah check; (6) tick tasks 5.0/5.1/6.1/6.2 in openspec tasks.md.
