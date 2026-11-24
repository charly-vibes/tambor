---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss5-1-keyed-b2-re-run-focus-verification, pipeline-step:orient]
---

ORIENT tambor-ap8 §5.1 cycle: (a) re-run B2 at the SAME protocol as 5.0's baseline (b2-keyed-churn, cpu×4, 3 runs) — keyed rows' DOM mutations drop to the structural delta (moved elements moved, not rebuilt); honest verdict section against the baseline incl. WALL CLOCK (the §2 review's MEDIUM: reconcile scan cost judged here); B3 streaming anchor + pinned state-equivalence contract green in both runs. (b) focus/selection preservation in a REAL browser: focus an input inside a keyed row, insert a row above, the focused element keeps its DOM identity and selection — needs an input-in-keyed-row vehicle (a playwright e2e spec; keyed-table demo rows are labels, so a small dedicated fixture app or extend keyed-table with an input row variant). No focus API ships (spec pin).
