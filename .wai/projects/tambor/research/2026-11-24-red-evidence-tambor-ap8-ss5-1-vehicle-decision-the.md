---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss5-1-keyed-b2-re-run-focus-verification, pipeline-step:red]
---

RED/EVIDENCE tambor-ap8 §5.1 vehicle decision: the corpus has NO real text-input node (textarea is canvas-drawn, components/textarea; the DOM backend emits real <button> only as focusable elements) — literal selectionStart preservation cannot exist without a host-input painter, which is new corpus surface OUT of this change's scope (spec pin: 'no focus API ships'). The honest real-browser proof of the OUTCOME (focus preservation from element identity): a keyed-focus-list gallery demo whose ROWS are keyed real <button>s; playwright spec focuses a mid-list row's button, clicks Insert first, asserts document.activeElement keeps its DOM identity and position. Text-selection caveat documented in findings-b2.md; a host-input painter is ticket-worthy follow-up if the user wants literal selection.
