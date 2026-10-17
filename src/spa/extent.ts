// Purpose: keep the SPA drawn root's CSS height in sync with the drawn
// extent (tambor-8yn) — a fixed-height root lets grown demos' bottom
// rows draw outside it, over page content below #app.
// Responsibilities: per-draw extent measurement (host scrollHeight in
// real browsers; memoized corpus bounds as the jsdom fallback) and the
// root height update. Rationale: ground truth must be the layout box
// the page flows around, not a hardcoded stage height.

import type { DomBackend } from "../render/dom.ts";
import type { HostElement } from "../interop/domhost.ts";
import { bounds, type Elem } from "../views/model.ts";
import { VIEWPORT } from "./viewport.ts";

/**
 * Wrap backend.draw so the root's height tracks the drawn extent on
 * every draw. The root is the layout box the page flows around —
 * fixed at the viewport it lets grown demos' bottom rows draw
 * outside it. Ground truth is the host's own scrollHeight (the real
 * browser reports the positioned children's overflow area; jsdom
 * reports 0) with the corpus memoized extent (bounds,
 * container_bounds_max) as the jsdom fallback; a view that carries an
 * events-tier wrap node has no bounds entry there, and keeps the last
 * size rather than throwing (the wrap root's real height is already
 * covered by the scrollHeight path in browsers).
 */
export function wireExtentSizing(
  backend: DomBackend,
  rootHost: HostElement,
): void {
  let sizedHeight = -1;
  const extentHeight = (view: Elem): number => {
    const host = rootHost as unknown as { scrollHeight?: number };
    const sh = typeof host.scrollHeight === "number" ? host.scrollHeight : 0;
    if (sh > 0) return sh;
    try {
      return Math.max(VIEWPORT[1], Math.ceil(bounds(view)[1]));
    } catch {
      return sizedHeight < 0 ? VIEWPORT[1] : sizedHeight;
    }
  };
  const rawDraw = backend.draw.bind(backend);
  backend.draw = (view: Elem): void => {
    rawDraw(view);
    const h = extentHeight(view);
    if (h !== sizedHeight) {
      sizedHeight = h;
      rootHost.style.setProperty("height", `${h}px`);
    }
  };
}
