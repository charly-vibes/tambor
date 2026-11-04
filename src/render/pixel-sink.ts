// Purpose: the deterministic pixel-writing sink behind the Painter.
// Responsibilities: scissor clip state, clip-checked half-open pixel
// writes, stroke stamps, and the even-odd scanline polygon fill.
// Rationale: split out of painter.ts (pretender file_lines / mutator
// debt) with no behavior change: pixels are overwritten (no blending),
// rects fill half-open, and every write passes the clip test exactly
// as before (backend-render spec: draw_deterministic).

import { ImageBuffer, toRGBA } from "./image.ts";
import type { Color, Rect } from "./image.ts";

export class PixelSink {
  clip: Rect | null = null;
  private buf: ImageBuffer;

  constructor(buf: ImageBuffer) {
    this.buf = buf;
  }

  private insideClip(x: number, y: number): boolean {
    const c = this.clip;
    if (!c) return true;
    return x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height;
  }

  put(x: number, y: number, color: Color): void {
    if (!this.insideClip(Math.floor(x), Math.floor(y))) return;
    this.buf.set(Math.floor(x), Math.floor(y), toRGBA(color));
  }

  // Even-odd scanline fill of a device-space polygon, half-open on x.
  fillPoly(
    points: readonly (readonly [number, number])[],
    color: Color | null,
  ): void {
    if (!color || points.length === 0) return;
    const ys = points.map((p) => p[1]);
    const y0 = Math.round(Math.min(...ys));
    const y1 = Math.round(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const xs = scanlineCrossings(points, y);
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const from = Math.ceil(xs[i]!);
        const to = Math.ceil(xs[i + 1]!);
        for (let x = from; x < to; x++) this.put(x, y, color);
      }
    }
  }
}

export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.width, b.x + b.width) - x;
  const h = Math.min(a.y + a.height, b.y + b.height) - y;
  return { x, y, width: Math.max(0, w), height: Math.max(0, h) };
}

// Even-odd rule: one crossing per edge that spans the scanline.
function scanlineCrossings(
  points: readonly (readonly [number, number])[],
  y: number,
): number[] {
  const xs: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]!;
    const p2 = points[(i + 1) % points.length]!;
    if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
      const t = (y - p1[1]) / (p2[1] - p1[1]);
      xs.push(p1[0] + t * (p2[0] - p1[0]));
    }
  }
  return xs;
}
