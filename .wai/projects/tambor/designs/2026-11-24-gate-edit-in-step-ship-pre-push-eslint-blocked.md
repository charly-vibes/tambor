---
tags: [pipeline-run:tdd-ro5u-2026-11-23-tambor-1cr-execute-add-runtime-invalidation, pipeline-step:ship-close]
---

GATE-EDIT (in-step, ship): pre-push eslint blocked the push — publishCommit's throw-in-finally (no-unsafe-finally) + unknown-vs-undefined comparisons (no-unnecessary-condition) rewritten as a typed {error}|null delivery result with a hasFirstError flag; semantics identical (firstError surfaces before the drain error; the drain never swallows it). 13/13 commit+lane tests, tsc clean, eslint clean.
