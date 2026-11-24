---
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-90p-execute-add-gallery-inspector, pipeline-step:green]
---

GREEN §2: src/spa/inspector.ts wireGalleryInspector — App.subscribe listener appends commits to boundedSeries(50), renders data-pane=state (jsonSafe live read per commit) + data-pane=log (data-entry/data-sequence + data-field intents/change); function/bigint/symbol marked f(); unmount unsubscribes + empties panel; subscribe-optional apps degrade to live pane. Test fixes before run: unmount expectation 0 entries (full detach), getAttribute via structural cast.
