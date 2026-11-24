---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-akp-pretender-debt, pipeline-step:orient]
---

ORIENT tambor-akp pretender-debt refactor (tdd-ro5 run): RED = pretender findings on HEAD - bombadil/lib/visual.ts file_lines 421, surfaceBehind exported_cyclomatic 10>8 exported_lines 36>30, readVisualFacts cyclomatic 18>10 cognitive 17>15 function_lines 90>40 abc 41.45>30; bombadil/todo.spec.ts file_lines 422>400. Plan: extract color/contrast math to lib/contrast.ts; split readVisualFacts into countLeafViolations + countUndersizedTargets + surfaceContrast helpers (every top-level fn: cyclomatic<=8 lines<=30); extract todo stroke-marker detector to lib/todo-strokes.ts (first edit, already written pre-pipeline-start - recorded here). GREEN = pretender gate 0 new + bombadil property suites pass + tsc/eslint clean; then drop the fixed baseline entries from pretender-baseline.json.
