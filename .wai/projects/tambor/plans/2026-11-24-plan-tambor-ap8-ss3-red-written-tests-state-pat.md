---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss3-by-key-state-path-navigator, pipeline-step:plan]
---

PLAN tambor-ap8 §3: RED (written): tests/state-paths-keyed.test.ts 9 tests — select through by-key, keyed-not-found (absent/non-sequence, field+value in message), keyed-ambiguous (select+update+set+delete), insert-stability with structural sharing, setPath position+untouched keys, delete splice, removed-id loud failure, Object.is 0/-0. GREEN: paths-core NAVIGATORS += by-key; stepByKey handler in paths-walk-navigators.ts (count matches, exactly-one loud, walk into matched element, write-back clones array with matched slot replaced / spliced on DELETED / identity short-circuit when child === cur), NAV_HANDLERS row; paths.ts untouched (thin). NARROW: npx vitest run tests/state-paths-keyed.test.ts tests/state-paths.test.ts; FULL: just test-full. FILES: src/effects/{paths-core,paths-walk-navigators}.ts, tests/state-paths-keyed.test.ts. COMMIT: §3 feature commit.
