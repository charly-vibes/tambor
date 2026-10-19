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

## The "7 principles" are synthesis — each now tied to a spec/doc line (was D; resolved 2026-10-19, I02)
Demo 1 lists seven "wanna principles" (`artifacts/wanna-on-tambor.html.txt:99`, rendered at :131-132). They are the assistant's synthesis, **not a quoted list** — but each is grounded in wanna's docs/specs (wanna repo @ `7c08427`):

| # | Principle | wanna citation |
|---|---|---|
| 1 | Every outcome is typed — five submit outcomes, five obligations | `docs/review-quickstart.md:131-135` (outcome table); `openspec/specs/composition-shell/spec.md:45-64` |
| 2 | Stale feedback is never silently retargeted; the draft survives | `docs/review-quickstart.md:132`; `openspec/specs/review-workbench/spec.md:15-22` (Stale feedback preserved); `openspec/specs/composition-shell/spec.md:61-64` |
| 3 | Duplicate delivery changes nothing | `docs/review-quickstart.md:133`; `openspec/specs/composition-shell/spec.md:142-151` (Shared storage commits; duplicate-after-restart scenario) |
| 4 | Unknown effect → reconcile, never retry | `docs/review-quickstart.md:135,150-160`; `openspec/specs/composition-shell/spec.md:163-170` (Uncertain commit reconciliation) |
| 5 | Retirement only by the explicit cancel command | `docs/review-quickstart.md:163-175`; `openspec/specs/composition-shell/spec.md:66-75` (Derived projections and explicit retirement), `:186-188` |
| 6 | Only committed operations are durable across restart | `docs/review-quickstart.md:177-186`; `openspec/specs/composition-shell/spec.md:172-184` (Review continuity), `:154-160` |
| 7 | The shell records outcomes; it authorizes nothing and publishes nothing | `docs/review-quickstart.md:15-21`; `openspec/specs/composition-shell/spec.md:186-188` |

## The demo's extra outcome names — mostly REAL typed kinds; one invented
Only the five submit outcomes in W1 come from the submit contract, but the demo's other labels are NOT all invented — each maps to a real typed outcome kind of another operation (wanna `docs/review-quickstart.md`):

- `committed` — `commitDecision`'s success kind (quickstart `:112-116`) — **O**
- `refreshed` — `refresh()`'s success kind (quickstart `:143-147`) — **O**
- `retired` — `cancel()`'s success kind (quickstart `:170-175`) — **O**
- `applied` / `not_applied` — `reconcile()`'s kinds (quickstart `:156-160`) — **O**
- `resumed` — **invented (D)**: no typed kind exists; opening a session returns `ready` (quickstart `:55-57`, `:187-192`). The demo's resume message is the assistant's wording.

The demo's message *wording* around these kinds is still the assistant's synthesis; only the kind names are contract-bound.
