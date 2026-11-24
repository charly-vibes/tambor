---
tags: [pipeline-run:tdd-ro5u-2026-11-23-tambor-1cr-execute-add-runtime-invalidation, pipeline-step:plan]
---

PLAN tambor-1cr: phases — (P1) bench groundwork FIRST: rinv-tail-1msg scenario + Build 1000 history/Stream 1 ops + baseline recorded BEFORE §3 optimization (PR-01); (P2) red: §1.0/§2.0/§3.0/§3.4 tests + contracts (in flight, OneCrRed); (P3) green-1: ChangeSet/DispatchCommit in dispatch.ts + App.subscribe in core.ts + barrels; (P4) green-2: §3.1 draw() identity short-circuit + §3.5 per-child reuse in dom-painters.ts + §3.2 unknown-ChangeSet full rebuild + §3.3 mount skip; (P5) §4.0 counters + §4.2 bench re-run + findings verdict; (P6) contracts deploy §5.2 (ah scenario new + [tests] bind + ah check); (P7) ticks + strict validate + RO5U review + fixes + ledger + ship. Narrow: npx vitest run tests/runtime-invalidation.test.ts. Full: just test-full + ah check --run-tests. Out of scope: ap8 keyed matching (M2), ry3 scheduling.
