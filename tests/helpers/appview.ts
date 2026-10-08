// Purpose: shared app-view click-point and toggle-option queries for
//   the root-corpus and example-todo contract tests.
// Responsibilities: centreOf computes the click point at a found node's
//   drawn centre; toggleOptionOf locates the toggle-option handler
//   whose subtree draws the label with the given option text.
// Rationale: specs/tambor.md and specs/example-todo.md are the design
//   authorities; tambor-272 redistributes the former monolithic
//   tests/tambor.test.ts into topic files, and these queries are used
//   by two or more of the resulting files, so they live here instead of
//   being duplicated. Every walker here reuses scanOf
//   (tests/helpers/scan.ts) rather than re-implementing a tree walk.

import { bounds, type Elem, type Label, type Vec2 } from "../../src/views/model.ts";
import { scanOf, type Found } from "./scan.ts";

// A click at the centre of a found node's drawn bounds.
export function centreOf(f: Found): Vec2 {
  const [w, h] = bounds(f.node);
  return [f.x + w / 2, f.y + h / 2];
}

// A toggle-option handler: the handler node whose subtree draws a
// label with the option's text.
function isOptionHandler(f: Found, text: string): boolean {
  return (
    f.node.type === "handler" &&
    scanOf(f.node as Elem).some(
      (g) => g.node.type === "label" && (g.node as Label).text === text,
    )
  );
}

// The toggle-option handler drawing the given label text, in document
// order (the order the filter row renders its options).
export function toggleOptionOf(view: Elem, text: string): Found {
  return scanOf(view).find((f) => isOptionHandler(f, text))!;
}
