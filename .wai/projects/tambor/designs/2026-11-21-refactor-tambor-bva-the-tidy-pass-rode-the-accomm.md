---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-bva-execute-add-frame-coalescing, pipeline-step:green]
---

REFACTOR tambor-bva: the tidy pass rode the accommodation sweep (BvaFix + BvaGreen-2) — test files reorganized around flush()/mode:immediate per stated purpose with rationale comments; implementation landed design-faithful and needed no further tidying (BvaFix traced flush/coalescer paths, found no D2/D3 violation). Size ledgers re-recorded per ritual: docs shell 34464 B (+155 B coalescer in shared spa bundle), spa delivery 157256 B (+229 B shipped js) — both dated in their ledger comments. Full suite 913/913 green after bootSelection shape pins gained the mode field (task 2.1 return-shape growth).
