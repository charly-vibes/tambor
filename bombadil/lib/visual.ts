// Purpose: the visual-invariant seam of the bombadil suite — one JSON
//   snapshot of the drawn stage's readability and reachability, shared by
//   every spec that asserts those floors.
// Responsibilities: `visualFacts` reads `#demo > div` and counts leaf
//   text whose composited foreground/background contrast is under 4.5,
//   interactive targets under the 44x44 touch floor, leaf text clipped by
//   its own box, and leaf text escaping the stage root (2px tolerance,
//   the `checkRootText` rule of tests/e2e/audit.ts). Every count carries
//   up to three JSON samples for trace triage; the specs assert the
//   count, the samples are diagnostic only.
// Rationale: these are the DOM floors the deterministic Playwright audit
//   already measures (tambor-v3s), reused here so Bombadil's exploration
//   walks the same rules through more states than a fixed script can.
//   The facts are DOM ground truth, not model state. Extractor values
//   must be JSON (Bombadil serializes every snapshot), so this module
//   returns counts, short strings and numbers — never a DOM node or a
//   rect — and every DOM read lives inside the extractor path. Contrast
//   is measured against the surface the glyphs actually sit on, found in
//   paint order: the text's own background, then at each ancestor level
//   the last preceding sibling whose painted extent covers the text
//   centre (later siblings paint above the glyphs), falling back to the
//   ancestor's own background only when no such sibling exists. A fill's
//   painted extent is its own box plus the boxes of the geometry it
//   wraps: the DOM backend emits `with-color` as a percentage-sized
//   wrapper whose own box collapses to 0x0 inside an auto-sized ancestor
//   while the wrapped drawables carry the extent. The colour math mirrors
//   tests/e2e/audit-color.ts; it is duplicated rather than imported
//   because the bombadil bundle is self-contained (the CLI bundles
//   `bombadil/` only) and the audit module is a Node-side test seam.
//   `readVisualFacts` takes the corpus carve-out surfaces as an argument
//   so a spec, not this shared seam, records a pinned limitation.

import { extract } from "@antithesishq/bombadil/browser";
import type { State } from "@antithesishq/bombadil/browser";
import { STAGE_SELECTOR } from "./stage.ts";

// The floors plus the diagnostic caps: WCAG AA body text, the corpus
// mobile_first touch target, and the audit's off-root tolerance and
// three-sample cap.
const MIN_CONTRAST = 4.5;
const MIN_TARGET = 44;
const OFF_ROOT_TOLERANCE = 2;
const SAMPLE_LIMIT = 3;
const TEXT_SAMPLE_LIMIT = 40;
// The audit's own cap (tests/e2e/audit-snapshot.ts LIMIT = 1500): the
// 10k-row demos draw more leaves than one CDP evaluate can walk inside
// bombadil's frame budget (time-travel-10k and virtual-list timed out
// with an unbounded scan). The tail is not audited, exactly like the
// audit's truncated snapshot; the benchmark demos' off-root offenders
// live in the visible window, which is inside the cap.
const ELEMENT_LIMIT = 1500;

// The targets a user can actually operate. Drawn buttons are real
// `<button>` elements (render/dom-painters buildButton); the rest are the
// host's own controls.
const TARGET_SELECTOR =
  "button, [role='button'], a[href], input, textarea, select";

// One leaf text element whose ink is too close to what sits behind it.
// `ratio` is the WCAG 2.x ratio, rounded to two decimals.
export type ContrastSample = {
  readonly text: string;
  readonly ratio: number;
};

// One interactive target below the 44x44 floor, box in CSS pixels.
export type TargetSample = {
  readonly label: string;
  readonly w: number;
  readonly h: number;
};

// One leaf text element caught by a box rule (clipping, off-root).
export type TextSample = {
  readonly text: string;
};

// The full per-state snapshot. Counts are the assertion surface; the
// sample arrays are capped diagnostics the trace records.
export type VisualFacts = {
  readonly stagePresent: boolean;
  readonly contrastViolations: number;
  readonly undersizedTargets: number;
  readonly clippedTexts: number;
  readonly offRootTexts: number;
  readonly contrastSamples: ContrastSample[];
  readonly undersizedSamples: TargetSample[];
  readonly clippedSamples: TextSample[];
  readonly offRootSamples: TextSample[];
};

type Rgba = readonly [number, number, number, number];
type Rgb = readonly [number, number, number];

