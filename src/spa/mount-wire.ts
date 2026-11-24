// Purpose: the SPA mount's wire machinery (tambor-e2y), extracted from
//   mount.ts as a mechanical split (zero behavior change).
// Responsibilities: the frame coalescer (add-frame-coalescing D2), the
//   route-time view cache (tambor-8xm) with the drawn-scheme record,
//   the lane transform/overlay draws (interaction-lane), the event wire
//   (route → dispatch → draw tail, the routeClick shape), the async
//   re-render wrapper (tambor-a45) and the input surface attach
//   (tambor-huu).
// Rationale: the routed draw tail's paint policy is the frame coalescer
//   (mountSpa boundary): state applies synchronously in dispatch order,
//   the derive+draw paints at most once per animation frame by default
//   ("coalesced"), flush() drains a pending draw synchronously,
//   "immediate" and hosts without requestAnimationFrame restore the
//   per-dispatch synchronous draw. Runtime-invalidation
//   (add-runtime-invalidation §3): the mount subscribes to keep the
//   last commit and hands every wire draw the frame's render hint
//   (ChangeSet, overlay, lane, scheme) so the backend's draw()
//   short-circuits on an identity-equal view. One forwarded event = one
//   corpus wire round trip; the surface's own wheel listener
//   (tambor-gov) feeds the same route.

import { type Elem, type Vec2, translate } from "../views/model.ts";
import { RealDomElement } from "../interop/domhost.ts";
import { type App, type ChangeSet, type DispatchCommit, type Effect, type LaneStore } from "../effects/dispatch.ts";
import { type DomBackend } from "../render/dom.ts";
import { dispatch } from "../events/dispatch.ts";
import { phaseTimers } from "../events/phase-timers.ts";
import { type TamborEvent } from "../events/event.ts";
import { ambientScheme } from "../ui/ambient-theme.ts";
import type { Scheme } from "../ui/theme.ts";
import { VIEWPORT } from "./viewport.ts";

// The scheme the last DERIVED tree resolved with (recorded by the
// route-time view cache at derive time, not at paint time): the
// shell's boot-scheme watcher compares the host's live answer against
// this, because the query answer WOBBLES during early page init and a
// boot-vs-now comparison never converges.
let drawnScheme: Scheme | null = null;

// True when the host's live answer equals the scheme of the last
// derived tree.
export function drawnSchemeIs(scheme: Scheme): boolean {
  return drawnScheme !== null && drawnScheme === scheme;
}

// The coalescer contract (add-frame-coalescing D2): paint defers a
// draw to once per frame, flush drains a pending draw synchronously,
// drop kills the coalescer (unmount seam).
export interface Coalescer {
  paint(draw: () => void): void;
  flush(): void;
  drop(): void;
}

// The frame-coalescing painter (add-frame-coalescing D2): the coalescer
// owns the single scheduling call per frame — repeated paints inside one
// frame keep only the latest draw closure, the frame callback paints
// exactly once, and flush() drains a pending draw synchronously (the
// frame callback sees the cleared pending flag and no-ops, so a flush
// and its own rAF never double-draw). "immediate" mode and hosts
// without requestAnimationFrame skip the coalescer entirely: the draw
// tail runs synchronously per dispatch (the no-rAF path must never add
// a never-flush state, D2).
export function frameCoalescer(frame: (cb: () => void) => unknown): Coalescer {
  let pending: (() => void) | null = null;
  let scheduled = false;
  let dead = false;
  return {
    paint(draw: () => void): void {
      if (dead) return;
      pending = draw;
      if (scheduled) return;
      scheduled = true;
      frame(() => {
        scheduled = false;
        if (dead) return;
        if (pending !== null) {
          const drawNow = pending;
          pending = null;
          drawNow();
        }
      });
    },
    flush(): void {
      if (pending === null) return;
      const draw = pending;
      pending = null;
      draw();
    },
    // Kills the coalescer (unmount seam): the pending draw is discarded
    // and any already-scheduled frame callback no-ops — a post-unmount
    // frame must not re-derive and draw into the detached tree.
    drop(): void {
      dead = true;
      pending = null;
    },
  };
}

