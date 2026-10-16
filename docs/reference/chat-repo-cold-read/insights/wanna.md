# wanna — insights

| # | Insight | Grade | Source |
|---|---|---|---|
| W1 | Review-session submit returns one of five typed outcomes: `recorded`, `duplicate`, `stale`, `unavailable`, `unknown_effect`. Each implies a consumer obligation. | O | `docs/review-quickstart.md` |
| W2 | The shell is headless: no DOM, no authorization concerns. It *records* outcomes; it does not authorize or publish. | O | README |
| W3 | Stale feedback is never silently retargeted; the draft is preserved and a fresh review is started explicitly. | O | quickstart |
| W4 | `unknown_effect` blocks further mutations until reconciled; reconcile asks the store whether the op id applied. | O | quickstart |
| W5 | Cancel is an explicit command; nothing is retired implicitly. | O | quickstart |
| W6 | Restart restores only committed operations. | O | quickstart |
| W7 | `docs/reuse-comparison.md` records the reuse decision as **"narrow"** and says distribution (ticket `wanna-zbn`) may not proceed on the current LOC evidence. | O | reuse-comparison |
| W8 | Candidate publishable pieces: `composition-shell`, `review-indexeddb`. Source aliases `@wanna/*`. Compatibility record 0.1 → 0.3 is additive. | O (read earlier in the session; not re-checked when writing this repo) | README/specs |
| W9 | wanna is spec-driven (an `openspec/specs` tree with ~30 capabilities) and uses an agent-oriented layout (`.espectacular`, `.whisper`, `.beads`). | O | tree listing |

## The "7 principles" are synthesis (D)
Demo 1 lists seven "wanna principles": typed outcomes · stale not retargeted · idempotent duplicates · unknown→reconcile · explicit retirement · durability only for committed ops · records-not-authorizes. These were distilled by the assistant from W1–W6 and the README. **They are not a quoted list.** Treat as D until each is tied to a spec line (improvement I02).

## The demo's extra outcome names are illustrative (D)
Only the five submit outcomes in W1 come from the docs. Names like `committed`, `refreshed`, `retired`, `resumed`, `applied`, `not_applied` in demo 1 are the assistant's labels for other operations.
