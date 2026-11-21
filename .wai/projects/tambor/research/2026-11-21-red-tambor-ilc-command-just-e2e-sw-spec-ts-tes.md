---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-ilc-sw-activate-prune-cache-scoping, pipeline-step:red]
---

RED tambor-ilc: command='just e2e sw.spec.ts' (tests/e2e/playwright.config.ts, desktop+mobile-380). Expected failure confirmed: 'activate keeps caches outside the tambor-spa prefix' FAILS both projects (current sw.ts:142 install-time prune deletes every cache !== current name, no CACHE_PREFIX check); 'activate prunes stale tambor-spa generations' PASSES; pre-existing offline-shell scenarios still pass (scaffolding inert). Note: prune loop lives in install() not activate() — ticket wording and sw.ts header comments stale; fix targets sw.ts:142 with comment correction.
