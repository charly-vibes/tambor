// Purpose: the view layer's one wrap rule (views/fit.ts) pinned against
//   a real-ish label measure.
// Responsibilities: inject the 8 px/char, 16 px-line measure that makes
//   wrapping actually trigger (the headless unit default of 1 px/char
//   never overflows the 300 px stage), restore the default measure after
//   each test, then assert the fitted-label contract: concatenating the
//   returned lines reproduces the input words (the joining space rides
//   every non-final line), a non-final line plus its reserved space stays
//   inside maxWidth at several widths, an over-wide word rides alone,
//   fittedLabels emits one label per line carrying that line's text, and
//   packRows reflows into bands without losing order, keeping every
//   multi-item band inside maxWidth while a lone item wider than the
//   stage rides alone (a band cannot shrink below its widest item).
// Rationale: tambor-0rp and the fit.ts split — each view once carried its
//   own copy of the wrap, and the bench copy pushed lines without their
//   trailing space, so concatenated drawn spans lost the separators
//   ("alphabeta"). That bug only appears under a measure where wrapping
//   fires, so this test injects one instead of trusting the headless
//   default (text_measure_injected: labels capture the active measure).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configureLabelMeasure,
  currentLabelMeasure,
  defaultMeasure,
  type Label,
  type MeasureFn,
} from "../src/views/nodes.ts";
import { fittedLabels, packRows, wrapText } from "../src/views/fit.ts";

// Real-ish metrics: 'alpha beta gamma delta' is 22 glyphs = 176 px, so an
// 80 px stage really wraps it; one space is 8 px.
const RICH: MeasureFn = (text) => [text.length * 8, 16];
const SPACE = RICH(" ")[0];

beforeEach(() => {
  configureLabelMeasure(RICH);
});

// The override rides process-wide module state (tambor-0rp) — restore the
// headless default so no other file sees the injected measure.
afterEach(() => {
  configureLabelMeasure(defaultMeasure);
});

describe("wrapText: the joining space is part of the rule", () => {
  it("concatenating the lines reproduces the input words", () => {
    const lines = wrapText("alpha beta gamma delta", 80);
    expect(lines.length).toBeGreaterThan(1);
    // every line but the last carries its separator, which is why join('')
    // reconstructs the input and join(' ') would double the spaces
    expect(lines.slice(0, -1).every((line) => line.endsWith(" "))).toBe(true);
    expect(lines.join("")).toBe("alpha beta gamma delta");
  });

  it("keeps every non-final line inside maxWidth", () => {
    const measure = currentLabelMeasure();
    const text = "one two three four five six seven eight";
    // every width exceeds the longest word (40 px) plus its separator, so
    // the string is genuinely breakable rather than riding alone
    for (const maxWidth of [48, 80, 120, 160]) {
      const lines = wrapText(text, maxWidth);
      expect(lines.join("")).toBe(text);
      for (const line of lines.slice(0, -1)) {
        // the returned line already carries its reserved separator; the
        // wrap's own test is content plus one space, so both readings fit
        expect(measure(line)[0]).toBeLessThanOrEqual(maxWidth);
        expect(measure(line.trimEnd())[0] + SPACE).toBeLessThanOrEqual(maxWidth);
      }
    }
  });

  it("returns an over-wide word alone", () => {
    // a line cannot shrink below its longest word
    expect(wrapText("supercalifragilistic", 80)).toEqual(["supercalifragilistic"]);
  });
});

describe("fittedLabels: one label per wrapped line", () => {
  it("carries each line's text into a label node", () => {
    const text = "alpha beta gamma delta";
    const lines = wrapText(text, 80);
    const labels = fittedLabels(text, 80).map((elem) => elem as Label);
    expect(labels.map((node) => node.type)).toEqual(lines.map(() => "label"));
    expect(labels.map((node) => node.text)).toEqual(lines);
    expect(labels.map((node) => node.text).join("")).toBe(text);
  });
});

describe("packRows: bands stay inside the stage", () => {
  it("keeps order, loses nothing, and never overfills a multi-item band", () => {
    // the 200 px cell is underivable from the stage: it rides alone
    const widths = [50, 50, 50, 50, 120, 200, 30, 60];
    const items = widths.map((_, index) => index);
    const maxWidth = 140;
    const bands = packRows(items, (item) => widths[item]!, maxWidth);
    expect(bands.flat()).toEqual(items);
    for (const band of bands) {
      const used = band.reduce((sum, item) => sum + widths[item]!, 0);
      if (used <= maxWidth) continue;
      // the documented exception: a single item wider than the stage
      // cannot shrink, so it gets its own band instead of overflowing one
      expect(band).toHaveLength(1);
    }
    for (const band of bands.filter((other) => other.length > 1)) {
      const used = band.reduce((sum, item) => sum + widths[item]!, 0);
      expect(used).toBeLessThanOrEqual(maxWidth);
    }
    // the over-wide case is actually exercised: the 200 px cell alone
    expect(bands.find((band) => band.includes(5))).toEqual([5]);
  });
});