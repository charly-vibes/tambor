// Purpose: the tambor-194 regression contract — every notebook label fits
//   the drawn root's 300px column even under font metrics wider than the
//   author machine's (the live CI failure: scrollWidth 317 vs clientWidth
//   300 under chromium's system-ui).
// Responsibilities: inject a scaled-up measure via configureLabelMeasure,
//   build the notebook view over the demo's evaluated initial state, and
//   assert no label's measured width exceeds the column space remaining
//   at its absolute x origin (the same bound the e2e guard asserts live
//   at 380px: scrollWidth <= clientWidth).
// Rationale: the e2e guard passes on the author's fonts and fails on CI's
//   — the metric mismatch must be caught headlessly, deterministically,
//   at the measure seam (the same seam the browser entry configures,
//   tambor-0rp text_measure_injected). scanOf reuses the corpus walk so
//   x origins are the real translate stacks, not a re-implementation.

import { describe, it, expect, afterEach } from "vitest";
import { configureLabelMeasure, type MeasureFn } from "../src/views/nodes.ts";
import type { Node } from "../src/views/model.ts";
import { notebookView } from "../src/examples/notebook/notebook-view.ts";
import { notebookState } from "../src/examples/notebook/notebook-state.ts";
import { scanOf } from "./helpers/scan.ts";

// Column width: the drawn root pins to VIEWPORT[0] (spa/mount.ts) — the
// 300px the e2e guard reads as clientWidth.
const COLUMN = 300;

// Every label must satisfy origin.x + measured width <= COLUMN.
function labelOverflow(view: ReturnType<typeof notebookView>): string | null {
  for (const { node, x } of scanOf(view as never)) {
    if ((node as Node).type !== "label") continue;
    const text = (node as { text: string }).text;
    const [w] = (node as unknown as { measure: MeasureFn }).measure(text);
    if (x + w > COLUMN) {
      return `label overflows: x=${x} w=${w} text="${text}"`;
    }
  }
  return null;
}

// The override rides process-wide module state (tambor-0rp) — restore
// the headless unit default after each test so no other file sees it.
afterEach(() => {
  configureLabelMeasure((text) => [text.length, 1]);
});

describe("notebook view: labels fit the 300px column (tambor-194)", () => {
  it("fits under wide real-font metrics (the CI-chromium case)", () => {
    // CI chromium's system-ui measures ~8.5px/char where the author's
    // stays under 300px total — the live overflow was 317/300 on the
    // output row. A realistic per-glyph width reproduces that regime; the
    // unit fallback (1px/char) cannot overflow at all, so the injected
    // override must be in the real-font range for the probe to bite.
    configureLabelMeasure((text) => [Math.ceil(text.length * 8.5), 1]);
    const view = notebookView(notebookState());
    expect(labelOverflow(view)).toBeNull();
  });

  it("fits under the headless unit measure (the existing default)", () => {
    const view = notebookView(notebookState());
    expect(labelOverflow(view)).toBeNull();
  });
});
