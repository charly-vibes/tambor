// Purpose: 2D affine matrices in canvas convention (x' = a x + c y +
//   e, y' = b x + d y + f).
// Responsibilities: the Mat shape, IDENTITY, and the translate/rotate/
//   scale/apply constructors the draw traversals compose.
// Rationale: specs/backend-render.md is the design authority; split
//   from image.ts so no file carries both the raster and the algebra
//   (tambor-272). image.ts re-exports these names for compatibility.

// 2D affine matrix, canvas convention: x' = a x + c y + e, y' = b x + d y + f.
export interface Mat {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function matTranslate(m: Mat, tx: number, ty: number): Mat {
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e + m.a * tx + m.c * ty, f: m.f + m.b * tx + m.d * ty };
}

export function matRotate(m: Mat, theta: number): Mat {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    a: m.a * cos + m.c * sin,
    b: m.b * cos + m.d * sin,
    c: -m.a * sin + m.c * cos,
    d: -m.b * sin + m.d * cos,
    e: m.e,
    f: m.f,
  };
}

export function matScale(m: Mat, sx: number, sy: number): Mat {
  return { a: m.a * sx, b: m.b * sx, c: m.c * sy, d: m.d * sy, e: m.e, f: m.f };
}

export function matApply(m: Mat, x: number, y: number): readonly [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

