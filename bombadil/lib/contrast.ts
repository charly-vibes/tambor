// Purpose: the color/contrast math of the bombadil visual floors —
//   parsing computed colors, compositing translucent ink and scoring
//   WCAG 2.x contrast ratios.
// Responsibilities: parse `rgb()/rgba()` strings, source-over compositing
//   over an opaque surface, sRGB relative luminance, contrast ratio, and
//   reading an element's painted background fill.
// Rationale: mirrors tests/e2e/audit-color.ts; duplicated rather than
//   imported because the bombadil bundle is self-contained (the CLI
//   bundles `bombadil/` only) and the audit module is a Node-side test
//   seam. Extracted from lib/visual.ts (tambor-akp pretender debt) so
//   the extractor module stays under the file/complexity floors; these
//   helpers have no DOM traversal of their own.

// Computed colours serialise as `rgb(r, g, b)` / `rgba(r, g, b, a)`
// (legacy or space-separated syntax); anything else is unreadable.
const COLOR_PATTERN =
  /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/;

// No background found all the way up the tree: the page surface.
export const OPAQUE_WHITE: Rgb = [255, 255, 255];

export type Rgba = readonly [number, number, number, number];
export type Rgb = readonly [number, number, number];

export function parseColor(value: string): Rgba | null {
  const match = COLOR_PATTERN.exec(value);
  if (match === null) return null;
  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (
    !Number.isFinite(red) ||
    !Number.isFinite(green) ||
    !Number.isFinite(blue) ||
    !Number.isFinite(alpha)
  ) {
    return null;
  }
  return [red, green, blue, alpha];
}

// Source-over compositing of a translucent ink onto an opaque surface.
export function over(top: Rgba, bottom: Rgb): Rgb {
  const alpha = top[3];
  return [
    Math.round(top[0] * alpha + bottom[0] * (1 - alpha)),
    Math.round(top[1] * alpha + bottom[1] * (1 - alpha)),
    Math.round(top[2] * alpha + bottom[2] * (1 - alpha)),
  ];
}

// sRGB channel linearisation (WCAG 2.x relative luminance).
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  return (
    0.2126 * channel(rgb[0]) +
    0.7152 * channel(rgb[1]) +
    0.0722 * channel(rgb[2])
  );
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

// A computed background that paints at all; null for transparent.
export function fillColor(element: Element): Rgba | null {
  const color = parseColor(getComputedStyle(element).backgroundColor);
  return color === null || color[3] === 0 ? null : color;
}
