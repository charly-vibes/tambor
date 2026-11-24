---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-4ny-todo-rows, pipeline-step:orient]
---

ORIENT tambor-4ny: suite red at HEAD (172 todoRowsMatchModel, rows 0). Repro: real clicks flip filter to active -> list collapses (svg 12->0->2 progressive). Bisect by build+probe: fe73293/15a684a/961ca82/14a3eb6/be37b19/7726fc7 all mild (flip ->10 of 12, pre-existing stage-cull, suite green there); CATASTROPHE lands exactly at 373143c (ap8 ss5 keyed splice + keptContainers draw swap): flip ->0. Suspect: draw() swap removes previous top-level children not in keptContainers, but keptContainers only collects keyed container keeps; per-child/unkeyed reuse boxes get detached mid-frame. RED repro in tests/scratch-4ny.test.ts (real mountSpa wiring). Next: run repro, fix draw swap/orphan sweep.
