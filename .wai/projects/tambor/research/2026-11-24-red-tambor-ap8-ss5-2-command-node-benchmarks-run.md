---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-ap8-ss5-2-wire-keyed-table-b2-demo-rows, pipeline-step:red]
---

RED tambor-ap8 ss5.2: command=node benchmarks/run.mjs --scenario b2-keyed-churn (post-mechanism tree). Expected failure=mutations stay at baseline median 3021.5/frame instead of dropping to the structural delta — observed exactly that (identical medians, pinned commit 7726fc7fc both runs). Root cause: keyedTableView never wraps rows in keyed(); the plan's keyed-sibling gate (translate hides the key) never opens.
