// Purpose: executable contract tests for the ui-mobile spec's
//   selection-handles row — long-press word selection and the two
//   drag handles it yields.
// Responsibilities: encode the converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/ui-mobile/spec.md is the design authority; the predicate
//   here mirrors the Properties row (generator + predicate text).
//   tambor-272: redistributed from the former monolithic
//   tests/ui-mobile.test.ts — test names are byte-identical contract
//   bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  dragHandle,
  longPressSelection,
  selectionHandles,
} from "../src/ui/handles.ts";

// ---------------------------------------------------------------------------
// p_handles — selection_handles
// ---------------------------------------------------------------------------

// p_handles — derives_from: ui.mobile.selection_handles
// generator: long-press on a word
// predicate: the word is selected and two handles exist
it("p_handles: the word is selected and two handles exist", () => {
  // The spec's example: a long-press on a word of "hello world".
  const text = "hello world";
  const sel = longPressSelection(text, 7);
  expect(sel).toEqual({ start: 6, end: 11 });
  const handles = selectionHandles(text, sel);
  expect(handles).toHaveLength(2);
  expect(handles[0]!.which).toBe("start");
  expect(handles[1]!.which).toBe("end");
  expect(handles[0]!.index).toBe(6);
  expect(handles[1]!.index).toBe(11);

  // The handles feed the drag-selection path: dragging an end handle
  // to another index re-selects through that index.
  const dragged = dragHandle(text, sel, "end", 8);
  expect(dragged).toEqual({ start: 6, end: 8 });

  // Generalized property: for any word in any text, a long-press
  // inside it selects exactly that whitespace-bounded word and yields
  // exactly two handles at its edges.
  fc.assert(
    fc.property(
      fc.array(fc.string({ maxLength: 8 }).filter((s) => s.length > 0 && !/\s/.test(s)), {
        minLength: 1,
        maxLength: 5,
      }),
      fc.nat(4),
      (words, pick) => {
        const text2 = words.join(" ");
        const wordIndex = Math.min(pick, words.length - 1);
        // An index inside the chosen word.
        let start = 0;
        for (let i = 0; i < wordIndex; i++) start += words[i]!.length + 1;
        const idx = start + Math.floor(words[wordIndex]!.length / 2);
        const sel2 = longPressSelection(text2, idx);
        expect(text2.slice(sel2.start, sel2.end)).toBe(words[wordIndex]);
        const handles2 = selectionHandles(text2, sel2);
        expect(handles2).toHaveLength(2);
        expect(handles2[0]!.index).toBe(sel2.start);
        expect(handles2[1]!.index).toBe(sel2.end);
      },
    ),
  );
});
