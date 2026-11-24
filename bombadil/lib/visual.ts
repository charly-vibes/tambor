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
//   while the wrapped drawables carry the extent. The colour math lives
//   in ./contrast.ts and the paint-order surface walk in ./backdrop.ts
//   (tambor-akp split); both mirror tests/e2e/audit-color.ts and stay
//   inside `bombadil/` so the CLI bundle remains self-contained.
//   `readVisualFacts` takes the corpus carve-out surfaces as an argument
//   so a spec, not this shared seam, records a pinned limitation.

import { extract } from "@antithesishq/bombadil/browser";
import type { State } from "@antithesishq/bombadil/browser";
import { contrastRatio, over, parseColor, type Rgb } from "./contrast.ts";
import { surfaceBehind } from "./backdrop.ts";
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

// A corpus-pinned colour (0..1 channels, as the draw tree states it)
// whose text contrast is a recorded limitation, not a demo regression.
// The spec that owns the limitation passes it to `readVisualFacts`.
export type CarveOutColor = readonly number[];

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

// The corpus carve-out surfaces as 0..255 RGB, matching the composited
// surface colors the contrast rule compares against.
function toSurface(color: CarveOutColor): Rgb {
  return [
    Math.round((color[0] ?? 0) * 255),
    Math.round((color[1] ?? 0) * 255),
    Math.round((color[2] ?? 0) * 255),
  ];
}

function isCarvedOut(surface: Rgb, carveOuts: readonly Rgb[]): boolean {
  return carveOuts.some(
    (fill) =>
      fill[0] === surface[0] &&
      fill[1] === surface[1] &&
      fill[2] === surface[2],
  );
}

function capPush<T>(samples: T[], sample: T): void {
  if (samples.length < SAMPLE_LIMIT) samples.push(sample);
}

// The contrast rule for one leaf, or null when its ink is readable: no
// parseable colour, a carve-out surface, or a ratio at or above the floor.
function surfaceContrast(
  element: Element,
  carveOuts: readonly Rgb[],
): number | null {
  const ink = parseColor(getComputedStyle(element).color);
  if (ink === null) return null;
  const surface = surfaceBehind(element);
  if (isCarvedOut(surface, carveOuts)) return null;
  const ratio = contrastRatio(over(ink, surface), surface);
  return ratio < MIN_CONTRAST ? ratio : null;
}

// The contrast increment for one leaf: 1 below the floor (sample
// captured), 0 readable.
function countContrast(
  element: Element,
  text: string,
  carveOuts: readonly Rgb[],
  samples: ContrastSample[],
): number {
  const ratio = surfaceContrast(element, carveOuts);
  if (ratio === null) return 0;
  capPush(samples, {
    text: clipSample(text),
    ratio: Math.round(ratio * 100) / 100,
  });
  return 1;
}

// The clipping increment for one leaf: its box vs its scroll extent.
function countClip(
  element: Element,
  text: string,
  samples: TextSample[],
): number {
  if (element.scrollWidth <= element.clientWidth + 1) return 0;
  capPush(samples, { text: clipSample(text) });
  return 1;
}

// The off-root increment for one leaf (2px tolerance, audit rule).
function countOffRoot(
  rect: DOMRect,
  root: DOMRect,
  text: string,
  samples: TextSample[],
): number {
  if (!outsideRoot(rect, root)) return 0;
  capPush(samples, { text: clipSample(text) });
  return 1;
}

type LeafViolations = Pick<
  VisualFacts,
  | "contrastViolations"
  | "clippedTexts"
  | "offRootTexts"
  | "contrastSamples"
  | "clippedSamples"
  | "offRootSamples"
>;

type UndersizedTargets = Pick<
  VisualFacts,
  "undersizedTargets" | "undersizedSamples"
>;

// Pass one: leaf text (contrast, clipping, off-root) across the first
// ELEMENT_LIMIT descendants of the drawn root. A zero-area leaf paints
// no glyphs, so it is not readable text.
function countLeafViolations(
  root: Element, rootRect: DOMRect, carveOuts: readonly Rgb[],
): LeafViolations {
  const contrastSamples: ContrastSample[] = [];
  const clippedSamples: TextSample[] = [];
  const offRootSamples: TextSample[] = [];
  let contrastViolations = 0,
    clippedTexts = 0,
    offRootTexts = 0;
  const leaves = Array.from(root.querySelectorAll("*"));
  for (const element of leaves.slice(0, ELEMENT_LIMIT)) {
    const text = leafText(element);
    if (text === null) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    contrastViolations +=
      countContrast(element, text, carveOuts, contrastSamples);
    clippedTexts += countClip(element, text, clippedSamples);
    offRootTexts += countOffRoot(rect, rootRect, text, offRootSamples);
  }
  return {
    contrastViolations, clippedTexts, offRootTexts,
    contrastSamples, clippedSamples, offRootSamples,
  };
}

// Pass two: the interactive targets a user can operate, against the
// 44x44 touch floor.
function countUndersizedTargets(root: Element): UndersizedTargets {
  const undersizedSamples: TargetSample[] = [];
  let undersizedTargets = 0;
  for (const target of root.querySelectorAll(TARGET_SELECTOR)) {
    const rect = target.getBoundingClientRect();
    if (rect.width >= MIN_TARGET && rect.height >= MIN_TARGET) continue;
    undersizedTargets += 1;
    capPush(undersizedSamples, {
      label: targetLabel(target),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    });
  }
  return { undersizedTargets, undersizedSamples };
}

// Runs inside the page once per captured state, as two collector passes.
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
  const carveOutSurfaces = carveOuts.map(toSurface);
  // noFacts() is the pre-mount shape; from here the stage exists.
  const rootRect = root.getBoundingClientRect();
  return {
    ...countLeafViolations(root, rootRect, carveOutSurfaces),
    ...countUndersizedTargets(root),
    stagePresent: true,
  };
}

// The default extractor: no carve-outs, so the strict floors apply to
// every demo whose spec does not pin an exception. Counts are zero and
// `stagePresent` false before the demo mounts, so a property gated on
// `stagePresent` passes vacuously on the `loading …` placeholder.
export const visualFacts = extract<VisualFacts>(readVisualFacts);