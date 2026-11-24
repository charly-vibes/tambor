---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss4-createselector-pattern-components-memo, pipeline-step:refactor]
---

REFACTOR tambor-ap8 §4: nothing to tidy — createSelector is a single 18-line function over the memo contract (cache/fresh/cached mirroring memo's own body), gate 0 new, lint clean. The TypeError message duplication with memo's is intentional (the same pinned contract text, tests assert it).