// The lane transform (tambor-54j.3 Phase 2): the wire draws every tree
// — cached or freshly derived — under the lane's pan/scroll offset as
// a translate wrapper (BZ2 pan-as-transform promoted to a seam). The
// lane keys are "pan" and "scroll", each a Vec2 ([x, y]) or {x, y};
// absent or non-conforming entries contribute zero. At identity the
// tree is returned unwrapped so apps that never touch the lane draw
// exactly as before.
function laneTransform(lane: LaneStore): Vec2 {
  let x = 0;
  let y = 0;
  for (const key of ["pan", "scroll"]) {
    const v: unknown = lane[key];
    if (Array.isArray(v)) {
      const a = v as unknown[];
      if (typeof a[0] === "number") x += a[0];
      if (typeof a[1] === "number") y += a[1];
    } else if (v !== null && typeof v === "object" && "x" in v) {
      const o = v as { x?: unknown; y?: unknown };
      x += typeof o.x === "number" ? o.x : 0;
      y += typeof o.y === "number" ? o.y : 0;
    }
  }
  return [x, y];
}

// The route-time view cache: state + container size + ambient scheme
// key the derived tree. The scheme belongs in the key because the
// theme resolves at render time — a flip without a state change would
// otherwise serve the pre-flip view forever. ambientScheme() also
// OBSERVES the flip (clearing the component render cache) before the
// derive, so the rebuild sees the new ink; a session whose scheme never
// changes compares an equal string and keeps its cached view.
// `onMiss` reports an ACTUAL re-derivation (add-runtime-invalidation
// §4.0 counter semantics): the §4.0 derive count moves only here — a
// cache-hit viewFor() call counts nothing, so the routed path counts a
// derive once per event instead of twice.
function viewCache(app: App, size: () => unknown, onMiss?: () => void): () => Elem {
  let cache: {
    state: unknown;
    size: unknown;
    scheme: Scheme;
    view: Elem;
  } | null = null;
  return () => {
    const state = app.getState();
    const box = size();
    const scheme = ambientScheme();
    drawnScheme = scheme;
    if (
      cache !== null &&
      cache.state === state &&
      cache.size === box &&
      cache.scheme === scheme
    )
      return cache.view;
    const view = app.view();
    cache = { state, size: box, scheme, view };
    onMiss?.();
    return view;
  };
}

// The drag overlay (interaction-lane lane_overlay_drawn, Phase 4): a
// lane entry may carry an overlay renderer `(entry) => Elem` — the
// dragged shape re-drawn from the lane position. The first such entry
// in key order is rendered ON TOP of the tree (appended after it in
// draw order); the renderer is called with its lane entry at draw
// time. Draw-only: routing semantics are untouched (the pointer
// stream hits the tree's own handlers). Single-drag scope v1.
function laneOverlay(app: App): Elem | null {
  const lane = app.getLane() as Record<string, unknown>;
  for (const key of Object.keys(lane)) {
    const v = lane[key];
    if (v !== null && typeof v === "object") {
      const overlay = (v as { overlay?: unknown }).overlay;
      if (typeof overlay === "function") {
        return (overlay as (entry: unknown) => Elem)(v);
      }
    }
  }
  return null;
}

// Every wire draw goes through here: the tree under the lane wrap,
// with the drag overlay appended on top while a drag entry carries a
// renderer (lane-only draw, state re-derive and async re-render
// alike — lane wins on position, state wins on structure).
// The lane transform wrapper (interaction-lane): every draw — cached
// or freshly derived — carries the lane's pan/scroll offset, so the
// scheme the last draw resolved is recorded right after it (main.ts's
// boot-scheme watcher compares the host's live answer against this).
// Runtime-invalidation (add-runtime-invalidation §3): each wire draw
// hands the backend the frame's render hint — the frame's ChangeSet,
// overlay presence, lane offset and ambient scheme — so draw() can
// short-circuit the rebuild on an identity-equal view (task 3.3: the
// wire paths consume the SAME identity checks; the skip itself is the
// backend's no-op draw).
function drawWire(
  backend: DomBackend,
  app: App,
  wrap: (tree: Elem) => Elem,
  tree: Elem,
  changes: ChangeSet,
): void {
  const overlay = laneOverlay(app);
  const lane = laneTransform(app.getLane());
  backend.frameHint = {
    changes,
    overlayNull: overlay === null,
    lane,
    scheme: ambientScheme(),
  };
  backend.draw(overlay === null ? wrap(tree) : wrap([tree, overlay]));
}

