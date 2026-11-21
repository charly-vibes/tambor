# RO5U Review — tambor-bva add-frame-coalescing execution (BvaReview agent)

Verdict: FIX-FIRST (converged, 0 measured FP suspicion). 0 Critical, 0 High, 2 Medium, 2 Low.

## Medium
- M1: clickDrawnText settles only BEFORE its click — post-patch the routed paint is frame-deferred, so spec-level raw reads (gallery.spec count(), risks.spec boundingBox) race the frame; widens the tambor-4h6 flake family to spec level. Fix: trailing settleFrames after the click.
- M2: spec delta pins a contract the implementation deliberately does not satisfy — requirement says "multiple dispatches" unqualified; implementation coalesces only the routed surface dispatch (wireSurface paint seam); app-handle dispatch redraws synchronously (pinned by spa-mount.test.ts:140) and the bench correction (naive bypass) records the same boundary. Fix: scope requirement to routed wire + add bypass scenario + design D3 coalesce:false → mode:"immediate".

## Low
- L1: unmount leaves a scheduled frame alive (derive+draw into detached tree). Fix: coalescer drop() (dead flag + pending=null) called from unmount.
- L2: no pin for the default coalesced mode on the 60Hz lane-stream path (every lane test opts out to immediate). Fix: one coalesced-mode lane test (N moves → drawCount unmoved → pump → exactly one draw with final offset).

## Verified sound
D1-D3 conformance; flush-vs-frame double-draw impossible; pending flag clears on throw paths; mode parse edges; empty-intent rule mirrors HEAD guard; deferred lane draws correct (viewCache identity); bench numbers match JSONs exactly (naive 10101.10/10455.86 n=36, frame 233.10/258.34 n=180, commit anchor, 1.64× = 383/233); runs asymmetry disclosed; proposal correction recorded; bench-stream untouched; accommodations timing-only; insert-text seam isolated (vitest per-file isolation).
