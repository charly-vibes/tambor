---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-9qo-author-add-resource-scopes, pipeline-step:green]
---

RO5U-FIXES tambor-9qo (Qo9Fix agent): all 8 findings applied with adaptations — H1 worker:true scoping + fallback carve-out scenario (mirrors terminate, client.ts:58); H2 ground-truth corrected (unmount() exists, mount.ts:89, caller is src/docs/main.ts:352-358 not src/main.ts) + unmount-disposes-root-scope composition pinned (decision 2, Pins, scenario, task 4.2); H3 'The mount owns a root scope' requirement added; H4 bench B4 split: 5.0 pre-mechanism baseline on today's client BEFORE task 2.1, 5.1 scoped re-run; M1 dispose contract kept solely in components-worker_effect, R3 slimmed to ownership seam; M2 mountSpa→mountDemo renames; L1 double-dispose idempotency scenario + task 2.4; L2 dispose(scope) pinned everywhere (design decision). Orchestrator-verified: openspec validate add-resource-scopes --strict exit 0.
