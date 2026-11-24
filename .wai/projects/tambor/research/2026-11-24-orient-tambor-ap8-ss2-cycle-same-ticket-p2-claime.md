---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss2-painter-wiring-keyed-records-through-buildctx, pipeline-step:orient]
---

ORIENT tambor-ap8 §2 cycle (same ticket, P2 claimed): acceptance restated — keyed rows splice on reorder/insert/remove via per-parent records + container index-path stack through BuildCtx; unknown ChangeSet/hintless frames never splice with keys present; M1 render tests stay green unmodified. §5.0 B2 baseline MUST complete before task 2.1 (PR-01 rule). Vehicle: existing keyed-table bench demo (1000 memo-stable rows via components.memo, ops preserve row identity) — MISSING a mid-list insert op (tail append is M1's already-cheap case; a tail-only baseline would be dishonest), so §5.0 adds insertFirst + button (plain-data op, band layout re-flow, existing buttonText bindings unaffected) + bench-scenarios-b2.ts row with countMutations + baseline run at cpu×4 + findings-b2.md.
