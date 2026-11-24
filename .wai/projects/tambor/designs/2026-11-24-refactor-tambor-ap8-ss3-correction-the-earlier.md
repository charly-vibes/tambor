---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss3-by-key-state-path-navigator, pipeline-step:ro5u-review]
---

REFACTOR tambor-ap8 §3 (correction): the earlier '956/956 unchanged' claim in the previous design record was PREMATURE — the post-tidy full run failed the delivery gates (docs shell +13 B from the matchIndexAndCount split's function shapes); re-recorded 36937→36950 B (dated), rebuilt, stamped 467.9 kB; NOW verified: just test-full green (this run), gate 0 new, lint clean.
