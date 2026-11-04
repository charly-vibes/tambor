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

import {
  matApply,
  matRotate,
  matScale,
  matTranslate,
  IDENTITY,
  type Mat,
} from "./matrix.ts";
import type { Color, Rect } from "./image.ts";
import { ImageBuffer } from "./image.ts";
import { PixelSink, intersect } from "./pixel-sink.ts";

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
  private matrix: Mat = IDENTITY;
  private sink: PixelSink;
  mode: StyleMode = "fill";
  // canvas defaults: black paint on both channels
  fillStyle: Color | null = [0, 0, 0];
  strokeStyle: Color | null = [0, 0, 0];
  lineWidth = 1;
  private stack: SavedState[] = [];
  private current: readonly (readonly [number, number])[] = [];
  private closed = false;

  constructor(buf: ImageBuffer) {
    this.sink = new PixelSink(buf);
  }

  // The save-stack depth: pushes of transforms, clips and styles minus
  // their pops (transform_stack_balanced observes this as 0 after draw).
  get depth(): number {
    return this.stack.length;
  }

  // The base matrix is set directly (no save), so the dpr scale never
  // unbalances the stack.
  setMatrix(m: Mat): this {
    this.matrix = m;
    return this;
  }

  // Retarget the painter onto a new buffer (a resized backing store).
  setBuffer(buf: ImageBuffer): this {
    this.sink = new PixelSink(buf);
    return this;
  }

  save(): void {
    this.stack.push({
      matrix: this.matrix,
      clip: this.sink.clip,
      mode: this.mode,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  restore(): this {
    const s = this.stack.pop();
    if (!s) return this;
    this.matrix = s.matrix;
    this.sink.clip = s.clip;
    this.mode = s.mode;
    this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth;
    return this;
  }

  translate(x: number, y: number): this {
    this.matrix = matTranslate(this.matrix, x, y);
    return this;
  }

  rotate(theta: number): this {
    this.matrix = matRotate(this.matrix, theta);
    return this;
  }

  scale(x: number, y: number): this {
    this.matrix = matScale(this.matrix, x, y);
    return this;
  }

  setStyle(mode: "fill" | "stroke" | "stroke-and-fill"): this {
    this.mode = mode;
    return this;
  }

  // Clip to the given rect in the current transform's space.
  scissor(x: number, y: number, width: number, height: number): this {
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
    const rect: Rect = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
    this.sink.clip = this.sink.clip ? intersect(this.sink.clip, rect) : rect;
    return this;
  }

  // Stamp a square of the current stroke width around a device point.
  private stamp(cx: number, cy: number, color: Color): this {
    const s = Math.max(1, Math.round(this.lineWidth));
    const half = Math.floor(s / 2);
    for (let dy = -half; dy < s - half; dy++) {
      for (let dx = -half; dx < s - half; dx++) {
        this.sink.put(cx + dx, cy + dy, color);
      }
    }
    return this;
  }

  fillRect(x: number, y: number, width: number, height: number): this {
    if (this.mode === "stroke") return this;
    this.sink.fillPoly(
      [
        matApply(this.matrix, x, y),
        matApply(this.matrix, x + width, y),
        matApply(this.matrix, x + width, y + height),
        matApply(this.matrix, x, y + height),
      ],
      this.fillStyle,
    );
    return this;
  }

  strokeRect(x: number, y: number, width: number, height: number): this {
    if (this.mode === "fill") return this;
    this.strokeSeg(x, y, x + width, y);
    this.strokeSeg(x + width, y, x + width, y + height);
    this.strokeSeg(x + width, y + height, x, y + height);
    this.strokeSeg(x, y + height, x, y);
    return this;
  }

  // Rounded-rectangle outline: straight edges in [r, w-r] and quarter
  // arcs at the corners.
  strokeRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): this {
    if (this.mode === "fill") return this;
    const r = Math.min(radius, width / 2, height / 2);
    const x2 = x + width;
    const y2 = y + height;
    this.strokeSeg(x + r, y, x2 - r, y);
    this.strokeSeg(x + r, y2, x2 - r, y2);
    this.strokeSeg(x, y + r, x, y2 - r);
    this.strokeSeg(x2, y + r, x2, y2 - r);
    const corners: readonly (readonly [number, number, number])[] = [
      [x + r, y + r, Math.PI],
      [x2 - r, y + r, Math.PI * 1.5],
      [x2 - r, y2 - r, 0],
      [x + r, y2 - r, Math.PI / 2],
    ];
    for (const [cx, cy, start] of corners)
      this.strokeArcQuarter(cx, cy, r, start);
    return this;
  }

  // One rounded-rect corner: a quarter arc sampled and stamped at the
  // current stroke width (shared by strokeRoundedRect's four corners).
  private strokeArcQuarter(
    cx: number,
    cy: number,
    r: number,
    start: number,
  ): void {
    const steps = Math.max(2, Math.ceil(r * 2));
    for (let i = 0; i <= steps; i++) {
      const a = start + (Math.PI / 2) * (i / steps);
      const p = matApply(
        this.matrix,
        cx + r * Math.cos(a),
        cy + r * Math.sin(a),
      );
      this.stamp(
        Math.round(p[0]),
        Math.round(p[1]),
        this.strokeStyle ?? [0, 0, 0],
      );
    }
  }

  beginPath(): this {
    this.current = [];
    this.closed = false;
    return this;
  }

  moveTo(x: number, y: number): this {
    this.current = [matApply(this.matrix, x, y)];
    return this;
  }

  lineTo(x: number, y: number): this {
    this.current = [...this.current, matApply(this.matrix, x, y)];
    return this;
  }

  closePath(): this {
    this.closed = true;
    return this;
  }

  // Sample an arc into the current path (as canvas does for strokes).
  arc(
    cx: number,
    cy: number,
    radius: number,
    start: number,
    end: number,
  ): this {
    const steps = Math.max(2, Math.ceil(Math.abs(end - start) * radius * 2));
    for (let i = 0; i <= steps; i++) {
      const a = start + ((end - start) * i) / steps;
      this.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
    }
    return this;
  }

  fill(): this {
    this.sink.fillPoly(this.current, this.fillStyle);
    return this;
  }

  stroke(): this {
    const color = this.strokeStyle ?? [0, 0, 0];
    const pts = this.current;
    for (let i = 1; i < pts.length; i++) {
      this.strokeSeg(
        pts[i - 1]![0],
        pts[i - 1]![1],
        pts[i]![0],
        pts[i]![1],
        color,
      );
    }
    if (this.closed && pts.length > 2) {
      this.strokeSeg(
        pts[pts.length - 1]![0],
        pts[pts.length - 1]![1],
        pts[0]![0],
        pts[0]![1],
        color,
      );
    }
    return this;
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
      this.stamp(
        Math.round(x1 + (x2 - x1) * t),
        Math.round(y1 + (y2 - y1) * t),
        c,
      );
    }
  }

  // Text rasterization: one patterned block per character cell; the
  // bottom row of every cell is always inked so any string draws.
  fillText(text: string, x: number, y: number, cellW = 1, cellH = 1): this {
    const color = this.fillStyle;
    if (!color) return this;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const ox = matApply(this.matrix, x + i * cellW, y);
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < cellW; dx++) {
          const pattern = (code * 7 + dx * 3 + dy * 11) % 7 < 3;
          if (pattern || dy === cellH - 1) {
            this.sink.put(
              Math.floor(ox[0]) + dx,
              Math.floor(ox[1]) + dy,
              color,
            );
          }
        }
      }
    }
    return this;
  }

  // Copy a source buffer's pixels 1:1 at the transformed origin.
  drawImage(src: ImageBuffer, x: number, y: number): this {
    const [ox, oy] = matApply(this.matrix, x, y);
    const dx0 = Math.round(ox);
    const dy0 = Math.round(oy);
    for (let sy = 0; sy < src.height; sy++) {
      for (let sx = 0; sx < src.width; sx++) {
        const i = (sy * src.width + sx) * 4;
        if ((src.data[i + 3] ?? 0) > 0) {
          this.sink.put(dx0 + sx, dy0 + sy, [
            src.data[i]! / 255,
            src.data[i + 1]! / 255,
            src.data[i + 2]! / 255,
            src.data[i + 3]! / 255,
          ]);
        }
      }
    }
    return this;
  }
}
