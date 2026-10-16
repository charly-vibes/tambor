# Entities

| ID | Entity | Origin | Notes |
|---|---|---|---|
| E01 | `tambor-main.zip` | attributed to user | includes `EVALUATION.md`, `experiments/` |
| E02 | `wanna-main.zip` | attributed to user | includes `docs/review-quickstart.md`, `docs/reuse-comparison.md` |
| E03 | `power-turtle-main.zip` | attributed to user | supplied after repo URL |
| E04 | `power-turtle.com` response | fetched | JS loading shell only |
| E05 | GitHub page + `project.clj` for power-turtle | fetched | `src` tree blocked |
| E06 | `artifacts/wanna-on-tambor.html` | generated (A02, A03) | published as E07 |
| E07 | demo 1 URL | generated (A03) | https://claude.ai/artifact/3uneDRYy1JnSDAETndEfda |
| E08 | `artifacts/tambor-logo.html` | generated (A06, A07) | published as E09 |
| E09 | demo 2 URL | generated (A07) | https://claude.ai/artifact/9f9tsba4UzFJMdRfCzXxvU |
| E10 | memory note for the tambor/wanna work | generated (A08) | generic project note |
| E11 | this repository | generated (A14) | |

Derivations: E06 ← E01,E02 · E08 ← E01,E06 · insights/* ← E01..E05 · E11 ← all.

## Added in the second half of the session

| ID | Entity | Origin | Notes |
|---|---|---|---|
| E12 | `tambor-main_1_.zip` (updated tambor, 801 files) | attributed to user | packaging, Logo example, real-library probes |
| E13 | membrane web sources: README, 2 design posts, `webgl.md`, partial `ui.cljc`, chat-log snippet | fetched (A18) | `ui.cljc` first ~1000 of 4549 lines |
| E14 | `artifacts/tambor-notebook.html` | generated (A20) | Marimo/Pluto-style reactive notebook |
| E15 | notebook URL | generated (A21) | https://claude.ai/artifact/2J27dqkD7egqzi9DXAVTjn |
| E16 | `docs/benchmarks-and-findings.md` and updated insights/log/prov | generated (A22) | this repo, revision 2 |
| E17 | `tests/notebook-core.test.mjs` | generated (A20) | Node test |

Derivations: E14 ← E12 (model), E06/E08 (earlier demos) · E16 ← E12, E13, E14.
