// Purpose: the stage seam of bombadil suite — one JSON snapshot of the
//   `#demo > div` drawn root and one mounted cell, shared by every spec.
// Responsibilities: `stage` extracts the drawn root's client rect plus the
//   viewport size; `mounted` extracts whether that root exists with a
//   non-zero box; the point helpers are the single containment rule the
//   action generators use to reject off-stage and off-viewport targets.
// Rationale: the SPA mounts one demo behind a dynamic import, so a run's
//   first states are the `loading …` placeholder with no `#demo > div`
//   (design D10). Action generators gate on `mounted` and never dispatch
//   before the stage exists. Extractor values must be JSON (Bombadil
//   serializes every snapshot), so this module returns plain numbers and
//   null — never a DOM node or a rect object.

import { extract } from "@antithesishq/bombadil/browser";
import type { State } from "@antithesishq/bombadil/browser";

// The drawn root main.ts mounts into #demo (mount.ts appends the backend
// root, a `div`, as the content container's direct child).
export const STAGE_SELECTOR = "#demo > div";

// Client-space rect of the stage (CSS pixels, viewport origin). `null`
// while the selected demo has not mounted yet.
export type StageRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

// The full stage snapshot the generators and properties read.
export type StageGeometry = {
  readonly stage: StageRect | null;
  readonly viewport: { readonly width: number; readonly height: number };
};

export type StagePoint = { readonly x: number; readonly y: number };

function viewportSize(state: State): StageGeometry["viewport"] {
  return {
    width: state.window.innerWidth,
    height: state.window.innerHeight,
  };
}

function stageRect(state: State): StageRect | null {
  const element = state.document.querySelector(STAGE_SELECTOR);
  if (element === null) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function stageIsMounted(state: State): boolean {
  const rect = stageRect(state);
  return rect !== null && rect.width > 0 && rect.height > 0;
}

// `#demo > div` geometry plus the viewport, captured on every state. The
// extractor is the only DOM read; action generators and properties go
// through the cells so no generator touches the page directly.
export function readStageGeometry(state: State): StageGeometry {
  return {
    stage: stageRect(state),
    viewport: viewportSize(state),
  };
}

export const stage = extract<StageGeometry>(readStageGeometry);

// True only once the selected demo's drawn root exists with a box. The
// placeholder state (`loading …`) has no `#demo > div`, so every action
// generator returns [] until this flips.
export const mounted = extract<boolean>(stageIsMounted);

// Half-open containment: the right/bottom edge belongs to the next pixel.
function insideRect(point: StagePoint, rect: StageRect): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

function insideViewport(point: StagePoint, geometry: StageGeometry): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < geometry.viewport.width &&
    point.y < geometry.viewport.height
  );
}

// The action-target admission rule: a point is usable only when it lies
// inside the drawn root AND inside the visible viewport (the stage is
// normally fully visible; a scrolled page can put parts of it below the
// fold, and a click there would be rejected by Chrome).
export function validStagePoint(point: StagePoint, geometry: StageGeometry): boolean {
  const rect = geometry.stage;
  return rect !== null && insideRect(point, rect) && insideViewport(point, geometry);
}

// The part of the stage currently on screen (the fixture stage has a
// min-height taller than a 768 px viewport, so its lower edge can sit
// below the fold). Null when nothing of the stage is visible.
export function visibleStageRect(geometry: StageGeometry): StageRect | null {
  const rect = geometry.stage;
  if (rect === null) return null;
  const x = Math.max(rect.x, 0);
  const y = Math.max(rect.y, 0);
  const right = Math.min(rect.x + rect.width, geometry.viewport.width);
  const bottom = Math.min(rect.y + rect.height, geometry.viewport.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}