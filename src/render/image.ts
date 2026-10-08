// Purpose: the canvas backend's painting target — an ImageBuffer and a
//   Canvas2D-like Painter that rasterizes drawing primitives into it
//   deterministically.
// Responsibilities: ImageBuffer (RGBA bytes, clear, ink bounds,
//   equality), 2D affine matrices (translate/rotate/scale/apply), and
//   a Painter exposing the 2d-context surface the draw traversal uses:
//   save/restore (the transform/clip/style stack), fill/stroke style
//   and width, scissor clipping, fillRect/strokeRect, path building
//   with fill/stroke, arc sampling, fillText and drawImage.
// Rationale: specs/backend-render.md is the design authority.
//   draw_deterministic needs two draws to produce identical pixels, so
//   every rasterization step is a pure function of its inputs: pixels
//   are overwritten (no blending), rects fill half-open (the same
//   [x, x+w) convention as hit_half_open), text paints a pattern
//   derived from the character code. transform_stack_balanced is
//   observable as the Painter's save-stack depth. The half-open pixel
//   convention keeps a 100-wide rect's ink inside 0..99, which is what
//   the safe-area predicate measures. No behavior beyond the corpus.

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// A color is 0..1 components, RGB or RGBA.
export type Color = readonly number[];

export function toRGBA(color: Color): readonly [number, number, number, number] {
  const r = Math.round((color[0] ?? 0) * 255);
  const g = Math.round((color[1] ?? 0) * 255);
  const b = Math.round((color[2] ?? 0) * 255);
  const a = Math.round((color[3] ?? 1) * 255);
  return [r, g, b, a];
}

// An RGBA image buffer, row-major, 4 bytes per pixel.
export class ImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = Math.max(0, Math.round(width));
    this.height = Math.max(0, Math.round(height));
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }

  clear(): void {
    this.data.fill(0);
  }

  set(x: number, y: number, rgba: readonly [number, number, number, number]): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = rgba[0];
    this.data[i + 1] = rgba[1];
    this.data[i + 2] = rgba[2];
    this.data[i + 3] = rgba[3];
  }

  // The bounding box of every pixel with alpha > 0, or null when blank.
  inkBounds(): Rect | null {
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if ((this.data[(y * this.width + x) * 4 + 3] ?? 0) > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
}

import {
  IDENTITY,
  matApply,
  matRotate,
  matScale,
  matTranslate,
  type Mat,
} from "./matrix.ts";

export {
  IDENTITY,
  matApply,
  matRotate,
  matScale,
  matTranslate,
  type Mat,
};

export { Painter } from "./painter.ts";

