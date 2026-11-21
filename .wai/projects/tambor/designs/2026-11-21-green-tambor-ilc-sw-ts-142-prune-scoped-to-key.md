---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-ilc-sw-activate-prune-cache-scoping, pipeline-step:green]
---

GREEN tambor-ilc: sw.ts:142 prune scoped to key !== name && key.startsWith(CACHE_PREFIX); stale activate-prune header comments corrected to install-time prefix-scoped; no spec delta needed (deployed distribution-packaging spec has no prune wording). Verified: npx tsc -p tsconfig.json --noEmit exit 0; npm run build:spa green after DOCS_SHELL_GZIP_CEILING_BYTES re-record 34281→34309 (+28 B from corrected headers, dated ritual comment added); just e2e sw.spec.ts 6/6 passed desktop+mobile-380. tsconfig has no DOM lib → added structural caches declaration in sw.spec.ts per repo convention (sw.ts SwGlobal.caches shape).
