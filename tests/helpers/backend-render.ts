// Purpose: shared backend-render fixtures for the backend.render contract
//   tests — a clipboard stub and a rasterized-ink box query.
// Responsibilities: clipStub records clipboard writes for predicates that
//   check the clipboard service; inkOf draws one node into a fresh
//   canvas backend and reports its ink as a bounding box in device
//   pixels (single options object, params ≤ 2).
// Rationale: openspec/specs/backend-render/spec.md is the design authority; tambor-272
//   redistributes the former monolithic tests/backend-render.test.ts
//   into topic-clustered files, and clipStub (contract + input files)
//   and inkOf (contract + a11y files) are each used by two or more of
//   the resulting files, so they live here instead of being duplicated.
//   inkOf is decomposed (boundsOf) so every function stays within the
//   tambor-272 complexity budgets.

import { CanvasBackend, type CanvasBackendOptions } from "../../src/render/canvas.ts";
import type { AnyDraw } from "../../src/render/primitives.ts";
import type { Vec2 } from "../../src/views/model.ts";

// A clipboard stub recording writes.
export function clipStub(): { texts: string[]; writeText(t: string): void } {
  const texts: string[] = [];
  return { texts, writeText: (t) => texts.push(t) };
}

// Rasterized ink of one node drawn into a fresh backend, as a bounding
// box in device pixels.
export interface InkBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  inked: boolean;
}

// The ink query: the view to draw, the container size and the backend
// options (single object keeps params ≤ 2).
export interface InkQuery {
  view: AnyDraw;
  size: Vec2;
  opts?: Partial<CanvasBackendOptions>;
}

// A drawn ink bound translated into an InkBox (empty box when no ink).
function boundsOf(ink: { x: number; y: number; width: number; height: number } | null): InkBox {
  if (!ink) return { minX: 0, minY: 0, maxX: 0, maxY: 0, inked: false };
  return {
    minX: ink.x,
    minY: ink.y,
    maxX: ink.x + ink.width - 1,
    maxY: ink.y + ink.height - 1,
    inked: true,
  };
}

// Rasterized ink of one node drawn into a fresh backend, as a bounding
// box in device pixels.
export function inkOf({ view, size, opts }: InkQuery): InkBox {
  const backend = new CanvasBackend({ containerSize: size, ...(opts ?? {}) });
  backend.draw(view);
  return boundsOf(backend.image.inkBounds());
}