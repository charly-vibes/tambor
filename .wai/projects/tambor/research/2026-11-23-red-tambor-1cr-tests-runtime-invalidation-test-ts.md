---
tags: [pipeline-run:tdd-ro5u-2026-11-23-tambor-1cr-execute-add-runtime-invalidation, pipeline-step:red]
---

RED tambor-1cr: tests/runtime-invalidation.test.ts — 5/5 fail for the right reasons (missing ChangeSet publication / subscribe API / identity short-circuit / per-child reuse; file compiles clean, APIs declared structurally). Contracts: 6 hand-authored TOMLs under .espectacular/changes/add-runtime-invalidation/app-runtime-invalidation/ bound via [[tests.vitest]] --testNamePattern (ah scenario new refuses headings already in the spec delta — hand-authored per add-spa-delivery convention; ah lint clean). Narrow command: npx vitest run tests/runtime-invalidation.test.ts.
