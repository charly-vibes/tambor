# tambor × wanna — a cold read of one working session

> **Cold read:** you can understand this repo with no knowledge of the chat that produced it.
> **Prov style:** every claim says where it came from, how well it is supported, and what produced it.

## What this is (60 seconds)

A single chat session in which an assistant (Claude) was given two codebases and asked to build with them:

| Name | What it is (as observed) |
|---|---|
| **tambor** | A strict-TypeScript UI library. State is plain data; a view is a pure function of state; handlers are pure and return *effects*; components edit state only through paths. |
| **wanna** | A spec-first harness for interaction/review sessions. Its core idea: every edge case (stale, duplicate, unavailable, unknown effect) is a *typed outcome* the consumer must handle. It is deliberately headless. |
| **power-turtle** | A ClojureScript Logo/turtle learning app, used as a design reference. |
| **membrane** | The Clojure(Script) pure-data UI library tambor's model comes from; studied for how it handles caching, events and state. |

The session produced three single-file demos (review session, Logo world, reactive notebook), a distribution recommendation, a design for a Smalltalk/Logo-style
"live world" on tambor, and a squint/cherry (ClojureScript) assessment.

## Read this before trusting anything

1. **The demos do not use the real tambor library.** The sandbox had no bundler and no network, so the demos embed a ~40-line re-implementation of tambor's *model*. See [`log/failures-and-errors.md`](log/failures-and-errors.md) F01.
2. **Neither demo has been opened in a real browser.** Only the Logo interpreter's logic was tested (in Node). See F05.
3. **The benchmark programme is a plan with hypotheses — nothing has been benchmarked.** See `docs/benchmarks-and-findings.md` §2 and §4.7.
4. **The "wanna principles" in demo 1 are the assistant's synthesis**, not an official list. See F03.
5. **Two factual slips were found and corrected** while writing this repo (language count; an unchecked claim). See F08.

## Map

| Path | Purpose |
|---|---|
| [`insights/`](insights/) | What was learned: one file per topic |
| [`log/failures-and-errors.md`](log/failures-and-errors.md) | What went wrong, impact, fix |
| [`log/improvements.md`](log/improvements.md) | Prioritised backlog with acceptance checks |
| [`prov/`](prov/) | Provenance: agents, activities, entities, claims ledger, PROV-N |
| [`artifacts/`](artifacts/) | The three demo pages as produced |
| [`tests/`](tests/) | Node tests for the Logo interpreter and the notebook core (the only automated checks) |
| [`docs/benchmarks-and-findings.md`](docs/benchmarks-and-findings.md) | **Start here for benchmarks:** the standalone cold-read, prov-style document |
| [`docs/glossary.md`](docs/glossary.md) | Terms |

## Evidence grades used everywhere

| Grade | Meaning |
|---|---|
| **O** | *Observed* — read directly in a file or page during the session |
| **T** | *Tested* — executed here and the result seen |
| **D** | *Derived* — the assistant's inference or synthesis |
| **U** | *Unverified* — asserted or planned, never checked |

## Published demos

- wanna review session: https://claude.ai/artifact/3uneDRYy1JnSDAETndEfda
- tambor Logo live world: https://claude.ai/artifact/9f9tsba4UzFJMdRfCzXxvU
- tambor reactive notebook (B9): https://claude.ai/artifact/2J27dqkD7egqzi9DXAVTjn
