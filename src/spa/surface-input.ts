// Purpose: the SPA surface-input wiring — every raw-DOM input seam that
//   hangs off the mounted surface element, split out of mount.ts
//   (tambor-8xm) so the mount file stays under the gate's size floor.
// Responsibilities: wheel forwarding (tambor-gov), input hardening
//   (tambor-hyw: handled keys preventDefault, pointer gestures get
//   capture/cancel and a synthetic mouse-up delivery, IME composition
//   inserts text) and the focus plumbing (tambor-e5n), composed by
//   wireSurfaceInput — the one call a mount makes.
// Rationale: openspec/specs/example-todo/spec.md and the shared mount
//   plumbing are unchanged — these seams live on the surface element,
//   not on the corpus wire; the split is code organization only.

import type { RealDomElement } from "../interop/domhost.ts";
import type { Vec2 } from "../views/model.ts";
import {
  clipboard,
  mouseUp,
  scroll,
  type TamborEvent,
} from "../events/event.ts";
import { MODIFIER_KEYS, normalizeKey } from "../render/input.ts";
import {
  registerSpaFocus,
  setFocusSurface,
} from "./focus.ts";

// Wheel forwarding (tambor-gov): backend-render's input_forwarded says
// raw wheel events are normalised and forwarded, but the backend
// attaches no wheel listener, so the SPA surface registers its own on
// the drawn root. The raw wheel becomes the corpus scroll event (the
// event-model kind the wheel rules run on), carrying the raw deltas on
// the event's delta field — the transport components-scrollview's
// header delegates to the integration — at the cursor position
// translated into view space the same way normalizeDOMEvent does it.
// preventDefault so the page itself does not scroll; the mount owns
// the delta, the wheel rules in the scrollview consume it.
function wireWheel(surface: RealDomElement, route: (ev: TamborEvent) => void): void {
  surface.host.addEventListener("wheel", (raw) => {
    const e = raw as {
      clientX?: number;
      clientY?: number;
      deltaX?: number;
      deltaY?: number;
      preventDefault(): void;
    };
    e.preventDefault();
    const r = surface.host.getBoundingClientRect();
    route(
      scroll(
        [(e.clientX ?? 0) - r.x, (e.clientY ?? 0) - r.y],
        { delta: [e.deltaX ?? 0, e.deltaY ?? 0] },
      ),
    );
  });
}

// The raw device position in view space — the surface-host bounding-rect
// origin removed, the same translation wheel forwarding uses.
function viewPos(surface: RealDomElement, e: { clientX?: number; clientY?: number }): Vec2 {
  const r = surface.host.getBoundingClientRect();
  return [(e.clientX ?? 0) - r.x, (e.clientY ?? 0) - r.y];
}

// Key guard (tambor-hyw): keys the app handles — every keydown that
// forwards a corpus event (arrows, space, backspace, printable keys,
// multi-char IME keys) and every modified combo — preventDefault so the
// page does not scroll and the browser does not eat the shortcut. A
// modifier key alone produces no corpus event and stays unprevented.
function wireKeyGuard(surface: RealDomElement): void {
  surface.host.addEventListener("keydown", (raw) => {
    const e = raw as {
      key?: unknown;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      preventDefault(): void;
    };
    const key = e.key;
    if (typeof key !== "string") return;
    const modified = e.ctrlKey === true || e.metaKey === true || e.altKey === true;
    const forwarded = normalizeKey(key) !== null
      || (key.length > 1 && !MODIFIER_KEYS.includes(key)
        && key !== "Unidentified" && key !== "Process" && key !== "Dead");
    if (forwarded || modified) e.preventDefault();
  });
}

// Pointer capture and cancel (tambor-hyw): a pointerdown captures the
// pointer when the host can (so a drag leaving the surface keeps its
// moves), and every way a gesture can die without a pointerup —
// pointercancel, or the pointer leaving the surface when capture is
// unavailable, or the capture being lost mid-drag — delivers the
// synthetic mouse-up so no component's down state sticks. The
// synthetic mouse-up goes through the backend's deliver — the same
// path every real forwarded event takes (subscribers + routing), not
// a side door.
function wirePointerCapture(surface: RealDomElement, deliver: (ev: TamborEvent) => void): void {
  const host = surface.host;
  let mdown = false;
  let lastPos: Vec2 = [0, 0];
  const release = (): void => {
    if (!mdown) return;
    mdown = false;
    deliver(mouseUp(lastPos));
  };
  host.addEventListener("pointerdown", (raw) => {
    const e = raw as { clientX?: number; clientY?: number; pointerId?: unknown };
    mdown = true;
    lastPos = viewPos(surface, e);
    try {
      if (typeof (host as { setPointerCapture?: unknown }).setPointerCapture === "function"
        && typeof e.pointerId === "number"
      ) {
        (host as unknown as { setPointerCapture(id: number): void }).setPointerCapture(e.pointerId);
      }
    } catch {
      // a capture failure must not break the pointer flow
    }
  });
  host.addEventListener("pointermove", (raw) => {
    lastPos = viewPos(surface, raw as { clientX?: number; clientY?: number });
  });
  host.addEventListener("pointerup", () => {
    mdown = false;
  });
  host.addEventListener("pointercancel", release);
  host.addEventListener("pointerleave", release);
  host.addEventListener("lostpointercapture", release);
}

// IME composition (tambor-hyw): the committed text arrives as a
// compositionend with the data string — route it as paste-like
// insertion (the clipboard shape the textarea rules speak), the same
// way the multi-char keydown path does.
function wireIme(surface: RealDomElement, deliver: (ev: TamborEvent) => void): void {
  surface.host.addEventListener("compositionend", (raw) => {
    const data = (raw as { data?: unknown }).data;
    if (typeof data === "string" && data.length > 0) deliver(clipboard(data));
  });
}

// Focus plumbing (tambor-e5n): register the corpus request-focus
// effect (textarea handlers emit it; without this the dispatcher drops
// it as unknown) and point it at this mount's surface — the registry
// is global, so the ref is per-mount and cleared on unmount; the
// surface capability is DOM focus, carried by the host element.
function wireFocus(surface: RealDomElement): void {
  registerSpaFocus();
  setFocusSurface({ focus: () => surface.host.focus?.() });
}

// Surface wiring: every raw-DOM seam hangs off the surface element —
// wheel forwarding (tambor-gov), input hardening (tambor-hyw: handled
// keys preventDefault, pointer gestures get capture/cancel and mouse-up
// delivery, IME composition inserts text) and the focus plumbing
// (tambor-e5n).
export function wireSurfaceInput(
  surface: RealDomElement,
  route: (ev: TamborEvent) => void,
  backend: { deliver(event: TamborEvent): void },
): void {
  wireWheel(surface, route);
  wireKeyGuard(surface);
  wirePointerCapture(surface, backend.deliver.bind(backend));
  wireIme(surface, backend.deliver.bind(backend));
  wireFocus(surface);
}
