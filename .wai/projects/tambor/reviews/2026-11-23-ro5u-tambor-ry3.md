# RO5U Review — tambor-ry3 add-render-scheduler (Ry3Review agent)

Verdict: FIX-FIRST (converged stage 4). 0 Critical, 1 High, 4 Medium, 3 Low. Grounding/composition/pins/tasks verified clean against landed code.

## High
- H1: App.installScheduler seam ignores the second App producer — createLogoApp (src/examples/logo/logo.ts:166) hand-builds the App literal and the gallery mounts it; if the seam is required, logo stops compiling at task 1.1; if optional, the logo demo keeps the discarded bare re-derivations (its worker replies dispatch outside the wire — exactly the case the change fixes). FIX chosen: option (a) — required member + §2 task giving createLogoApp an absorbing authority; proposal affected-code list gains logo.ts.

## Medium
- M1: spec delta omits headless adoption (framework-send phase record closes via finishDraw) + no-rAF mounted authority — gate 5.2 would ship them unmapped. FIX: new requirement 'The headless wire schedules through one authority' + no-rAF absorption scenario.
- M2: 'in both modes' SHALL claims coalesced-only mechanics (pending slot) that don't exist in the absorbing authority. FIX: single-draw-path wording per reviewer.
- M3: pump runs ALL queued callbacks — 're-derivation runs once per pumped frame' unsatisfiable. FIX: 'each performs exactly one appView re-derivation when pumped' (view-fn spy count 3).
- M4: 'Flush and unmount determinism' conjoined. FIX: split into two requirements; scenarios partition cleanly.

## Low
- L1: task 2.3 permits comment-only touch-up of spa-mount-coalesce.test.ts:212-215 (absorption makes the old comment false).
- L2: task 2.4's red side degenerate on no-rAF hosts — pin installation shape + flush no-op + draw timing instead.
- L3: design.md:87 'after the route returns' → 'after the dispatch returns'.

## Verified clean
Grounding honesty (scheduleRepaint/frameCoalescer/wireRerender claims match code at e12a2f0); composition traced request/paint/paintNow with no double-draw/lost-request/undrained path; drop() covers request-dirtied frames; coalescing suite counts draws not rAF queue (stays green); corpus fidelity (single_repaint preserved as request; paints-never-commits restated).
