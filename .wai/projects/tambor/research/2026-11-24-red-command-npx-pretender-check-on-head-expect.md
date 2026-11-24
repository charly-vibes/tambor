---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-akp-pretender-debt, pipeline-step:red]
---

RED: command='npx pretender check' on HEAD. Expected failure evidence (static-analysis red, the ticket's findings): bombadil/lib/visual.ts - file_lines 421>400; surfaceBehind exported_cyclomatic 10>8 exported_lines 36>30; readVisualFacts cyclomatic 18>10 cognitive 17>15 function_lines 90>40 abc 41.45>30. bombadil/todo.spec.ts - file_lines 422>400. (Gate mode currently passes only via the adopted baseline; this refactor removes the violations so those 10 baseline ids can be dropped.)
