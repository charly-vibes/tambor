# Findings — click-wire floor (tambor-8xm)

App: the mount wire itself (`src/spa/mount.ts::wireSurface`) — shared
by every gallery demo; no new scenario registered (this is the wire
the whole programme rides on). Results `benchmarks/results/*.json`
(commits below are paired runs on one machine, working tree vs HEAD
`979e32d`; the pinned commit label in the JSON is HEAD for both — the
worktree fix was stashed/unstashed for the pairing).

## The bound

The wire used to re-derive and re-draw unconditionally after **every**
routed event, so a no-op click (empty intent list) paid two whole-tree
derivations plus a full draw — the whole-tree costs scale with app
state, hence the sideband flag (wave 2): no-op clicks 18–27 ms on an
empty sheet vs ~250 ms on the seeded 100k-cell sheet.

The bound is corpus-shaped, two levers, mount plumbing only (no app
semantics change):

1. **No-op skip** — empty intents changed nothing (`event_pure`; the
   same `empty_batch_noop` shape the headless wire pins in
   `src/app/app.ts`): skip the post-route derivation and the draw.
2. **Route-time view cache** — the drawn tree is reused while the
   state is unchanged; `app.getState()` identity is the invalidation
   signal (state changes only through dispatch), so consecutive events
   with no state change route against the drawn tree with **zero**
   derivations. A state-changing event still derives exactly once
   (post-apply) and draws exactly once — the pre-change derivation is
   now a cache hit instead of a second derivation.

Phase-timer attribution shape is preserved: the derive span still
opens/closes per route (a cache hit records a ~zero span); the mount's
initial draw and the first route now share one derivation via the
primed cache (`Wire.viewFor`).

## Measured (paired, same machine state, CPU ×4 throttled, n=180)

| scenario | before (HEAD) | after (fix) | delta |
|---|---|---|---|
| keyed-table-ops (median ms/op) | 515.19 | **232.52** | −55% |
| bz7-edit-graph (median ms/op) | 2 216.83 | **1 099.57** | −50% |
| todo-add harness floor (median ms/op) | 83.69 / 99.33 | 66.29 / 66.46 | −20–33% |

(Absolute levels ride the machine load, 3–5.7 across the pairings;
each row is a same-state before/after pair, and the after-run of the
first pair executed at the *higher* load — the ordering is not a load
artifact. The recorded programme medians — keyed-table 33 ms,
bz7-edit-graph 1 401 ms — were taken on an idle machine; do not
compare across machine states, only within a pair.)

Unthrottled in-page no-op probe (100 synthetic pointerdown/up pairs at
a blank spot, synchronous `performance.now` around the dispatch;
control verified a synthetic click applies state through the wire):

| state | before p50 | after p50 |
|---|---|---|
| spreadsheet, empty | 179.4 ms | **0.1 ms** |
| spreadsheet, seeded 100k formulas | 176.9 ms | **0.1 ms** |
| keyed-table | 0.4 ms | **~0 ms** |

The floor no longer scales with app state at all — the no-op wire cost
is now the router walk over the drawn tree (~0.1 ms), independent of
the logical model size.

## Verdict

**Wire floor bound — ADOPTED.** The route-time view cache + no-op skip
is the programme-level lever the waves kept flagging: the ~300 ms
click-wire/derive floor that "dominates app-level choices at both
scales" (BZ3/BZ4 verdicts) drops by the whole-tree derivation term.
Re-percussions:

- Older scenario medians (B1–B8, BZ1–B7) were measured on the
  unbounded wire — re-pinned values in future runs will read lower;
  the paired deltas above are the bridge. Measurement semantics
  unchanged (same harness, same replay, same settle).
- tambor-54j.8 (perf kit) context: the cache is a mount-level seam;
  component-level memo boundaries (the 5 µs cache-hit finding) remain
  the kit's own lever.
- 54j.10 spatial index trigger stands: the router walk is what
  remains in the no-op floor (~0.1 ms at the current scales) — revisit
  only if the walk itself becomes measurable.

## Follow-ups

- Screenshot goldens rewritten by every gallery/risks spec run showed
  a byte-diff vs HEAD on this machine **with and without the fix**
  (verified by paired captures) — environmental rendering drift (nav
  metrics), not this change. Goldens restored to HEAD; regenerate and
  commit deliberately when reviewing the HITL artifact.
