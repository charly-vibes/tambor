---
tags: [pipeline-run:tdd-ro5u-2026-11-21-tambor-9qo-author-add-resource-scopes, pipeline-step:plan]
---

PLAN tambor-9qo: author complete openspec change add-resource-scopes. Behavior target: scoped effect lifetimes with deterministic disposal (onCleanup-style) layered on worker_effect client seam; async computation envelope {status,value,error} createResource-shape generalization. Out of scope: host-interop (tambor-8yl), signals/proxies, any production code edit. Red (author mode): record failing validation state on skeleton (openspec validate --strict). Green: proposal/design/specs delta/tasks authored to strict-valid; scenarios concrete; tasks red→green; bench B4 defined. Verification: openspec validate add-resource-scopes --strict exit 0; ah check --changes add-resource-scopes only expected proposal-stage findings. Files: openspec/changes/add-resource-scopes/{proposal,design,tasks}.md + specs delta. Commit: single docs(openspec) commit.
