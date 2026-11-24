---
tags: [pipeline-run:tdd-ro5u-2026-11-23-tambor-1cr-execute-add-runtime-invalidation, pipeline-step:red]
---

GATE-EDIT (in-step, §3 green-2 defect fix): lastScheme seeded from ambientScheme() at construction — the hintless initial mount draw recorded null, so the first hinted wire draw (real ambient scheme) always mismatched and rebuilt; test 3.0's zero-rebuild pin exposed it. Import added from ../ui/ambient-theme.ts.
