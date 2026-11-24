---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss2-painter-wiring-keyed-records-through-buildctx, pipeline-step:refactor]
---

REFACTOR tambor-ap8 §2: split buildChildWithReuse (gate-flagged cyclomatic 12/function_lines 47) into spliceKeyed + recordRange helpers — 0 new pretender violations; removed 2 leftover [T] instrumentation console.logs from the debug session; behavior identical (946/946, tsc clean, tests byte-same).
