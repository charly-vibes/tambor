---
tags: [pipeline-run:tdd-ro5u-2026-11-23-tambor-1cr-execute-add-runtime-invalidation, pipeline-step:red]
---

GATE-EDIT (in-step, 4.2 metric fix): bench mutation observer reconciles removals at BATCH end — splice re-parents (removed+added of the same node in one batch) were being counted as new because removal-time drops poisoned the seen set; now only nodes removed and not re-added leave the set. Test-harness file (exempt); recorded for the 4.2 measurement chain.