// The lane transform wrapper (interaction-lane): every draw — cached
// or freshly derived — carries the lane's pan/scroll offset, so the
// lane wins on position while state wins on structure; at identity
// the tree passes through unwrapped. Shared by the wire route's lane
// draw, the state draw and the rerender path.
function laneWrap(app: App): (tree: Elem) => Elem {
  return (tree) => {
    const [x, y] = laneTransform(app.getLane());
    return x === 0 && y === 0 ? tree : translate(x, y, tree);
  };
}

// The wire's draw tail — what a routed batch costs after its intents
// are applied. Empty intents changed nothing (event_pure — the same
// empty_batch_noop shape the headless wire pins): no re-derivation, no
// draw. A lane-only batch (interaction-lane lane_draw_no_derive): the
// state identity is unchanged, so the cached tree is still valid —
// draw it under the lane transform (usually the 60 Hz pan delta) with
// NO re-derivation. Any state effect: one derivation + one draw.
function wireDrawTail(
  backend: DomBackend,
  app: App,
  viewFor: () => Elem,
  wrap: (tree: Elem) => Elem,
  intents: readonly Effect[],
  changes: () => ChangeSet,
): void {
  if (intents.length === 0) return;
  if (intents.every((effect) => effect[0] === "lane")) {
    drawWire(backend, app, wrap, viewFor(), changes());
    return;
  }
  // the derive span still opens/closes here; the §4.0 derive COUNT is
  // owned by the viewCache miss seam (one count per actual
  // re-derivation, hits included for free)
  phaseTimers.startSpan("derive");
  const drawn = viewFor();
  phaseTimers.endSpan();
  drawWire(backend, app, wrap, drawn, changes());
}

// The re-render wrapper (tambor-a45): async applies route through the
// demo's own dispatch OUTSIDE the event wire, so every non-routed
// dispatch re-draws from the cached view; the route's own draw stays
// single (setRouted(true) around the routed apply). A lane-only async
// dispatch draws the cached tree under the transform too: no repaint
// was scheduled, and the state identity makes viewFor a cache hit —
// no re-derivation (lane_draw_no_derive).
function wireRerender(
  backend: DomBackend,
  app: App,
  viewFor: () => Elem,
  changes: () => ChangeSet,
): { setRouted(routed: boolean): void } {
  const wrap = laneWrap(app);
  let routed = false;
  const rawDispatch = app.dispatch;
  app.dispatch = (batch, ...rest: unknown[]): undefined => {
    const applied = rawDispatch(batch, ...rest);
    if (!routed) {
      // The rerender derives (usually a cache hit) outside the routed
      // wire, so it opens its own derive span; the §4.0 derive counter
      // moves only on a viewCache miss — no-ops while the seam is off.
      phaseTimers.startSpan("derive");
      const tree = viewFor();
      phaseTimers.endSpan();
      drawWire(backend, app, wrap, tree, changes());
    }
    return applied;
  };
  return { setRouted: (routedNow: boolean) => void (routed = routedNow) };
}

// One forwarded event = one corpus wire round trip, the routeClick
// shape: route through the event router, hand the intents to the
// registry-aware dispatcher, re-draw from the app view. Returns the
// wire so the surface's own wheel listener (tambor-gov) can feed the
// same route.
interface Wire {
  route(ev: TamborEvent): void;
  viewFor(): Elem;
}

