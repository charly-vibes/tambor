// Purpose: executable contract tests for the typing.model spec — the
//   types-erased runtime property.
// Responsibilities: encode the converted row's generator and
//   predicate as a vitest + fast-check property: an annotated function
//   and its annotation-stripped twin must behave identically.
// Rationale: openspec/specs/typing-model/spec.md is the design authority; types
//   erase at runtime, so behaviour never depends on a type
//   (types_erased). tambor-272 redistributed the monolithic
//   tests/typing-model.test.ts into topic files, keeping every it
//   name byte-identical for the --testNamePattern contract bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

// p_erased — derives_from: typing.model.types_erased
// generator: strip annotations and rerun the behaviour suite —
// predicate: results are identical
it("p_erased: stripping the annotations leaves behaviour unchanged", () => {
  // the typed implementation…
  function typedLength(texts: readonly string[]): number {
    return texts.reduce((sum, text) => sum + text.length, 0);
  }
  // …and its annotation-stripped twin: the same body as plain
  // JavaScript, no annotations anywhere
  const erasedLength = new Function(
    "texts",
    "return texts.reduce(function (sum, text) { return sum + text.length; }, 0);",
  ) as (texts: readonly string[]) => number;
  fc.assert(
    fc.property(
      fc.array(fc.string({ maxLength: 8 }), { maxLength: 6 }),
      (texts) => {
        expect(erasedLength(texts)).toBe(typedLength(texts));
      },
    ),
  );
});
