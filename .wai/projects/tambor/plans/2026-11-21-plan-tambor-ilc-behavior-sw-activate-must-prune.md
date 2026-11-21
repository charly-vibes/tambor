---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-ilc-sw-activate-prune-cache-scoping, pipeline-step:plan]
---

PLAN tambor-ilc: behavior — SW activate must prune only caches under CACHE_PREFIX 'tambor-spa'; foreign origin co-residents untouched. Out of scope: sw registration lifecycle, skipWaiting logic, spec rewrites beyond a possible refinement delta. Tests first: (T1) foreign cache 'other-app-v1' survives activate; (T2) tambor-spa old+current generations → only current remains. Narrow: npx vitest run tests/e2e/sw.spec.ts. Full: just test-full + ah check --run-tests. Files: tests/e2e/sw.spec.ts (red), src/spa/sw.ts (green), possibly openspec/changes/add-spa-delivery spec delta. Commit shape: one feature commit (test+fix together, complexity:s), no refactor commit expected.
