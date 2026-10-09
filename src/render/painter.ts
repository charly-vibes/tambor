// Purpose: the Canvas2D-like Painter that rasterizes drawing
//   primitives deterministically into an ImageBuffer.
// Responsibilities: the save/restore transform/clip/style stack, fill
//   and stroke styles and width, scissor clipping, fillRect/strokeRect,
//   path building with fill/stroke, arc sampling, fillText and
//   drawImage; the scanline even-odd polygon fill.
// Rationale: openspec/specs/backend-render/spec.md is the design authority.
//   draw_deterministic needs two draws to produce identical pixels, so
//   every rasterization step is a pure function of its inputs: pixels
//   are overwritten (no blending), rects fill half-open (the same
//   [x, x+w) convention as hit_half_open), text paints a pattern
//   derived from the character code. transform_stack_balanced is
//   observable as the Painter's save-stack depth. The half-open pixel
//   convention keeps a 100-wide rect's ink inside 0..99, which is what
//   the safe-area predicate measures. No behavior beyond the corpus.

import { matApply, matRotate, matScale, matTranslate, IDENTITY, type Mat } from "./matrix.ts";
import type { Color, Rect } from "./image.ts";
import { ImageBuffer, toRGBA } from "./image.ts";

type StyleMode = "fill" | "stroke" | "stroke-and-fill";

interface SavedState {
  matrix: Mat;
  clip: Rect | null;
  mode: StyleMode;
  fillStyle: Color | null;
  strokeStyle: Color | null;
  lineWidth: number;
}

export class Painter {
  private buf: ImageBuffer;
  private matrix: Mat = IDENTITY;
  private clip: Rect | null = null;
  mode: StyleMode = "fill";
  // canvas defaults: black paint on both channels
  fillStyle: Color | null = [0, 0, 0];
  strokeStyle: Color | null = [0, 0, 0];
  lineWidth = 1;
  private stack: SavedState[] = [];
  private current: readonly (readonly [number, number])[] = [];
  private closed = false;

  constructor(buf: ImageBuffer) {
    this.buf = buf;
  }

  // The save-stack depth: pushes of transforms, clips and styles minus
  // their pops (transform_stack_balanced observes this as 0 after draw).
  get depth(): number {
    return this.stack.length;
  }

  // The base matrix is set directly (no save), so the dpr scale never
  // unbalances the stack.
  setMatrix(m: Mat): void {
    this.matrix = m;
  }

  // Retarget the painter onto a new buffer (a resized backing store).
  setBuffer(buf: ImageBuffer): void {
    this.buf = buf;
  }

