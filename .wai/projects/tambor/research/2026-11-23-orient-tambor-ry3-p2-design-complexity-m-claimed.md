---
tags: [pipeline-run:tdd-ro5u-2026-11-23-tambor-ry3-author-add-render-scheduler, pipeline-step:orient]
---

ORIENT tambor-ry3: P2 design/complexity:m, claimed, unblocked (bva landed). files: openspec/changes/add-render-scheduler, src/spa/mount.ts, src/effects/dispatch.ts; base 54de0bf. Acceptance restated: strict validate exit 0; design reconciles makeApp repaint scheduling with wireDrawTail/wireRerender as ONE host-owned authority; tasks red→green with fake-frame scheduler tests; review gate before execution ticket. Known duplication to reconcile: makeApp scheduleRepaint queues one view-rebuild rAF per state dispatch in every mode (BvaFix observation) while the landed mount coalescer owns the routed paint.
