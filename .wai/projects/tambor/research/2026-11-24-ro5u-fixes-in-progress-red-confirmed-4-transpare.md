---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-execute-add-keyed-dom-reconciliation, pipeline-step:fix-review]
---

RO5U-FIXES in progress: RED confirmed (4 transparency tests failing: geometry throw, isElem false, no nested rejection; a11y+extractor green-immediately — pin working behavior, recorded honestly). GREEN edits: Elem union admits KeyedDraw (nodes.ts:129, transparent-wrapper comment); nested-keyed TypeError (nodes.ts keyed()); CLAR-001 reword; geometry read-through entries keyed in ORIGINS/SIZES/CHILDREN/REBUILDERS (transparent: origin/bounds/children == inner's, rebuild via constructor). Pending: spec pin + tasks.md task + proposal impact line, then narrow run + just test-full.
