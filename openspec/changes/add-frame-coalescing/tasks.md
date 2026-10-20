# Tasks: add-frame-coalescing

## 1. Coalescing layer

- [ ] 1.0 Add the options object to `mountSpa`/`mountDemo` (they take
      none today) carrying the coalescing mode; existing call sites
      compile unchanged with the default on.
- [ ] 1.1 Red: unit test — two `mountSpa` dispatches inside one frame
      produce exactly one derive+draw (spy on the backend draw; pump
      the fake frame between dispatch and assertion), state applied in
      dispatch order.
- [ ] 1.2 Green: implement the coalescing dispatch wrapper in
      `src/spa/mount.ts` (apply-immediate, paint-once-per-frame).
- [ ] 1.3 Red→Green: opt-out test — `immediate` mode restores the
      current per-dispatch repaint behavior.
- [ ] 1.4 Red→Green: `flush()` test — a flush forces exactly one
      pending draw synchronously; no-rAF environments flush
      synchronously instead of never painting.
- [ ] 1.5 Update e2e helpers to flush or await visibility after
      dispatch (root cause shared with ticket tambor-4h6).

## 2. Integration

- [ ] 2.1 Wire the mode option through `src/spa/main.ts` plumbing;
      custom `dispatch` (AppOptions.dispatch) bypasses coalescing as
      before.
- [ ] 2.2 Re-run the BZ1 stream scenarios; record the naive wiring's
      number with the default on and append a follow-up note to the H2
      verdict in `benchmarks/findings-bz.md`.
- [ ] 2.3 Confirm the pinned state-equivalence contract
      (tests/bench-stream-dashboard.test.ts) stays green in both modes.

## 3. Verification

- [ ] 3.1 `just test` green; e2e bench-app smoke green in a real browser.
- [ ] 3.2 `ah check` spec-test correspondence green.
- [ ] 3.3 `openspec validate add-frame-coalescing --strict` before
      approval; archive applies the capability spec.
