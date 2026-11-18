// Purpose: the view layer's single text-fitting home — the one wrap rule
//   shared by the docs renderer and every example/bench view.
// Responsibilities: `wrapText` greedily wraps a string at spaces against
//   the live label measure, returning lines whose non-final entries keep
//   their joining space; `fittedLabels` turns those lines into one frozen
//   single-line label each; `packRows` greedily packs already-built items
//   into horizontal bands whose measured widths stay inside the width.
// Rationale: corpus labels are single-line by definition (tambor-0rp), so
//   the pure-realm answer to a line wider than its container is several
//   labels, not a CSS patch. Docs prose and demo rows both need that rule;
//   when each view carried its own copy the bench copy pushed the line
//   without its trailing space, so concatenated drawn spans lost the word
//   separators ("alphabeta"). Keeping the wrap here — the only wrap
//   implementation in the view layer — makes the preserved space part of
//   the rule rather than a per-caller detail. A word wider than maxWidth
//   rides alone as its own line (a line cannot shrink below its longest
//   word).

import {
  currentLabelMeasure,
  label,
  type Elem,
} from "./nodes.ts";
import { VIEWPORT } from "../spa/viewport.ts";

// Greedy word wrap against the live label measure. Every returned line but
// the last carries its joining trailing space, and the width test reserves
// that space too, so concatenating the lines reproduces the input words
// with their separators and no line can paint past maxWidth.
export function wrapText(
  text: string,
  maxWidth: number = VIEWPORT[0],
): string[] {
  const measure = currentLabelMeasure();
  if (measure(text)[0] <= maxWidth) return [text];
  const space = measure(" ")[0];
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (line === "" || measure(candidate)[0] + space <= maxWidth) {
      line = candidate;
    } else {
      lines.push(`${line} `);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

// One label per wrapped line, measured by the same renderer measure.
export function fittedLabels(
  text: string,
  maxWidth: number = VIEWPORT[0],
): Elem[] {
  return wrapText(text, maxWidth).map((line) => label(line));
}

// Greedy packing of already-built elements into horizontal bands whose
// measured widths stay inside the stage: the answer for grids and tile
// rows whose column count was tuned to the old 28 px buttons.
export function packRows<T>(
  items: readonly T[],
  widthOf: (item: T) => number,
  maxWidth: number = VIEWPORT[0],
): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  let used = 0;
  for (const item of items) {
    const width = widthOf(item);
    if (row.length > 0 && used + width > maxWidth) {
      rows.push(row);
      row = [item];
      used = width;
    } else {
      row.push(item);
      used += width;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}