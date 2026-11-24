---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-ss3-by-key-state-path-navigator, pipeline-step:orient]
---

ORIENT tambor-ap8 §3 cycle: by-key state-path navigator. AC restated: [by-key, field, value] addresses the unique sequence element whose field Object.is-matches the value; select continues into it; update/set write through it preserving position/shape/structural sharing; delete splices it; exactly-one LOUD (keyed-not-found on absent/non-sequence — never silent empty select; keyed-ambiguous on duplicates) in select and write alike. Spec delta: state-paths ADDED requirement authored ✓. Vehicle: paths-core vocabulary + paths-walk-navigators handler + NAV_HANDLERS; tests/state-paths-keyed.test.ts (state-paths.test.ts near 400-line gate).
