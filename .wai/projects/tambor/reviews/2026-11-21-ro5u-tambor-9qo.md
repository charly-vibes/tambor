# RO5U Review — tambor-9qo add-resource-scopes (Qo9Review agent)

Verdict: FIX-FIRST. 0 Critical, 4 High, 2 Medium, 2 Low. Stage A mechanical 8/8 line refs verbatim; TypeSafe Stage B ran (findings below 0.8 gate routed REVIEW_REQUIRED); 0 measured false positives.

## High
- H1: dispose SHALLs contradict design D4 fallback no-op — unsatisfiable on worker:false hosts; scope SHALLs to Worker-backed client + add fallback carve-out scenario (mirror terminate, client.ts:58).
- H2: ground-truth false — src/spa/mount.ts:89 unmount() exists (root removal, focus surface, debug handle; callers src/main.ts:352-358, src/spa/main.ts:190); composition with new dispose() unspecified; pin unmount() disposes root scope children-first + scenario + task-4.2 assertion.
- H3: mount root scope promised (proposal bullet 5, tasks §4.0-4.2) but absent from BOTH spec deltas — add "The mount owns a root scope" requirement (create per mount, dispose children-first, double-dispose no-op, unmount composition).
- H4: tasks 5.0 bench B4 baseline needs §2-4 APIs — unexecutable as ordered; pin pre-mechanism baseline (terminate-churn/abandonment analogue measurable today: stuck promises, worker growth, queue size), 5.0 completes BEFORE task 2.1, scoped-churn shape becomes the 5.1 re-run.

## Medium
- M1: client dispose semantics normatively duplicated across both deltas — keep contract solely in components-worker_effect, slim R3 to ownership seam + one bridging scenario (or declare the mirror explicitly).
- M2: stale mountSpa entry-point name (proposal:54, design:46-47, tasks:62) — mountDemo (src/spa/mount.ts) is the mount; mountSpa (todo-spa.ts:35) delegates.

## Low
- L1: client double-dispose idempotency design-pinned but spec-silent — add scenario + task-2.x test.
- L2: dispose API shape inconsistent (dispose(scope) vs dispose()) — pin one shape across all four files.

Stage quality: Draft EXCELLENT · Correctness FAIR · Clarity GOOD · Edge cases FAIR · Excellence GOOD. Converged Stage 5, zero Critical at any stage.
