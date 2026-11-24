---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-ap8-ss5-2-wire-keyed-table-b2-demo-rows, pipeline-step:green]
---

GREEN ss5.2: B2 churn floor landed. placeKeyedChildren order pass (order-exact minimal-move via new ElementLike/HostElement insertBefore in domsim+domhost), kept-box same-parent append guard (the per-frame re-append fired a childList move the expanded mutation counter re-counted, ~1005/op), b2 scenario clicks drawnOps (pointsOf replay point for Replace 10% fell inside Build 1000's box, firing a full rebuild as the replace sample). Bench: swap 3018->19, insert 3023->21, remove 3023->19, replace 3020->216 mutations/op; wall median 259->232ms. Full suite 961/961. Docs shell ceiling re-recorded 37597 B.
