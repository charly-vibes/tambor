---
tags: [pipeline-run:tdd-ro5u-2026-11-23-tambor-1cr-execute-add-runtime-invalidation, pipeline-step:red]
---

GREEN tambor-1cr complete: §1/§2 ChangeSet/DispatchCommit/subscribe + throw isolation (§2.3); §3 whole-view short-circuit (lastScheme seeded/preserved — hintless initial draw reset the ambience) + per-child identity reuse (§3.5/3.6); §4.0 opt-in counters (non-enumerable counts() on the debug snapshot, pinned 4-key surface intact); §4.1 baseline 4054 mutations/op recorded pre-optimization; §4.2 verdict POST: 31 mutations/op (130× drop, changed rows only), wall 281→232ms. Defect fixes during green: test tick() replaced rows (broke memo identity — fixture now updates tick keypath only); bench observer counted splice re-parents as new (batch-end removal reconciliation). Row memo + composed wrappers are DEMO-side (stream-dashboard.ts) — the renderer never content-matches. Verdict recorded in benchmarks/findings-rinv.md. All tasks ticked; strict exit 0. Full suite 922/922.
