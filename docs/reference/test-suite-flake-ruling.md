# Test-suite flake family — ruling (tambor-8n3)

**Status**: accepted-and-fixed flake class. Supersedes the standing
"don't chase individually" note from the session snaps (54j.10/.11 wave,
8xm wave, add-worker-reply-validation apply).

## The family

Symptom: tests green solo fail under the full vitest suite (or
`ah check --run-tests` / playwright mobile-380), **a different victim set
each run**, always green on rerun. Recorded victims: `p_swappable`,
`p_touch_hover`, `phase-timers`, `spa-mount-input`, `view-bounds-memo`,
`p_keyboard_bridge`, notebook "+100 heavy appends", and one mass event of
25 bench tests in a single run.

## Root cause: the 5s default per-test timeout under machine load

Evidence (recovered verbatim from session logs — the error text was the
classifier the snaps never recorded):

- `Error: Test timed out in 5000ms.` is the failure text in every
  recovered instance (wt-b9 notebook run, wt-bz3 lane, wave-3 mass event
  of 25 bench tests — bz1/bz2/dashboard/form/keyed/log-stream/review/
  save-restore/time-travel/todomvc/turtle — at machine load ~5.7).
- A/B campaign (2026-10-24, tambor-8n3): 10 consecutive full-suite runs —
  4 on an idle machine (load ~0.5), 4 under synthetic CPU load (12 busy
  loops, load 12–29), 2 via `just test` (testaruda ingest) — **all green
  (724/724 × 10)**. Plain CPU load alone does not reproduce; the
  historical events happened while orchestrator waves ran parallel pi
  lanes + esbuild builds + playwright simultaneously (CPU *and* memory
  pressure on the shared laptop), which cannot be reproduced
  deterministically.
- What varies per run is *which* test happens to straddle the limit:
  116 files × per-file workers spawn into a contended machine, wall-clock
  per test inflates past 5s, vitest fails the slowest stragglers —
  different ones each time. This is why "green solo" and "green on
  rerun" both hold.

## The fix (landed)

`vitest.config.ts`: `testTimeout: 10_000` (default was 5s). Compute-heavy
bench describes keep their explicit `{ timeout: 30_000 }` budgets
(wave-3 precedent, bench-spreadsheet/bench-notebook). Cost: a genuine
hang is detected 2× slower; benefit: the whole load-flake class is
absorbed instead of re-chased per victim.

## Gate policy

1. **Timeout-class failures** (`Test timed out in Nms`) on a first
   full-suite run: rerun once. Green on rerun → load flake, recorded
   under this ruling, no per-victim chase.
2. **Non-timeout failures** (assertion, contract, property mismatches):
   investigate per the p-drawn precedent (fixed-seed replication,
   instrumented mismatch logger) — these are real findings, not this
   family.
3. **Playwright mobile-380 flakes**: same family in mechanism
   (wall-clock under load), different surface (real browser). Policy:
   rerun once; if a spec flakes repeatedly solo, fix the spec's waiting
   (never add sleeps).
4. **Never compare bench medians across machine states** — paired runs
   only (8xm ruling, unchanged).

## Non-causes ruled out

- Shared module-level state across workers: victims live in different
  files with no shared mutable module state; each file runs in its own
  worker (isolate default).
- fake-vs-real timer leakage between files in one worker: vitest spawns
  one worker per file here (116 spawned per run, confirmed in the A/B
  logs); no cross-file worker reuse.
- testaruda subset-shape packing: `just test` runs were green too, and
  the ah-ingest flake (p_keyboard_bridge, 1/2 runs) had the same
  timeout error text.

## Follow-up trigger

If timeout-class flakes reappear under the new 10s floor on CI (whose
runners are slower than the laptop), raise the floor again or move the
offending test's work under a describe budget — the mechanism is
documented here; only the number would move.
