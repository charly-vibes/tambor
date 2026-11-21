---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-9qo-author-add-resource-scopes, pipeline-step:orient]
---

ORIENT tambor-9qo: P2 design/complexity:m, unclaimed, no blockers; BLOCKS tambor-8yl. files: openspec/changes/add-resource-scopes, src/components/worker_effect; base 54de0bf. Author-only ticket. Acceptance restated: openspec validate add-resource-scopes --strict exit 0; design.md records ownership/disposal model + async envelope decision; tasks.md red→green shaped; bench B4 defined per runtime-roadmap-2026-11.md; review gate before any execution ticket opens. Groundwork verified per ticket: worker_effect client respawns lazily post-terminate, drops id-less replies (client.ts:70-78) — seam is additive.
