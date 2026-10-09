// Purpose: executable contract tests for the components-textarea spec —
//   rendering (border_default, selection_drawn).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property;
//   count with-color nodes and detect with-style stroke requests across
//   the rendered tree.
// Rationale: openspec/specs/components-textarea/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every check encodes its row's stated
//   behavior. The tree scans reuse children()/isGroup() from
//   src/views/model.ts (the corpus's own tree queries) instead of
//   re-implementing the walk, and each walker keeps cyclomatic
//   complexity ≤ 3 by pushing each decision into its own small named
//   function. Shared harness helpers live in tests/helpers/textarea.ts
//   (tambor-272 redistributed the former monolithic
//   tests/components-textarea.test.ts into topic files).

import { expect, it } from "vitest";

import {
  BORDER_COLOR,
  CURSOR_COLOR,
  LIGHT_FILL,
  SELECTION_HIGHLIGHT,
  textarea,
  textareaBody,
} from "../src/components/textarea/textarea.ts";
import { bounds, children, isGroup, type Color, type Elem, type Node } from "../src/views/model.ts";
import { harnessState, propsOf, TEXT_PATH } from "./helpers/textarea.ts";

// Does a with-color node carry the given color?
function colorMatches(elem: Node, color: Color): boolean {
  return elem.type === "with-color" && JSON.stringify(elem.color) === JSON.stringify(color);
}

// One leaf node's contribution to the color count plus its children's.
// Children recurse through countColor so group children are handled.
function countColorIn(elem: Node, color: Color): number {
  const own = colorMatches(elem, color) ? 1 : 0;
  return own + children(elem).reduce((k, e) => k + countColor(e, color), 0);
}

// Walk a view tree and count the withColor nodes carrying a color.
function countColor(elem: Elem, color: Color): number {
  if (elem == null) return 0;
  if (isGroup(elem)) return elem.reduce((n, e) => n + countColor(e, color), 0);
  return countColorIn(elem, color);
}

// Does a node ask for a stroke?
function strokeAsked(elem: Node): boolean {
  return elem.type === "with-style" && elem.style === "stroke";
}

// One leaf node's stroke query or'd with its children's. Children
// recurse through hasStroke so group children are handled.
function hasStrokeIn(elem: Node): boolean {
  return strokeAsked(elem) || children(elem).some(hasStroke);
}

// True when the tree contains a withStyle node asking for a stroke.
function hasStroke(elem: Elem): boolean {
  if (elem == null) return false;
  if (isGroup(elem)) return elem.some(hasStroke);
  return hasStrokeIn(elem);
}

// p_border — derives_from: components.textarea.border_default
// generator: both variants
// predicate: bordered view is larger by 10 by 4 than its body and light has no stroke
it("p_border: bordered view is larger by 10 by 4 than its body and light has no stroke", () => {
  const state = harnessState("hello", { cursor: 2 }, TEXT_PATH);
  const body = textareaBody(propsOf(state));
  const [bw, bh] = bounds(body);
  expect([bw, bh]).toEqual([5, 1]);

  // the bordered variant is the default, with padding 5 on x and 2 on
  // y and a 0.65 gray stroke
  const bordered = textarea(propsOf(state));
  expect(bounds(bordered)).toEqual([bw + 10, bh + 4]);
  expect(countColor(bordered, BORDER_COLOR)).toBeGreaterThan(0);

  // the light variant has no border and a 0.97 gray fill
  const light = textarea(propsOf(state, { variant: "light" }));
  expect(hasStroke(light)).toBe(false);
  expect(countColor(light, LIGHT_FILL)).toBeGreaterThan(0);
});

// p_selection_drawn — derives_from: components.textarea.selection_drawn
// generator: selection present and focused
// predicate: highlight and cursor nodes exist
it("p_selection_drawn: highlight and cursor nodes exist", () => {
  // a selection draws a highlight over its range; a focused textarea
  // draws a translucent gray cursor
  const selected = textareaBody(propsOf(harnessState("hello", { cursor: 4, "select-cursor": 1 }, TEXT_PATH)));
  expect(countColor(selected, SELECTION_HIGHLIGHT)).toBeGreaterThan(0);
  expect(countColor(selected, CURSOR_COLOR)).toBeGreaterThan(0);

  // focused without a selection: only the cursor
  const noSelection = textareaBody(propsOf(harnessState("hello", {}, TEXT_PATH)));
  expect(countColor(noSelection, SELECTION_HIGHLIGHT)).toBe(0);
  expect(countColor(noSelection, CURSOR_COLOR)).toBeGreaterThan(0);

  // unfocused: no cursor (the corpus gates only the cursor on focus;
  // a selection draws its highlight regardless)
  const unfocused = textareaBody(propsOf(harnessState("hello", { cursor: 4, "select-cursor": 1 })));
  expect(countColor(unfocused, SELECTION_HIGHLIGHT)).toBeGreaterThan(0);
  expect(countColor(unfocused, CURSOR_COLOR)).toBe(0);
});
