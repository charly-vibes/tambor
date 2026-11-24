---
tags: [pipeline-run:tdd-ro5u-2026-11-23-tambor-1cr-execute-add-runtime-invalidation, pipeline-step:red]
---

GATE-EDIT (in-step, §3 green-2 defect fix, part 2): hintless draws now PRESERVE lastScheme (hint?.scheme ?? this.lastScheme) instead of resetting to null — the mount's hintless initial draw clobbered the ambient seed, so the first hinted wire draw always mismatched and rebuilt. Same 3.0 defect, recorded in this step.
