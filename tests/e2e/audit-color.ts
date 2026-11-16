// Purpose: the small colour math the visual audit needs (tambor-v3s) —
//   parse the rgb()/rgba() strings Chromium's computed styles return and
//   compute a WCAG contrast ratio.
// Responsibilities: parseColor (alpha defaults to 1), composite (source
//   over an opaque surface), luminance (sRGB channel linearisation) and
//   contrast (WCAG 2.x ratio). No DOM, no I/O.
// Rationale: keeping this out of audit.ts keeps the snapshot/evaluator
//   module under the repo's file-length gate and leaves the formulas in
//   one place; the audit is a test-side measurement, not a product colour
//   API.

export type Rgba = readonly [number, number, number, number];
export type Rgb = readonly [number, number, number];

export function parseColor(value: string): Rgba | null {
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(
    value,
  );
  if (match === null) return null;
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const a = match[4] === undefined ? 1 : Number(match[4]);
  return [r, g, b, a];
}

export function composite(fg: Rgba, bg: Rgba): Rgb {
  const a = fg[3];
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
  ];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrast(fg: Rgb, bg: Rgb): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (a + 0.05) / (b + 0.05);
}