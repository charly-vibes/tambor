# Failures, errors and limitations

Format: **what happened → impact → cause → fix/mitigation**. Status: `open` / `fixed` / `mitigated`.

## F01 — Demos use a model port, not the real tambor  · open
- **What:** both demos embed a ~40-line re-implementation (`h`, `build`, `setIn`, `dispatch`, effects table).
- **Impact:** they demonstrate tambor's *model*, not its API; drift from the real library would go unnoticed.
- **Cause:** sandbox had no esbuild and no network; tambor builds to `dist/spa.js` with esbuild.
- **Fix:** I01. This was disclosed to the user in the same turn.

## F02 — Demo 1 first draft had a hacky principle-lighting rule  · fixed
- **What:** the "principles exercised" checklist lit `typed`/`rec` through an ad-hoc condition and never reliably.
- **Impact:** checklist would mislead.
- **Fix:** replaced with a uniform rule (any logged outcome lights `typed` and `rec`; others light via their tag) via edits on the first publish.
- **Lesson:** caught by re-reading, not by a test.

## F03 — "wanna principles" are synthesis; outcome names partly invented  · open
- **What:** the seven principles and outcome labels such as `committed`, `refreshed`, `retired`, `resumed` are the assistant's. Only five submit outcomes are from wanna's docs.
- **Impact:** a reader could attribute them to wanna.
- **Fix:** labelled D in `insights/wanna.md`; I02 ties each to a spec line.

## F04 — Demo 2 first draft had code smells  · fixed
- **What:** `derive` was reassigned after declaration; a dead `withDefs` stub remained.
- **Fix:** rewritten as one clean `derive(entries, late)`; then tested in Node (`tests/`).

## F05 — Neither demo opened in a real browser  · open
- **Impact:** UI behaviour is unproven. Specific risks: demo 2's `paint()` carries live `textarea`/slider nodes across re-derivation (keep-node swap); slider drag on touch; demo 1 focus restoration via `data-id`; small-screen layout; dark-mode tokens.
- **Fix:** I03.

## F06 — Advice not build-verified  · open
- **What:** the distribution plan (`insights/distribution.md`) and squint/cherry assessment rest on reading configs and `EVALUATION.md`.
- **Impact:** package emit, exports and browser bundles could fail in practice.
- **Fix:** I06, I07, I09.

## F07 — Process: ambiguity and silence  · mitigated
- `power-turtle.com` was a JS shell; a name search returned unrelated electrical products. Two calls were spent before the user supplied the repo.
- A long read-only investigation phase preceded the first build; a system nudge asked for a status line. Earlier short status lines would have helped.

## F08 — Claims stated without full verification  · fixed / open
- **"14 languages"** for power-turtle → actual **12** (counted when writing this repo). *fixed*
- **Spanish dialect keywords** (`avanza`, `giraderecha`, `repite`) stated from memory. *open (U)* — I04 requires a reference check.
- Spanish CSV "appears to be missing entries" was hedged correctly and later **confirmed** (`color`, `repeat`).

## F09 — Environment limits shaped scope  · mitigated
- Network disabled for bash: no esbuild, squint, cherry, npm.
- GitHub `src` tree blocked by robots.txt; `web_fetch` of an SPA returns its loading shell.
- Mitigation: user uploaded zips; findings are labelled by what could actually be read.

## F10 — Minor tooling slip  · fixed
- First repo-skeleton command failed: the shell was POSIX `sh` (no brace expansion / process substitution). Re-run with explicit paths and `bash -c`. No data lost.

## F11 — Earlier insight files went stale  · fixed
- `insights/squint-cherry.md` and `distribution.md` predated the updated tambor archive, which implemented/re-ran much of what they recommended. Fixed with update banners and `insights/tambor-latest.md`.

## F12 — membrane source only partly read  · closed 2026-10-18 (I21, tambor-54j.12)
- Read: README, two design posts, WebGL doc, a chat-log snippet, first ~1000 of 4549 lines of `ui.cljc`. Not read: `component.cljc`, backends, basic components. Claims about memoisation/virtualisation are therefore "not found", not "absent".
- Search results for membrane were shallow and repetitive; primary pages were fetched instead.
- **Resolved:** full clone of phronmophobic/membrane at HEAD read 2026-10-18 (`component.cljc` cache machinery, `basic_components.cljc`, `toolkit.cljc`, `present.cljc`, scrollview, backends java2d/skia/webgl/skija/ios). M8: subtree memoisation EXISTS (component cache + opt-in `Cached` images). M9: virtualisation ABSENT (scrollview clip-only). Evidence in insights/membrane.md + §3.2.

## F13 — Benchmark failure modes are hypotheses  · open
- Beyond the emit check and Logo count parity, no tambor performance was measured. `docs/benchmarks-and-findings.md` §4.7 lists hypotheses with falsification tests. Fix: I15, I16.

## F14 — Notebook example limits  · open
- Core tested in Node; UI never opened in a browser. Add/delete force a full run. The expression language is small by design. 200+ textarea cards re-derived per dispatch is *expected* to be slow — it is the measurement, not a bug, but it is unmeasured.

## F15 — Verification gaps on the updated tambor  · open
- Emit was checked with the sandbox's TypeScript 6.0.3 (the repo's pinned version not checked). vitest suite not run (no `node_modules`, no network). `pack-probe.sh` not run.
