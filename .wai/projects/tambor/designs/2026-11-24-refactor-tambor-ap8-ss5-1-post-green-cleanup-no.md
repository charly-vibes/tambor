---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss5-1-keyed-b2-re-run-focus-verification, pipeline-step:refactor]
---

REFACTOR tambor-ap8 ss5.1: post-green cleanup — no shape changes kept beyond the ticket. The debug instrumentation ([K]/[S]/[P] logs in dom-reuse, [TREE] dump in the render test) removed before commit; the e2e focus assertions narrowed to the identity premise (same element survives + holds focus post-draw) with the Chrome press-blur caveat documented in the helper header; file headers remain accurate (dom-reuse.ts header already names the keyed orphan sweep; domsim.ts header names the move-mirror contract). Bench B2 baseline numbers unchanged by this step (render-thread keyed splice is allocation-free on kept rows; no re-measure needed — §5.1 focus verification was the deliverable).