  save(): void {
    this.stack.push({
      matrix: this.matrix,
      clip: this.clip,
      mode: this.mode,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.matrix = s.matrix;
    this.clip = s.clip;
    this.mode = s.mode;
    this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth;
  }

  translate(x: number, y: number): void {
    this.matrix = matTranslate(this.matrix, x, y);
  }

  rotate(theta: number): void {
    this.matrix = matRotate(this.matrix, theta);
  }

  scale(x: number, y: number): void {
    this.matrix = matScale(this.matrix, x, y);
  }

  setStyle(mode: "fill" | "stroke" | "stroke-and-fill"): void {
    this.mode = mode;
  }

  // Clip to the given rect in the current transform's space.
  scissor(x: number, y: number, width: number, height: number): void {
    const corners = [
      matApply(this.matrix, x, y),
      matApply(this.matrix, x + width, y),
      matApply(this.matrix, x + width, y + height),
      matApply(this.matrix, x, y + height),
    ];
    const minX = Math.floor(Math.min(...corners.map((p) => p[0])));
    const minY = Math.floor(Math.min(...corners.map((p) => p[1])));
    const maxX = Math.ceil(Math.max(...corners.map((p) => p[0])));
    const maxY = Math.ceil(Math.max(...corners.map((p) => p[1])));
    const rect: Rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    this.clip = this.clip ? intersect(this.clip, rect) : rect;
  }

  private insideClip(x: number, y: number): boolean {
    const c = this.clip;
    if (!c) return true;
    return x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height;
  }

  private put(x: number, y: number, color: Color): void {
    if (!this.insideClip(Math.floor(x), Math.floor(y))) return;
    this.buf.set(Math.floor(x), Math.floor(y), toRGBA(color));
  }

  // Stamp a square of the current stroke width around a device point.
  private stamp(cx: number, cy: number, color: Color): void {
    const s = Math.max(1, Math.round(this.lineWidth));
    const half = Math.floor(s / 2);
    for (let dy = -half; dy < s - half; dy++) {
      for (let dx = -half; dx < s - half; dx++) {
        this.put(cx + dx, cy + dy, color);
      }
    }
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    if (this.mode === "stroke") return;
    this.fillPoly(
      [
        matApply(this.matrix, x, y),
        matApply(this.matrix, x + width, y),
        matApply(this.matrix, x + width, y + height),
        matApply(this.matrix, x, y + height),
      ],
      this.fillStyle,
    );
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    if (this.mode === "fill") return;
    this.strokeSeg(x, y, x + width, y);
    this.strokeSeg(x + width, y, x + width, y + height);
    this.strokeSeg(x + width, y + height, x, y + height);
    this.strokeSeg(x, y + height, x, y);
  }

  // Rounded-rectangle outline: straight edges in [r, w-r] and quarter
  // arcs at the corners.
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    if (this.mode === "fill") return;
    const r = Math.min(radius, width / 2, height / 2);
    const x2 = x + width;
    const y2 = y + height;
    this.strokeSeg(x + r, y, x2 - r, y);
    this.strokeSeg(x + r, y2, x2 - r, y2);
    this.strokeSeg(x, y + r, x, y2 - r);
    this.strokeSeg(x2, y + r, x2, y2 - r);
    for (const [cx, cy, start] of [
      [x + r, y + r, Math.PI],
      [x2 - r, y + r, Math.PI * 1.5],
      [x2 - r, y2 - r, 0],
      [x + r, y2 - r, Math.PI / 2],
    ] as const) {
      const steps = Math.max(2, Math.ceil(r * 2));
      for (let i = 0; i <= steps; i++) {
        const a = start + (Math.PI / 2) * (i / steps);
        const p = matApply(this.matrix, cx + r * Math.cos(a), cy + r * Math.sin(a));
        this.stamp(Math.round(p[0]), Math.round(p[1]), this.strokeStyle ?? [0, 0, 0]);
      }
    }
  }

  beginPath(): void {
    this.current = [];
    this.closed = false;
  }

  moveTo(x: number, y: number): void {
    this.current = [matApply(this.matrix, x, y)];
  }

  lineTo(x: number, y: number): void {
    this.current = [...this.current, matApply(this.matrix, x, y)];
  }

  closePath(): void {
    this.closed = true;
  }

  // Sample an arc into the current path (as canvas does for strokes).
  arc(cx: number, cy: number, radius: number, start: number, end: number): void {
    const steps = Math.max(2, Math.ceil(Math.abs(end - start) * radius * 2));
    for (let i = 0; i <= steps; i++) {
      const a = start + ((end - start) * i) / steps;
      this.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
    }
  }

  fill(): void {
    this.fillPoly(this.current, this.fillStyle);
  }

  stroke(): void {
    const color = this.strokeStyle ?? [0, 0, 0];
    const pts = this.current;
    for (let i = 1; i < pts.length; i++) {
      this.strokeSeg(pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], color);
    }
    if (this.closed && pts.length > 2) {
      this.strokeSeg(pts[pts.length - 1]![0], pts[pts.length - 1]![1], pts[0]![0], pts[0]![1], color);
    }
  }

  private strokeSeg(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color?: Color,
  ): void {
    const c = color ?? this.strokeStyle;
    if (!c) return;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(len));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.stamp(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), c);
    }
  }

  // Even-odd scanline fill of a device-space polygon, half-open on x.
  private fillPoly(
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

  // Text rasterization: one patterned block per character cell; the
  // bottom row of every cell is always inked so any string draws.
  fillText(text: string, x: number, y: number, cellW = 1, cellH = 1): void {
    const color = this.fillStyle;
    if (!color) return;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const ox = matApply(this.matrix, x + i * cellW, y);
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < cellW; dx++) {
          const px = matApply(this.matrix, x + i * cellW + dx, y + dy);
          const pattern = (code * 7 + dx * 3 + dy * 11) % 7 < 3;
          if (pattern || dy === cellH - 1) {
            this.put(Math.floor(ox[0]) + dx, Math.floor(ox[1]) + dy, color);
          }
        }
      }
    }
  }

  // Copy a source buffer's pixels 1:1 at the transformed origin.
  drawImage(src: ImageBuffer, x: number, y: number): void {
    const [ox, oy] = matApply(this.matrix, x, y);
    const dx0 = Math.round(ox);
    const dy0 = Math.round(oy);
    for (let sy = 0; sy < src.height; sy++) {
      for (let sx = 0; sx < src.width; sx++) {
        const i = (sy * src.width + sx) * 4;
        if ((src.data[i + 3] ?? 0) > 0) {
          this.put(dx0 + sx, dy0 + sy, [
            src.data[i]! / 255,
            src.data[i + 1]! / 255,
            src.data[i + 2]! / 255,
            src.data[i + 3]! / 255,
          ]);
        }
      }
    }
  }
}

function intersect(a: Rect, b: Rect): Rect {
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
