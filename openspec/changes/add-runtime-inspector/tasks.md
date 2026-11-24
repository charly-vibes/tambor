# Tasks: add-runtime-inspector

## 1. Inspector core + opt-in lifecycle

- [ ] 1.0 Red: tests/runtime-inspector.test.ts — `createInspector({
      app })` constructed and never enabled: the app's subscribe spy is
      never called, the rAF stub's queue stays empty,
      `phaseTimers.counters()` reads the disabled zeros, and both
      drains return empty.
- [ ] 1.1 Green: implement `src/inspect/inspector.ts` — the
      `RuntimeInspector` handle (`enable`/`disable`/`enabled`,
      `drainCommits`/`drainFrames`/`counters`) over options
      `{ app, retention?, commitLimit?, frameLimit? }`; export from
      `src/index.ts` only (`src/core.ts` re-exports nothing new).
- [ ] 1.2 Red→Green: `enable()` subscribes via the landed
      `App.subscribe` and starts recording; `disable()` triggers the
      app's unsubscribe (spy invoked), clears both rings, and a
      subsequent dispatch records nothing; re-enable resumes with
      empty rings while the app's commit sequence continues
      increasing (nothing on the app is reset).
- [ ] 1.3 Red→Green: timer-state restoration — enable over
      already-enabled phase timers then disable leaves them enabled
      for their prior owner; enable-over-disabled then disable leaves
      them disabled.

## 2. Commit records

- [ ] 2.0 Red: 80 state-effect dispatches while enabled → 80 frozen
      plain-data commit records with sequences matching the app's
      1..80 and clock stamps; a custom unannotated handler effect
      records `kind: "unknown"` with its reason.
- [ ] 2.1 Green: implement commit recording — bounded ring (512,
      overwrite-oldest, named constant), freeze on drain; the
      recording listener performs no dispatch and cannot throw.
- [ ] 2.2 Red→Green: retention default `"changes"` exposes no
      `previousState`/`state` fields; `retention: "states"` exposes
      both references; ring pressure — 600 dispatches leave the last
      512 in sequence order with the delivery pass unbroken.

## 3. Frame ledger

- [ ] 3.0 Red: fake-frame pump (stubFrames/pump) — 80 routed
      dispatches inside one frame under the coalesced mount → exactly
      one ledger record carrying all 80 commit records, draw delta 1,
      classified `drew` (the trailing close keeps the frame's draw in
      its own record, not the next one's).
- [ ] 3.1 Green: implement the ledger — rAF anchor plus trailing
      macrotask close; counter deltas across the inspector's own
      consecutive snapshots; idle frames record nothing; the phase
      timers' timing records drain into the closing slice
      (single-meter ownership).
- [ ] 3.2 Red→Green: skip classification — a dispatch changing only an
      undrawn memo-stable slice yields a `skipped` record (derive ≥ 1,
      rebuild 0, draw 0); a no-rAF host records commits only and never
      a ledger record; the frame ring holds at most 128 records under
      sustained frames.

## 4. Non-interference

- [ ] 4.0 Red→Green: spy backend (drawCount vs rebuildCount pattern) —
      the same scripted dispatch set with the inspector enabled versus
      absent produces identical draw and rebuild counts, and a
      dispatch-counting spy confirms the recording listener never
      dispatches.
- [ ] 4.1 Red→Green: the pinned stream-dashboard state-equivalence
      contract (tests/bench-stream-dashboard.test.ts) stays green with
      the inspector attached and enabled; ring overflow during a burst
      completes the dispatch and surfaces no delivery error.

## 5. First-consumer evaluation + gates

- [ ] 5.0 Keep design.md's tambor-90p evaluation current at execution
      (transition/render/attribution panels, the retention flag, the
      demo-switch lifecycle, and the stated gap: request-level
      authority verdicts are outcome-derived only — any gap found
      while wiring the real consumer is a scheduler-capability or 90p
      follow-up, never a silent inspector API change).
- [ ] 5.1 Gates: full suite green (`just test-full`); `ah check
      --run-tests` green; `openspec validate add-runtime-inspector
      --strict` exits 0.
- [ ] 5.2 On approval: delta deployed to
      `openspec/specs/app-runtime-inspector/` per the corpus
      authored-directly convention; the priority scenarios' contract
      TOMLs authored via `ah scenario new`, bound via
      [[tests.vitest]] --testNamePattern to the landed
      tests/runtime-inspector.test.ts titles; remaining no-toml
      findings tracked per repo precedent (expected at proposal
      stage, as add-frame-coalescing carries the same class).
