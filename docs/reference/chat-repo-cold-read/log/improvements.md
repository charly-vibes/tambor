# Improvements backlog

Priority: **P1** do first · **P2** next · **P3** later. Each has an acceptance check.

| ID | P | Improvement | Acceptance check | Addresses |
|---|---|---|---|---|
| I01 | P1 | Bundle the real tambor (esbuild or equivalent) and rebuild both demos on its modules | demos import tambor sources; embedded mini-core deleted; both still pass I03 | F01 |
| I02 | P1 | Tie each of the 7 principles and each outcome label to a wanna spec/doc line; mark invented labels | every principle has a file:line citation or is removed | F03 |
| I03 | P1 | Browser-test both demos (e.g. Playwright): fault injection paths, restart, slider drag, textarea focus, dark mode, 380 px width | scripted run passes; screenshots reviewed | F05 |
| I04 | P2 | Runtime keyword tables (EN/ES) in the Logo demo; seed from power-turtle's Spanish CSV; fix `termiar-llenado`, add `color`/`repeat`; verify dialect words against a reference | Spanish programs run; reviewer sign-off by a Spanish speaker | F08, P6–P8 |
| I05 | P2 | Logo: halo/inspector (`select-path` effect), Worker + terminate for the interpreter, lessons as markdown slides with cursor | infinite loop is killable; lesson step = cursor | dynamic-environment |
| I06 | P2 | Write the Logo world in squint; evaluate cherry browser build and artifact CSP | compiles and runs locally; documented go/no-go on cherry | F06 |
| I07 | P2 | tambor packaging: barrel, `.d.ts` emit, subpath exports, remove `private`, provenance publish at 0.x | `npm pack` installs and imports in a clean project | F06 |
| I08 | P3 | wanna: re-run reuse comparison with a realistic baseline or narrow the claim; keep pinned git-dep meanwhile; prototype `wanna-tambor` adapter | decision recorded against `wanna-zbn` | F06 |
| I09 | P3 | Close tambor `EVALUATION.md` gaps: macro path-walker, shadow-cljs `:advanced`, test against built tambor | each item has a recorded result | T10 |
| I10 | P3 | If any power-turtle code is reused, comply with EPL 1.0; otherwise reuse ideas only | licence note in repo | P9 |

## Status after the updated tambor archive (2026-10-16)

| ID | Upstream status | Verified here |
|---|---|---|
| I01 real-library demos | in progress (`tambor-y9d.2`): Logo done; no review-session example seen | Logo parity **T** |
| I03 browser tests | open (`tambor-y9d.4`) | — |
| I07 packaging | implemented in tree | emit **T**; pack-probe not run |
| I09 EVALUATION gaps | recorded as closed in `EVALUATION.md` | not re-run |

## New items from the membrane study and benchmark design

| ID | P | Improvement | Acceptance check | Addresses |
|---|---|---|---|---|
| I11 | P1 | Memoise `bounds()` with a `WeakMap` on immutable nodes | hit-test microbench on 10k flat siblings improves; no unbounded growth | H5 |
| I12 | P2 | Spatial-index component for hit-testing | 10k-shape pointer-move < 2 ms | BZ3 |
| I13 | P1 | Ephemeral state lane for 60 Hz interaction state (pan/drag/scroll) | drag does not enter the persistent history | BZ2, BZ3 |
| I14 | P2 | Profile and bound the component render cache (key cost, eviction) | memory flat across 1M dispatches; key cost reported | H6 |
| I15 | P1 | Phase timers in dispatch (handler / derive / reconcile+layout / paint / GC) | per-dispatch breakdown exposed as data | H1 |
| I16 | P1 | Playwright benchmark harness for B1–B9 and BZ1–BZ7 with raw JSON output | one command reproduces all tables | all |
| I17 | P2 | Components: `memo`, virtual list/grid, canvas layer, ring-buffer series, worker effect, lazy tree | each has a benchmark that failed before and passes after | BZ suite |
| I18 | P2 | Notebook: browser test, Worker evaluator with kill switch, incremental structural edits | 200 chained cells: slider→paint < 50 ms | B9, F14 |
| I19 | P3 | Refresh `squint-cherry.md`/`distribution.md` once upstream settles | banners removed, text rewritten | F11 |
| I20 | P2 | Run tambor's vitest suite and `pack-probe.sh` in a networked environment | green run recorded | F15 |
| I21 | P3 | ~~Read remaining membrane sources (`component.cljc`, backends, scrollview)~~ — **done 2026-10-18**: M8 resolved (args-keyed component cache + opt-in `Cached` draw images exist; no generic memo), M9 resolved (virtualisation absent; scrollview clip-only; viscous is a separate repo). See insights/membrane.md and benchmarks-and-findings.md §3.2 | M8/M9 now O with file:line evidence | F12 closed |
