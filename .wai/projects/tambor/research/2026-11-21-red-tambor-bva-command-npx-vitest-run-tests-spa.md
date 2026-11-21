---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-bva-execute-add-frame-coalescing, pipeline-step:red]
---

RED tambor-bva: command='npx vitest run tests/spa-mount-coalesce.test.ts' — 4/4 fail for the right reasons. 1.1 fails (draws happen synchronously per dispatch today, 0-draws-before-pump assertion violated); 1.3 fails (mode inert — scaffolding only, immediate mode not wired); 1.4a fails (flush() no-op); 1.4b fails (no-rAF → nothing draws today). Scaffolding inert verified: mount.ts/todo-spa.ts compile clean (agent ran tsc: only peer sw.spec.ts errors, since fixed), existing spa tests untouched. Fake-rAF pump + backend draw spy patterns reused from backend-render-canvas p_raf and spa-mount-input.