// A corpus-pinned colour (0..1 channels, as the draw tree states it)
// whose text contrast is a recorded limitation, not a demo regression.
// The spec that owns the limitation passes it to `readVisualFacts`.
export type CarveOutColor = readonly number[];

// The area a fill paints, in client pixels.
type PaintBox = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

// Where the text glyphs are measured from: the centre of their box.
type Centre = { readonly x: number; readonly y: number };

// No background found all the way up the tree: the page surface.
const OPAQUE_WHITE: Rgb = [255, 255, 255];

// Computed colours serialise as `rgb(r, g, b)` / `rgba(r, g, b, a)`
// (legacy or space-separated syntax); anything else is unreadable.
const COLOR_PATTERN =
  /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/;

function parseColor(value: string): Rgba | null {
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
function over(top: Rgba, bottom: Rgb): Rgb {
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

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

// A computed background that paints at all; null for transparent.
function fillColor(element: Element): Rgba | null {
  const color = parseColor(getComputedStyle(element).backgroundColor);
  return color === null || color[3] === 0 ? null : color;
}

// The area a fill paints: its own box plus the boxes of the geometry it
// wraps. The DOM backend emits `with-color` as a percentage-sized wrapper
// whose own box collapses to 0x0 inside an auto-sized ancestor while the
// wrapped drawables carry the extent (see the header).
function paintedExtent(element: Element): PaintBox {
  const rects: DOMRect[] = [element.getBoundingClientRect()];
  for (const descendant of element.querySelectorAll("*")) {
    rects.push(descendant.getBoundingClientRect());
  }
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  return { left, top, right, bottom };
}

function covers(box: PaintBox, point: Centre): boolean {
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

// The last sibling painted before `subtree` that fills the text centre.
// Siblings after it paint above the glyphs, so they are never a surface.
function precedingFill(
  parent: Element,
  subtree: Element,
  centre: Centre,
): Rgba | null {
  const siblings = Array.from(parent.children);
  const index = siblings.indexOf(subtree);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const sibling = siblings[cursor];
    if (sibling === undefined) continue;
    const color = fillColor(sibling);
    if (color === null) continue;
    if (!covers(paintedExtent(sibling), centre)) continue;
    return color;
  }
  return null;
}

// The surface the glyphs actually sit on, topmost layer first: the text's
// own background, then per ancestor level the last preceding filled
// sibling covering the text centre, else that ancestor's own background
// where its own box covers the centre (a 0x0 ancestor paints nothing).
// The layers are then composited bottom-up over white.
function surfaceBehind(element: Element): Rgb {
  const rect = element.getBoundingClientRect();
  const centre: Centre = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  const layers: Rgba[] = [];
  const own = fillColor(element);
  if (own !== null) layers.push(own);
  let opaque = own !== null && own[3] >= 1;

  let subtree: Element = element;
  let parent = subtree.parentElement;
  while (!opaque && parent !== null) {
    const sibling = precedingFill(parent, subtree, centre);
    if (sibling !== null) {
      layers.push(sibling);
      opaque = sibling[3] >= 1;
    } else {
      const ancestor = fillColor(parent);
      if (ancestor !== null && covers(parent.getBoundingClientRect(), centre)) {
        layers.push(ancestor);
        opaque = ancestor[3] >= 1;
      }
    }
    subtree = parent;
    parent = parent.parentElement;
  }

  let surface: Rgb = OPAQUE_WHITE;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (layer !== undefined) surface = over(layer, surface);
  }
  return surface;
}

// The element's own text, or null when it is a container, empty, or
// whitespace only. Leaves only, so a wrapper's textContent cannot count
// its children's glyphs twice.
function leafText(element: Element): string | null {
  if (element.childElementCount > 0) return null;
  const text = (element.textContent ?? "").trim();
  return text === "" ? null : text;
}

function clipSample(text: string): string {
  return text.slice(0, TEXT_SAMPLE_LIMIT);
}

// A short human-readable name for an undersized target: its label, else
// its accessible name, else its tag.
function targetLabel(element: Element): string {
  const text = (element.textContent ?? "").trim();
  if (text !== "") return clipSample(text);
  for (const attribute of ["aria-label", "placeholder", "name"]) {
    const value = (element.getAttribute(attribute) ?? "").trim();
    if (value !== "") return clipSample(value);
  }
  return element.tagName.toLowerCase();
}

// Mirrors tests/e2e/audit.ts checkRootText: more than 2px outside the
// drawn root on any side. Rects are compared in client pixels, unrounded
// (the audit rounds at snapshot time; the tolerance absorbs the
// difference).
function outsideRoot(rect: DOMRect, root: DOMRect): boolean {
  return (
    rect.right > root.right + OFF_ROOT_TOLERANCE ||
    rect.bottom > root.bottom + OFF_ROOT_TOLERANCE ||
    rect.left < root.left - OFF_ROOT_TOLERANCE ||
    rect.top < root.top - OFF_ROOT_TOLERANCE
  );
}

function noFacts(): VisualFacts {
  return {
    stagePresent: false,
    contrastViolations: 0,
    undersizedTargets: 0,
    clippedTexts: 0,
    offRootTexts: 0,
    contrastSamples: [],
    undersizedSamples: [],
    clippedSamples: [],
    offRootSamples: [],
  };
}

// Runs inside the page once per captured state. Two passes: leaf text
// (contrast, clipping, off-root), then the interactive targets (size).
//
// `carveOuts` are corpus-pinned fill colours (0..1 channels) whose text
// contrast is a recorded limitation: a text box whose composited surface
// equals one of them is skipped by the contrast rule only. The clipping,
// off-root and target rules still apply, and the spec that owns the
// carve-out names it at its call site.
export function readVisualFacts(
  state: State,
  carveOuts: readonly CarveOutColor[] = [],
): VisualFacts {
  const root = state.document.querySelector(STAGE_SELECTOR);
  if (root === null) return noFacts();
  const carveOutSurfaces: Rgb[] = carveOuts.map((color) => [
    Math.round((color[0] ?? 0) * 255),
    Math.round((color[1] ?? 0) * 255),
    Math.round((color[2] ?? 0) * 255),
  ]);
  const facts = noFacts();
  // noFacts() is the pre-mount shape; from here the stage exists.
  const rootRect = root.getBoundingClientRect();
  const contrastSamples = facts.contrastSamples;
  const clippedSamples = facts.clippedSamples;
  const offRootSamples = facts.offRootSamples;
  const undersizedSamples = facts.undersizedSamples;
  let contrastViolations = 0;
  let clippedTexts = 0;
  let offRootTexts = 0;
  let undersizedTargets = 0;

  for (const element of Array.from(root.querySelectorAll("*")).slice(
    0,
    ELEMENT_LIMIT,
  )) {
    const text = leafText(element);
    if (text === null) continue;
    const rect = element.getBoundingClientRect();
    // A zero-area leaf paints no glyphs; it is not readable text.
    if (rect.width <= 0 || rect.height <= 0) continue;
    const ink = parseColor(getComputedStyle(element).color);
    if (ink !== null) {
      const surface = surfaceBehind(element);
      const carvedOut = carveOutSurfaces.some(
        (fill) =>
          fill[0] === surface[0] &&
          fill[1] === surface[1] &&
          fill[2] === surface[2],
      );
      if (!carvedOut) {
        const ratio = contrastRatio(over(ink, surface), surface);
        if (ratio < MIN_CONTRAST) {
          contrastViolations += 1;
          if (contrastSamples.length < SAMPLE_LIMIT) {
            contrastSamples.push({
              text: clipSample(text),
              ratio: Math.round(ratio * 100) / 100,
            });
          }
        }
      }
    }
    if (element.scrollWidth > element.clientWidth + 1) {
      clippedTexts += 1;
      if (clippedSamples.length < SAMPLE_LIMIT) {
        clippedSamples.push({ text: clipSample(text) });
      }
    }
    if (outsideRoot(rect, rootRect)) {
      offRootTexts += 1;
      if (offRootSamples.length < SAMPLE_LIMIT) {
        offRootSamples.push({ text: clipSample(text) });
      }
    }
  }

  for (const target of root.querySelectorAll(TARGET_SELECTOR)) {
    const rect = target.getBoundingClientRect();
    if (rect.width >= MIN_TARGET && rect.height >= MIN_TARGET) continue;
    undersizedTargets += 1;
    if (undersizedSamples.length < SAMPLE_LIMIT) {
      undersizedSamples.push({
        label: targetLabel(target),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }
  }

  return {
    ...facts,
    stagePresent: true,
    contrastViolations,
    undersizedTargets,
    clippedTexts,
    offRootTexts,
  };
}

// The default extractor: no carve-outs, so the strict floors apply to
// every demo whose spec does not pin an exception. Counts are zero and
// `stagePresent` false before the demo mounts, so a property gated on
// `stagePresent` passes vacuously on the `loading …` placeholder.
export const visualFacts = extract<VisualFacts>(readVisualFacts);