// The routed event's closure (see wireSurface): routing, intent
// application and the paint policy. The default painter runs the draw
// tail synchronously per routed event ("immediate", today's behavior);
// the coalesced mount hands in a painter that defers the tail to once
// per animation frame. Empty intents never paint (event_pure) in
// either mode.
function wireRoute(
  backend: DomBackend,
  app: App,
  viewFor: () => Elem,
  wrap: (tree: Elem) => Elem,
  rerender: { setRouted(routed: boolean): void },
  changes: () => ChangeSet,
  paint: ((draw: () => void) => void) | undefined,
): (ev: TamborEvent) => void {
  return (ev: TamborEvent): void => {
    phaseTimers.begin(ev.type);
    // the derive span still opens/closes per route (a cache hit records
    // a ~zero span); the §4.0 count moved to the viewCache miss seam
    phaseTimers.startSpan("derive");
    const view = viewFor();
    phaseTimers.endSpan();
    phaseTimers.startSpan("handler");
    const intents = dispatch(view, ev);
    rerender.setRouted(true);
    try {
      if (intents.length > 0) app.dispatch(intents);
    } finally {
      rerender.setRouted(false);
    }
    phaseTimers.endSpan();
    if (intents.length === 0) return;
    (paint ?? ((draw: () => void) => draw()))(() =>
      wireDrawTail(backend, app, viewFor, wrap, intents, changes),
    );
  };
}

export function wireSurface(
  backend: DomBackend,
  app: App,
  paint?: (draw: () => void) => void,
): Wire {
  // Phase-timer seams (tambor-54j.1, opt-in): derive is accumulated
  // over the view derivations of the wire (a cache hit records a ~zero
  // span), handler is the routing plus the intent application, and the
  // dom draw attributes reconcile_layout and closes the record. All
  // seam calls are no-ops while the timers are off.
  // one derive count per ACTUAL re-derivation: the counter rides the
  // viewCache miss seam, so the routed path (route viewFor + draw tail
  // viewFor) counts a derive once per event, never twice
  const viewFor = viewCache(app, () => backend.containerSize, () =>
    phaseTimers.count("derive"),
  );
  const wrap = laneWrap(app);
  // Runtime-invalidation (add-runtime-invalidation §3): the mount
  // subscribes at attach time and keeps only the LAST commit (the
  // dispatcher's own retention shape — no commit history), so every
  // wire draw can hand draw() the frame's ChangeSet. Additive: a
  // listener changes no dispatch/repaint semantics (§2).
  let lastCommit: DispatchCommit | null = null;
  // subscribe is OPTIONAL on App (add-runtime-invalidation M2):
  // structural implementers — the ops-app seams — publish no commits
  // and omit the member. Without it the last-commit hint stays null and
  // every wire draw carries the conservative unknown.
  app.subscribe?.((commit) => {
    lastCommit = commit;
  });
  // No commit yet (the draws before the first dispatch) is the
  // conservative unknown: those draws never skip, never splice.
  const changes = (): ChangeSet =>
    lastCommit?.changes ?? { kind: "unknown", reason: "no commit yet" };
  const rerender = wireRerender(backend, app, viewFor, changes);
  const route = wireRoute(backend, app, viewFor, wrap, rerender, changes, paint);
  backend.subscribe(route);
  return { route, viewFor };
}

// The input surface IS the drawn root (tambor-huu): pointer events on
// the real <button>/<span> children bubble to it, and the origin is
// the root's own bounding rect, so normalizeDOMEvent's view-space
// translation lands the hit exactly where the tree was laid out. The
// root is focusable (tabindex) for keyboard/paste, sized to the
// viewport so it actually occupies layout, and touch-action:none so
// touch input feeds the corpus instead of scrolling the page.
export function attachInputSurface(backend: DomBackend, root: RealDomElement): RealDomElement {
  root.host.setAttribute("tabindex", "0");
  root.host.style.setProperty("width", `${VIEWPORT[0]}px`);
  root.host.style.setProperty("height", `${VIEWPORT[1]}px`);
  root.host.style.setProperty("touch-action", "none");
  backend.attach(root);
  return root;
}
