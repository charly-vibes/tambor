# RO5U Review — tambor-ilc sw prune prefix-scoping (IlcReview agent)

Verdict: FIX-FIRST (fixes applied and verified). 0 Critical, 0 High, 1 Medium, 1 Low.

## Medium
- M-F1: budget-ledger comment falsely attributed +28 B docs-shell growth to the sw.ts change (sw.js is a standalone esbuild entry outside the docs entry's staticClosure; real cause: concurrent spa edits riding the same build). FIXED — ledger comment rewritten to honest attribution.

## Low
- L-F2: test titles/helper said "activate" for an install-time prune (prune lives in sw.ts install(), tickets and header wording stale). FIXED — titles retitled "install keeps/prunes…", helper seedAndActivate → seedAndInstall.

## Verified sound
Scoping fix correct (prefix model strictly narrower than HEAD~1, no regression path); foreign-app names inside the tambor-spa prefix = prefix ownership, deliberate; empty cache list no-op; prune rejections propagate to waitUntil identically pre/post; deployed distribution-packaging spec carries no prune wording (no delta needed); structural caches declaration honest (no DOM lib); tests behavior-pinned via caches.keys()/has(), both projects covered.
