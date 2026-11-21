---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-bva-execute-add-frame-coalescing, pipeline-step:green]
---

RO5U-FIXES tambor-bva (BvaShipFix agent; orchestrator-verified): M1 trailing settleFrames in clickDrawnText (spec-level reads deterministic; e2e gallery+risks+sw+bench-smoke 87 passed/3 skipped after fix); M2 spec requirement scoped to routed event wire + app-handle-bypass scenario added + design D3 mode:"immediate" (openspec validate --strict exit 0); L1 coalescer drop() dead-flag from unmount (paint guarded post-drop; live-mount flush unchanged); L2 coalesced lane-stream pin (3 moves, drawCount 0 pre-pump, one draw at final offset [15,0]). Docs shell ceiling re-recorded 34464→34490 B (+26 B drop guard, dated). tsc clean; spa-mount-coalesce 4/4, lane/mount suites 19/19.
