// Purpose: executable contract tests for the ui-mobile spec's layout
//   rows — viewport-responsive reflow, no horizontal overflow, and
//   thumb-zone placement of primary actions.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/ui-mobile.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text). The
//   absolute-origin checks reuse locate() from src/ui/overflow.ts — the
//   corpus's own walker — instead of a re-implemented one. tambor-272:
//   redistributed from the former monolithic tests/ui-mobile.test.ts —
//   test names are byte-identical contract bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

import type { ButtonNode, Vec2 } from "../src/views/model.ts";
import { locate, overflowNodes } from "../src/ui/overflow.ts";
import { findAll } from "./helpers/scan.ts";
import {
  mobileTodoView,
  todoState,
  type TodoState,
} from "../src/ui/fixture_todo.ts";

// ---------------------------------------------------------------------------
// p_reflow — viewport_responsive
// ---------------------------------------------------------------------------

// p_reflow — derives_from: ui.mobile.viewport_responsive
// generator: widths 320 to 1024
// predicate: layout is valid at every width
it("p_reflow: layout is valid at every width", () => {
  const state: TodoState = todoState([
    { description: "first" },
    { description: "second" },
    { description: "third" },
  ]);
  fc.assert(
    fc.property(
      fc.integer({ min: 320, max: 1024 }),
      fc.integer({ min: 480, max: 2000 }),
      (w, h) => {
        const root = mobileTodoView(state, [w, h]);
        // Valid: the tree builds and nothing overflows the container.
        expect(root.view).toBeDefined();
        expect(overflowNodes(root.view, w, root.exempt)).toEqual([]);
      },
    ),
  );
});

// ---------------------------------------------------------------------------
// p_overflow — no_horizontal_overflow
// ---------------------------------------------------------------------------

// p_overflow — derives_from: ui.mobile.no_horizontal_overflow
// generator: width 320 and the todo app
// predicate: no node extends past the viewport
it("p_overflow: no node extends past the viewport", () => {
  // A long description overflows its row — the mobile root places it
  // inside a horizontal scrollview, the stated exemption.
  const root = mobileTodoView(todoState([{ description: "x".repeat(300) }]), [320, 640]);
  expect(overflowNodes(root.view, 320, root.exempt)).toEqual([]);
  // The scan is not vacuous: the same tree scanned without the
  // exemption reports the scrollview body's overflow.
  const raw = overflowNodes(root.view, 320, () => false);
  expect(raw.length).toBeGreaterThan(0);
  // And a tree without any wide content stays clean even unexempted.
  const plain = mobileTodoView(todoState([{ description: "short" }]), [320, 640]);
  expect(overflowNodes(plain.view, 320, () => false)).toEqual([]);
});

// ---------------------------------------------------------------------------
// p_thumb — thumb_zone_actions
// ---------------------------------------------------------------------------

// p_thumb — derives_from: ui.mobile.thumb_zone_actions
// generator: primary actions
// predicate: y of each is in the bottom third
it("p_thumb: y of each is in the bottom third", () => {
  const state = todoState([{ description: "first" }]);
  fc.assert(
    fc.property(
      fc.integer({ min: 320, max: 1024 }),
      fc.integer({ min: 480, max: 2000 }),
      (w, h) => {
        const root = mobileTodoView(state, [w, h]);
        const buttons = findAll(root.view, "button") as ButtonNode[];
        const primaries = buttons.filter((b) => b.text === "Add Todo");
        expect(primaries.length).toBeGreaterThan(0);
        for (const p of primaries) {
          const abs = locate(root.view, p);
          if (abs === null) throw new Error("target node not found in tree");
          expect(abs[1]).toBeGreaterThanOrEqual((2 * h) / 3);
        }
      },
    ),
  );
});
