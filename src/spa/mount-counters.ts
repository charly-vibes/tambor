// Purpose: the opt-in §4.0 counters plumbing of the SPA mount
//   (add-runtime-invalidation task 4.0), extracted from mount.ts as a
//   mechanical split (zero behavior change).
// Responsibilities: mountCounters (the counters?: mount option's
//   enable/disable ownership — enabled only when the caller asks and no
//   external meter already owns the phase-timers seam; the returned
//   disposer disables exactly what this mount enabled) and attachCounts
//   (the snapshot's counts() accessor wiring).
// Rationale: the phase-timers seam is opt-in and single-owner: a mount
//   must never steal an external meter's enable, and its unmount must
//   release only its own. The debug snapshot exposes the counters as a
//   NON-enumerable read accessor so the pinned four-read snapshot
//   surface (demo/state/view/drawCount, no setter, no dispatch) is
//   unchanged.

import { phaseTimers } from "../events/phase-timers.ts";

// The §4.0 counters opt-in, mirroring the phase-timers seam: enabled
// only when the caller asks, and only when no external meter already
// owns the seam — the mount enables what it owns and the returned
// disposer disables exactly that.
export function mountCounters(opts?: { counters?: boolean }): () => void {
  const countersOwned = opts?.counters === true && !phaseTimers.enabled();
  if (countersOwned) phaseTimers.enable();
  // release the counters this mount enabled (never an external meter's
  // seam)
  return () => {
    if (countersOwned) phaseTimers.disable();
  };
}

// The counters accessor wiring for a debug snapshot: published as a
// NON-enumerable read so the snapshot's enumerable key set stays
// exactly the snapshot's own four reads.
export function attachCounts(
  target: {
    counts?(): {
      readonly derive: number;
      readonly rebuild: number;
      readonly draw: number;
    };
  },
): void {
  Object.defineProperty(target, "counts", {
    value: () => phaseTimers.counters(),
    enumerable: false,
    writable: false,
    configurable: false,
  });
}
