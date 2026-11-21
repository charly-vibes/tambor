---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-ilc-sw-activate-prune-cache-scoping, pipeline-step:green]
---

QUALITY LEDGER tambor-ilc: Changed — src/spa/sw.ts (install-time prune scoped to CACHE_PREFIX, header corrected), tests/e2e/sw.spec.ts (2 prefix-scoping tests + structural caches declaration), tests/helpers/docs-delivery-budget.ts (ceiling re-record, final value rides bva's bump; both re-records dated). Verified — just e2e sw.spec.ts 6/6 both projects; npx vitest full suite 913/913; tsc -p tsconfig.json clean; openspec untouched (deployed distribution-packaging spec has no prune wording — no delta needed, confirmed by IlcReview). Review — RO5U: 0 Critical, 0 High; M-F1 (budget attribution) + L-F2 (activate misnomer) FIXED. Risks — none known; foreign-app cache names inside the tambor-spa prefix remain the prefix-ownership model (deliberate, strictly narrower than before). Next — commit, bd close, wave 2.
