---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-ilc-sw-activate-prune-cache-scoping, pipeline-step:orient]
---

ORIENT tambor-ilc: P1 bug afk/complexity:s, unclaimed, no blockers. files: src/spa/sw.ts, tests/e2e/sw.spec.ts, openspec/changes/add-spa-delivery; base 54de0bf. Acceptance restated: (1) failing test first in tests/e2e/sw.spec.ts proving a foreign (non-tambor-spa) cache survives SW activate while tambor-spa generations still prune; (2) prune loop scoped to CACHE_PREFIX in src/spa/sw.ts:141-42; (3) full suite green. Notes step-order honored: read deployed add-spa-delivery distribution-packaging prune wording during green; fold refinement delta only if it mandates origin-wide pruning.
