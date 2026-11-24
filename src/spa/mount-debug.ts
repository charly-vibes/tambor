// Purpose: the opt-in debug snapshot seam of the SPA mount
//   (add-spa-test-seams), extracted from mount.ts as a mechanical split
//   (zero behavior change).
// Responsibilities: DebugSnapshot (the read-only globalThis.__tambor
//   handle's type) and wireDebugSnapshot (publishing the handle AFTER
//   the initial draw and returning the cleanup that clears it).
// Rationale: read-only-by-API, not a deep-frozen snapshot or a
//   clone/projection. The handle holds function references and
//   allocates nothing on read: state() returns app.getState() (the
//   spec's "equals the app state" is identity, and a copy could never
//   satisfy it), view() returns the RAW app.view() derivation (never
//   the wire's cached or lane-wrapped tree, which is a draw detail),
//   and there is no setter and no dispatch on the handle. A
//   clone/projection would allocate a whole state/view tree per read
//   and put a stale copy between extractors and the app; deep-freezing
//   the live objects would mutate app-owned state (frozen state breaks
//   any app that writes through its own boxes) and still would not pin
//   identity. Isolation is enforced at the API surface, and the tests
//   pin it: a fixed key set with no write path.
//   drawCount reads DomBackend.drawCount, which draw() increments — the
//   single draw path every actual draw goes through (the mount's
//   initial draw, wireDrawTail's state and lane draws, async
//   re-renders, resizes). A forwarded event that yields no intents
//   draws nothing, so the count does not move; debug on/off changes no
//   drawn output. The handle is published only AFTER the initial draw:
//   a reader that sees it sees a demo that is actually drawn. Without
//   the flag no handle is ever created and no cleanup is returned — a
//   stale global from another page belongs to nobody here and is left
//   alone; the cleanup only clears the handle THIS mount published,
//   and only while it is still the mounted one.

import { type Elem } from "../views/model.ts";
import { type App } from "../effects/dispatch.ts";
import { type DomBackend } from "../render/dom.ts";
import { attachCounts } from "./mount-counters.ts";

// The read-only debug snapshot (add-spa-test-seams): live accessors on
// the mounted app, never copies.
export interface DebugSnapshot {
  /** The gallery demo id actually mounted ("" when unknown). */
  readonly demo: string;
  /** The live app state (identity, not a copy). */
  state(): unknown;
  /** The raw app view derivation, not the cached/lane-wrapped tree. */
  view(): Elem;
  /** Every actual backend draw since this mount was created. */
  drawCount(): number;
  /**
   * The opt-in §4.0 counters (derive/rebuild/draw since this mount
   * enabled them), read from the phase-timers seam. Zeros while the
   * counters are off. Published as a NON-enumerable read accessor so
   * the pinned four-read snapshot surface (demo/state/view/drawCount,
   * no setter, no dispatch) is unchanged.
   */
  counts?(): { readonly derive: number; readonly rebuild: number; readonly draw: number };
}

// The host global, reached structurally (tsconfig carries no DOM lib).
interface DebugGlobal {
  __tambor?: DebugSnapshot;
}

export function wireDebugSnapshot(
  app: App,
  backend: DomBackend,
  opts: { debug?: boolean; demo?: string } | undefined,
): (() => void) | undefined {
  if (opts === undefined || opts.debug !== true) return undefined;
  const host = globalThis as DebugGlobal;
  const snapshot: DebugSnapshot = {
    demo: opts.demo ?? "",
    state: () => app.getState(),
    view: () => app.view(),
    drawCount: () => backend.drawCount,
  };
  // The §4.0 counters accessor rides along as a NON-enumerable read:
  // the pinned snapshot surface (exact enumerable key set, no setter,
  // no dispatch) stays exactly four reads.
  attachCounts(snapshot);
  host.__tambor = snapshot;
  return () => {
    if (host.__tambor === snapshot) delete host.__tambor;
  };
}
